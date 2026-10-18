import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import { Filter } from "firebase-admin/firestore";
import { canViewAllLeads } from "@/lib/business/permissions";
import type { Lead, LeadLog, LeadStatus, UserProfile, VerificationStatus, CaseType, PayoutPlan } from "@/types";
import { NotFoundError, BadRequestError } from "@/lib/api-response";
import { getInitialStatus, isTerminalStatus, isValidTransition, STATUS_LABELS } from "@/lib/business/status-flow";
import { allowedVerificationColors, verificationRejectsLead } from "@/lib/business/verification";
import { createPayoutInTransaction, readAdminShareInTransaction } from "@/lib/db/payouts";

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

/** New leads are assigned to their creator; an Admin can reassign later. */
export async function createLead(input: {
  customerName: string;
  productType: string;
  amount: number;
  bank: string;
  caseType: CaseType;
  createdBy: string;
  selectedPlan: PayoutPlan;
}): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc();
  const now = FieldValue.serverTimestamp();

  // One batch, so a lead never exists without its "Lead created" entry.
  const batch = adminDb.batch();
  batch.set(ref, {
    ...input,
    assignedTo: input.createdBy,
    verificationStatus: null,
    status: "LEAD_SUBMITTED",
    rejectionReason: null,
    verifiedBy: null,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(ref.collection("logs").doc(), {
    status: "LEAD_SUBMITTED",
    note: "Lead created",
    updatedBy: input.createdBy,
    timestamp: now,
  });
  await batch.commit();

  const snap = await ref.get();
  return serializeLead(snap.id, snap.data()!);
}

export async function getLeadById(leadId: string): Promise<Lead> {
  const snap = await adminDb.collection(COLLECTIONS.leads).doc(leadId).get();
  if (!snap.exists) throw new NotFoundError("Lead not found");
  return serializeLead(snap.id, snap.data()!);
}

/** Leads a DSA/PARTNER can see: ones they created or are assigned to. */
export function mineFilter(userId: string) {
  return Filter.or(Filter.where("createdBy", "==", userId), Filter.where("assignedTo", "==", userId));
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
 *  - DSA/PARTNER see leads they created or are assigned to (Section 5.4)
 *  - OPERATIONS/ADMIN see all leads, filterable
 * `search` does a simple prefix match on customerName (Firestore has no
 * full-text search; for production-scale search, pair with Algolia/Typesense).
 */
export async function listLeads(user: UserProfile, filters: LeadFilters) {
  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.leads);

  if (!canViewAllLeads(user.role)) {
    query = query.where(mineFilter(user.id));
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

/**
 * Sets a lead's verification colour, in one transaction so the rule check
 * and the write can't interleave with an Admin moving the lead's status.
 * Rules (see lib/business/verification.ts):
 *  - LEAD_SUBMITTED: any colour; GREEN starts the case-type flow.
 *  - In the stage flow: RED rejects the lead (status -> REJECTED, `note`
 *    required as the rejection reason); GREEN is allowed to restore a lead;
 *    YELLOW is refused.
 *  - DISBURSED / REJECTED: refused — the lead is closed.
 */
export async function setVerificationStatus(
  leadId: string,
  verificationStatus: "RED" | "YELLOW" | "GREEN",
  verifiedBy: string,
  note?: string
): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc(leadId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundError("Lead not found");
    const lead = serializeLead(snap.id, snap.data()!);
    const statusLabel = STATUS_LABELS[lead.status] ?? lead.status;

    if (!allowedVerificationColors(lead.status).includes(verificationStatus)) {
      throw new BadRequestError(
        lead.status === "DISBURSED" || lead.status === "REJECTED"
          ? `This lead is closed (${statusLabel}), so its verification can't be changed.`
          : `A lead already in the lender stages (${statusLabel}) can't be marked Docs pending. ` +
              "Set it to Red to reject it instead."
      );
    }

    const rejects = verificationRejectsLead(lead.status, verificationStatus);
    const reason = note?.trim();
    if (rejects && !reason) {
      throw new BadRequestError(
        `Setting Red on a lead at ${statusLabel} rejects it. Enter the reason for rejection.`
      );
    }

    const now = FieldValue.serverTimestamp();
    const updates: FirebaseFirestore.DocumentData = {
      verificationStatus,
      verifiedBy,
      updatedAt: now,
    };

    // GREEN unlocks the case-type flow; the lead's status advances to that
    // flow's first stage (Section 5.1).
    if (verificationStatus === "GREEN" && lead.status === "LEAD_SUBMITTED") {
      updates.status = getInitialStatus(lead.caseType);
    }
    if (rejects) {
      updates.status = "REJECTED";
      updates.rejectionReason = reason;
    }

    tx.update(ref, updates);
    tx.set(ref.collection("logs").doc(), {
      status: `VERIFICATION_${verificationStatus}`,
      note: note || `Verification set to ${verificationStatus}`,
      updatedBy: verifiedBy,
      timestamp: now,
    });
    if (rejects) {
      tx.set(ref.collection("logs").doc(), {
        status: "REJECTED",
        note: `Rejected at verification (was ${statusLabel}): ${reason}`,
        updatedBy: verifiedBy,
        timestamp: now,
      });
    }
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
 * Section 5.3: moving to DISBURSED requires `commissionRate` (the lender's
 * commission on this case, a 0-1 decimal); the lead's plan then splits that
 * commission and the payout records the DSA/PARTNER's share.
 */
export async function transitionLeadStatus(
  leadId: string,
  nextStatus: LeadStatus,
  updatedBy: string,
  options: { rejectionReason?: string; note?: string; commissionRate?: number } = {}
): Promise<Lead> {
  const { rejectionReason, note, commissionRate } = options;
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

    if (nextStatus === "DISBURSED") {
      if (commissionRate == null) {
        throw new BadRequestError("Enter the lender's commission rate to disburse this lead");
      }
      // The lead's current assignee is paid (and their personalized rate applies).
      const payeeId = lead.assignedTo ?? lead.createdBy;
      const adminShare = await readAdminShareInTransaction(tx, {
        selectedPlan: lead.selectedPlan,
        payeeId,
      });
      // Payout before the lead writes: its duplicate check is the last read,
      // and it throws before any write is staged.
      await createPayoutInTransaction(tx, {
        leadId,
        createdBy: lead.createdBy,
        payeeId,
        amount: lead.amount,
        commissionRate,
        adminShare,
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

/**
 * Reassigns a lead to another DSA/PARTNER (Admin only). The new assignee
 * sees the lead alongside its creator, and is paid if it's disbursed while
 * assigned to them. Checked and written in one transaction:
 *  - the lead must still be open (not DISBURSED/REJECTED)
 *  - the assignee must be an active DSA or PARTNER
 *  - on the PERSONALIZED plan, the assignee needs a personalized rate,
 *    or disbursal would fail later
 */
export async function reassignLead(
  leadId: string,
  assigneeId: string,
  updatedBy: string,
  note?: string
): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc(leadId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundError("Lead not found");
    const lead = serializeLead(snap.id, snap.data()!);

    if (isTerminalStatus(lead.status)) {
      throw new BadRequestError(
        `This lead is closed (${STATUS_LABELS[lead.status] ?? lead.status}), so it can't be reassigned.`
      );
    }
    if (lead.assignedTo === assigneeId) {
      throw new BadRequestError("This lead is already assigned to that person.");
    }

    const users = adminDb.collection(COLLECTIONS.users);
    const [toSnap, fromSnap] = await tx.getAll(users.doc(assigneeId), users.doc(lead.assignedTo));
    if (!toSnap.exists) throw new NotFoundError("User not found");
    const to = toSnap.data()!;
    if (to.role !== "DSA" && to.role !== "PARTNER") {
      throw new BadRequestError("Leads can only be assigned to DSA or Partner accounts.");
    }
    if (!to.isActive) {
      throw new BadRequestError(`${to.name}'s account is disabled.`);
    }
    if (lead.selectedPlan === "PERSONALIZED" && typeof to.personalizedPayoutRate !== "number") {
      throw new BadRequestError(
        `This lead uses the Personalized plan, and ${to.name} has no personalized rate. ` +
          "Set one in User Management first."
      );
    }

    const fromName = fromSnap.exists ? fromSnap.data()!.name : "an unknown user";
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { assignedTo: assigneeId, updatedAt: now });
    tx.set(ref.collection("logs").doc(), {
      status: "REASSIGNED",
      note: `Reassigned from ${fromName} to ${to.name}${note?.trim() ? `: ${note.trim()}` : ""}`,
      updatedBy,
      timestamp: now,
    });
  });

  return getLeadById(leadId);
}

/** Display names for a lead's creator and assignee (null if the user is gone). */
export async function getLeadPeople(lead: Pick<Lead, "createdBy" | "assignedTo">) {
  const users = adminDb.collection(COLLECTIONS.users);
  const [creator, assignee] = await adminDb.getAll(users.doc(lead.createdBy), users.doc(lead.assignedTo));
  return {
    createdByName: creator.exists ? (creator.data()!.name as string) : null,
    assignedToName: assignee.exists ? (assignee.data()!.name as string) : null,
  };
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
