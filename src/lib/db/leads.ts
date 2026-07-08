import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import type { Lead, LeadLog, LeadStatus, UserProfile, VerificationStatus, CaseType } from "@/types";
import { NotFoundError } from "@/lib/api-response";
import { getInitialStatus } from "@/lib/business/status-flow";

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

export async function updateLeadStatus(
  leadId: string,
  nextStatus: LeadStatus,
  updatedBy: string,
  rejectionReason?: string,
  note?: string
): Promise<Lead> {
  const ref = adminDb.collection(COLLECTIONS.leads).doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) throw new NotFoundError("Lead not found");

  const now = FieldValue.serverTimestamp();
  await ref.update({
    status: nextStatus,
    rejectionReason: nextStatus === "REJECTED" ? rejectionReason : null,
    updatedAt: now,
  });

  await ref.collection("logs").add({
    status: nextStatus,
    note: note || (nextStatus === "REJECTED" ? `Rejected: ${rejectionReason}` : `Moved to ${nextStatus}`),
    updatedBy,
    timestamp: now,
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
