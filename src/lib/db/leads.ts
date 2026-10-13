import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import type { Lead, LeadLog, LeadStatus, UserProfile, VerificationStatus, CaseType, PayoutPlan } from "@/types";
import { NotFoundError, BadRequestError } from "@/lib/api-response";
import { getInitialStatus, isValidTransition } from "@/lib/business/status-flow";
import { resolvePayoutRate } from "@/lib/business/payout-plans";
import { createPayoutInTransaction } from "@/lib/db/payouts";

function serializeLead(id: string, data: FirebaseFirestore.DocumentData): Lead {
  return {
    id,
    customerName: data.customerName,
    productType: data.productType,
    amount: data.amount,
    bank: data.bank,
    caseType: data.caseType,
    verificationStatus: data.verificationStatus ?? null,
    status: data.status,
    rejectionReason: data.rejectionReason ?? null,
    assignedTo: data.assignedTo,
    createdBy: data.createdBy,
    verifiedBy: data.verifiedBy ?? null,
    selectedPlan: data.selectedPlan,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt,
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? data.updatedAt,
  };
}

export async function createLead(input: {
  customerName: string;
  productType: string;
  amount: number;
  bank: string;
  caseType: CaseType;
  assignedTo: string;
  createdBy: string;
  selectedPlan: PayoutPlan;
}): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc();
  const now = FieldValue.serverTimestamp();

  await ref.set({
    ...input,
    verificationStatus: null,
    status: "LEAD_SUBMITTED",
    rejectionReason: null,
    verifiedBy: null,
    createdAt: now,
    updatedAt: now,
  });

  await ref.collection("logs").add({
    status: "LEAD_SUBMITTED",
    note: "Lead created",
    updatedBy: input.createdBy,
    timestamp: now,
  });

  const snap = await ref.get();
  return serializeLead(snap.id, snap.data()!);
}

export async function getLeadById(leadId: string): Promise<Lead> {
  const snap = await adminDb.collection(COLLECTIONS.leads).doc(leadId).get();
  if (!snap.exists) throw new NotFoundError("Lead not found");
  return serializeLead(snap.id, snap.data()!);
}

export interface LeadFilters {
  verificationStatus?: VerificationStatus;
  status?: string;
  caseType?: CaseType;
  search?: string;
  cursor?: string;
  limit: number;
}

/**
 * Lists leads scoped by the requesting user's role:
 *  - DSA/PARTNER only ever see leads they created (Section 5.4)
 *  - OPERATIONS/ADMIN see all leads, filterable
 * `search` does a simple prefix match on customerName (Firestore has no
 * full-text search; for production-scale search, pair with Algolia/Typesense).
 */
export async function listLeads(user: UserProfile, filters: LeadFilters) {
  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.leads);

  if (user.role === "DSA" || user.role === "PARTNER") {
    query = query.where("createdBy", "==", user.id);
  }
  if (filters.verificationStatus) {
    query = query.where("verificationStatus", "==", filters.verificationStatus);
  }
  if (filters.status) {
    query = query.where("status", "==", filters.status);
  }
  if (filters.caseType) {
    query = query.where("caseType", "==", filters.caseType);
  }
  if (filters.search) {
    query = query
      .orderBy("customerName")
      .startAt(filters.search)
      .endAt(filters.search + "\uf8ff");
  } else {
    query = query.orderBy("createdAt", "desc");
  }

  if (filters.cursor) {
    const cursorSnap = await adminDb.collection(COLLECTIONS.leads).doc(filters.cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  query = query.limit(filters.limit);
  const snap = await query.get();
  const items = snap.docs.map((d) => serializeLead(d.id, d.data()));
  const nextCursor = snap.docs.length === filters.limit ? snap.docs[snap.docs.length - 1].id : null;

  return { items, nextCursor };
}

export async function setVerificationStatus(
  leadId: string,
  verificationStatus: "RED" | "YELLOW" | "GREEN",
  verifiedBy: string,
  note?: string
): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) throw new NotFoundError("Lead not found");
  const lead = serializeLead(snap.id, snap.data()!);

  const now = FieldValue.serverTimestamp();
  const updates: Record<string, unknown> = {
    verificationStatus,
    verifiedBy,
    updatedAt: now,
  };

  // GREEN unlocks the case-type flow; the lead's status advances to that
  // flow's first stage (Section 5.1). RED/YELLOW leave `status` untouched.
  if (verificationStatus === "GREEN" && lead.status === "LEAD_SUBMITTED") {
    updates.status = getInitialStatus(lead.caseType);
  }

  await ref.update(updates);
  await ref.collection("logs").add({
    status: `VERIFICATION_${verificationStatus}`,
    note: note || `Verification set to ${verificationStatus}`,
    updatedBy: verifiedBy,
    timestamp: now,
  });

  const updatedSnap = await ref.get();
  return serializeLead(updatedSnap.id, updatedSnap.data()!);
}

/**
 * Moves a lead to its next case-type stage and, on DISBURSED, creates its
 * payout — all in one Firestore transaction, so a lead can never end up
 * DISBURSED without a payout (e.g. if the PERSONALIZED rate is missing),
 * and two concurrent requests can't both pass the transition check.
 *
 * Section 5.2: the lead must be verification-GREEN, and the transition
 * must follow the strict, in-order flow for its caseType.
 * Section 5.3: the payout rate comes from the plan chosen at lead creation;
 * for PERSONALIZED it's resolved from the creator's current profile.
 */
export async function transitionLeadStatus(
  leadId: string,
  nextStatus: LeadStatus,
  updatedBy: string,
  rejectionReason?: string,
  note?: string
): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc(leadId);

  await adminDb.runTransaction(async (tx) => {
    // Reads first — Firestore transactions require all reads before writes.
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundError("Lead not found");
    const lead = serializeLead(snap.id, snap.data()!);

    if (lead.verificationStatus !== "GREEN") {
      throw new BadRequestError(
        "Lead must be verification-GREEN before it can move through case-type stages"
      );
    }
    if (!isValidTransition(lead.caseType, lead.status, nextStatus)) {
      throw new BadRequestError(
        `Cannot move a ${lead.caseType} lead from ${lead.status} to ${nextStatus}. ` +
          "Stages must progress in order and cannot be skipped or reversed."
      );
    }

    let payoutRate: number | null = null;
    if (nextStatus === "DISBURSED") {
      let personalizedRate: number | null = null;
      if (lead.selectedPlan === "PERSONALIZED") {
        const creatorSnap = await tx.get(adminDb.collection(COLLECTIONS.users).doc(lead.createdBy));
        personalizedRate = creatorSnap.exists
          ? (creatorSnap.data()?.personalizedPayoutRate ?? null)
          : null;
      }
      payoutRate = resolvePayoutRate(lead.selectedPlan, personalizedRate);
      if (payoutRate == null) {
        throw new BadRequestError(
          "This lead's PERSONALIZED plan has no payout rate configured for the creator. Ask an admin to set one before disbursing."
        );
      }
    }

    // Payout first: its duplicate check is the last read, and it throws
    // before any write is staged.
    if (payoutRate != null) {
      await createPayoutInTransaction(tx, {
        leadId,
        createdBy: lead.createdBy,
        amount: lead.amount,
        payoutRate,
      });
    }

    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      status: nextStatus,
      rejectionReason: nextStatus === "REJECTED" ? rejectionReason : null,
      updatedAt: now,
    });
    tx.set(ref.collection("logs").doc(), {
      status: nextStatus,
      note: note || (nextStatus === "REJECTED" ? `Rejected: ${rejectionReason}` : `Moved to ${nextStatus}`),
      updatedBy,
      timestamp: now,
    });
  });

  const updatedSnap = await ref.get();
  return serializeLead(updatedSnap.id, updatedSnap.data()!);
}

export async function getLeadTimeline(leadId: string): Promise<LeadLog[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.leads)
    .doc(leadId)
    .collection("logs")
    .orderBy("timestamp", "asc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      status: data.status,
      note: data.note,
      updatedBy: data.updatedBy,
      timestamp: data.timestamp?.toDate?.().toISOString?.() ?? data.timestamp,
    };
  });
}
