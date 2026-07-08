import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import type { Payout, PayoutLog, PayoutStatus, UserProfile } from "@/types";
import { NotFoundError, ConflictError } from "@/lib/api-response";

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
 * Creates a payout for a lead. Section 5.3: only triggered when a lead's
 * status becomes DISBURSED; payoutAmount = amount * payoutRate. Guards
 * against creating a duplicate payout for the same lead.
 */
export async function createPayoutForLead(
  leadId: string,
  amount: number,
  payoutRate: number
): Promise<Payout> {
  const existing = await adminDb
    .collection(COLLECTIONS.payouts)
    .where("leadId", "==", leadId)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new ConflictError("A payout already exists for this lead");
  }

  const ref = adminDb.collection(COLLECTIONS.payouts).doc();
  const now = FieldValue.serverTimestamp();
  const payoutAmount = Number((amount * payoutRate).toFixed(2));

  await ref.set({
    leadId,
    payoutRate,
    payoutAmount,
    status: "PENDING",
    createdAt: now,
  });
  await ref.collection("logs").add({ status: "PENDING", timestamp: now });

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
 * DSA/PARTNER see only payouts tied to leads they created; ADMIN sees all.
 * Since `payouts` doesn't denormalize `createdBy`, we resolve the caller's
 * lead IDs first for non-admins.
 */
export async function listPayouts(user: UserProfile, filters: PayoutFilters) {
  let leadIdFilter: string[] | null = null;

  if (user.role === "DSA" || user.role === "PARTNER") {
    const leadsSnap = await adminDb
      .collection(COLLECTIONS.leads)
      .where("createdBy", "==", user.id)
      .get();
    leadIdFilter = leadsSnap.docs.map((d) => d.id);
    if (leadIdFilter.length === 0) return { items: [], nextCursor: null };
  }

  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.payouts);
  if (leadIdFilter) {
    // Firestore `in` supports up to 30 values; for an MVP with a moderate
    // per-partner lead count this is sufficient.
    query = query.where("leadId", "in", leadIdFilter.slice(0, 30));
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

  const results: { id: string; amount: number }[] = [];
  for (const doc of leadsSnap.docs) {
    const payoutSnap = await adminDb
      .collection(COLLECTIONS.payouts)
      .where("leadId", "==", doc.id)
      .limit(1)
      .get();
    if (payoutSnap.empty) {
      results.push({ id: doc.id, amount: doc.data().amount });
    }
  }
  return results;
}
