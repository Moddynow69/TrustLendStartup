import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import type { Payout, PayoutLog, PayoutStatus, UserProfile } from "@/types";
import { NotFoundError, ConflictError, BadRequestError } from "@/lib/api-response";

function serializePayout(id: string, data: FirebaseFirestore.DocumentData): Payout {
  return {
    id,
    leadId: data.leadId,
    payoutRate: data.payoutRate,
    payoutAmount: data.payoutAmount,
    status: data.status,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt,
  };
}

/**
 * Stages a new payout (and its first log entry) inside an existing
 * transaction. Section 5.3: payoutAmount = amount * payoutRate. Guards
 * against a duplicate payout for the same lead — the duplicate check is a
 * transactional read, so two concurrent disbursals can't both pass it.
 *
 * Like every Firestore transaction, all reads must happen before any
 * writes: callers must do their own reads first, then call this.
 */
export async function createPayoutInTransaction(
  tx: FirebaseFirestore.Transaction,
  input: { leadId: string; createdBy: string; amount: number; payoutRate: number }
): Promise<FirebaseFirestore.DocumentReference> {
  const existing = await tx.get(
    adminDb.collection(COLLECTIONS.payouts).where("leadId", "==", input.leadId).limit(1)
  );
  if (!existing.empty) {
    throw new ConflictError("A payout already exists for this lead");
  }

  const ref = adminDb.collection(COLLECTIONS.payouts).doc();
  const now = FieldValue.serverTimestamp();
  tx.set(ref, {
    leadId: input.leadId,
    // Denormalized from the lead so DSA/PARTNER payout lists can filter on
    // it directly instead of resolving their lead IDs first.
    createdBy: input.createdBy,
    payoutRate: input.payoutRate,
    payoutAmount: Number((input.amount * input.payoutRate).toFixed(2)),
    status: "PENDING",
    createdAt: now,
  });
  tx.set(ref.collection("logs").doc(), { status: "PENDING", timestamp: now });
  return ref;
}

/**
 * Manual/administrative payout creation for an already-DISBURSED lead.
 * The lead read, DISBURSED check, duplicate check and writes all happen in
 * one transaction.
 */
export async function createPayoutForLead(leadId: string, payoutRate: number): Promise<Payout> {
  const ref = await adminDb.runTransaction(async (tx) => {
    const leadSnap = await tx.get(adminDb.collection(COLLECTIONS.leads).doc(leadId));
    if (!leadSnap.exists) throw new NotFoundError("Lead not found");
    const lead = leadSnap.data()!;
    if (lead.status !== "DISBURSED") {
      throw new BadRequestError("Payouts can only be created for DISBURSED leads");
    }
    return createPayoutInTransaction(tx, {
      leadId,
      createdBy: lead.createdBy,
      amount: lead.amount,
      payoutRate,
    });
  });

  const snap = await ref.get();
  return serializePayout(snap.id, snap.data()!);
}

export async function getPayoutById(payoutId: string): Promise<Payout> {
  const snap = await adminDb.collection(COLLECTIONS.payouts).doc(payoutId).get();
  if (!snap.exists) throw new NotFoundError("Payout not found");
  return serializePayout(snap.id, snap.data()!);
}

export interface PayoutFilters {
  status?: PayoutStatus;
  cursor?: string;
  limit: number;
}

/**
 * DSA/PARTNER see only payouts tied to leads they created (via the
 * denormalized `createdBy`); ADMIN sees all.
 */
export async function listPayouts(user: UserProfile, filters: PayoutFilters) {
  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.payouts);
  if (user.role === "DSA" || user.role === "PARTNER") {
    query = query.where("createdBy", "==", user.id);
  }
  if (filters.status) {
    query = query.where("status", "==", filters.status);
  }
  query = query.orderBy("createdAt", "desc");

  if (filters.cursor) {
    const cursorSnap = await adminDb.collection(COLLECTIONS.payouts).doc(filters.cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  query = query.limit(filters.limit);
  const snap = await query.get();
  const items = snap.docs.map((d) => serializePayout(d.id, d.data()));
  const nextCursor = snap.docs.length === filters.limit ? snap.docs[snap.docs.length - 1].id : null;

  return { items, nextCursor };
}

export async function updatePayoutStatus(payoutId: string, status: PayoutStatus): Promise<Payout> {
  const ref = adminDb.collection(COLLECTIONS.payouts).doc(payoutId);
  const snap = await ref.get();
  if (!snap.exists) throw new NotFoundError("Payout not found");

  const now = FieldValue.serverTimestamp();
  await ref.update({ status });
  await ref.collection("logs").add({ status, timestamp: now });

  const updated = await ref.get();
  return serializePayout(updated.id, updated.data()!);
}

export async function getPayoutTimeline(payoutId: string): Promise<PayoutLog[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.payouts)
    .doc(payoutId)
    .collection("logs")
    .orderBy("timestamp", "asc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      status: data.status,
      timestamp: data.timestamp?.toDate?.().toISOString?.() ?? data.timestamp,
    };
  });
}

/** Finds all DISBURSED leads that don't yet have a payout record. */
export async function findDisbursedLeadsWithoutPayout() {
  const leadsSnap = await adminDb
    .collection(COLLECTIONS.leads)
    .where("status", "==", "DISBURSED")
    .get();

  const results: { id: string }[] = [];
  for (const doc of leadsSnap.docs) {
    const payoutSnap = await adminDb
      .collection(COLLECTIONS.payouts)
      .where("leadId", "==", doc.id)
      .limit(1)
      .get();
    if (payoutSnap.empty) {
      results.push({ id: doc.id });
    }
  }
  return results;
}
