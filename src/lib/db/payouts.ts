import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import type { Payout, PayoutLog, PayoutPlan, PayoutStatus, UserProfile } from "@/types";
import { NotFoundError, ConflictError, BadRequestError } from "@/lib/api-response";
import { calculatePayout, resolveAdminShare } from "@/lib/business/payout-plans";

function serializePayout(id: string, data: FirebaseFirestore.DocumentData): Payout {
  return {
    id,
    leadId: data.leadId,
    // Absent on payouts created before commission-based payouts existed.
    commissionRate: typeof data.commissionRate === "number" ? data.commissionRate : null,
    commissionAmount: typeof data.commissionAmount === "number" ? data.commissionAmount : null,
    payoutRate: data.payoutRate,
    payoutAmount: data.payoutAmount,
    status: data.status,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt,
  };
}

/**
 * Reads (inside a transaction) the admin's share of the commission for a
 * lead's plan. PERSONALIZED resolves from the lead creator's current
 * profile, since an admin may have changed it after the lead was submitted.
 */
export async function readAdminShareInTransaction(
  tx: FirebaseFirestore.Transaction,
  lead: { selectedPlan: PayoutPlan; createdBy: string }
): Promise<number> {
  // Leads created before payout plans existed have no selectedPlan.
  if (!lead.selectedPlan) {
    throw new BadRequestError(
      "This lead has no payout plan. Set one (npm run backfill:lead-plans) before disbursing."
    );
  }
  let personalizedRate: number | null = null;
  if (lead.selectedPlan === "PERSONALIZED") {
    const creatorSnap = await tx.get(adminDb.collection(COLLECTIONS.users).doc(lead.createdBy));
    personalizedRate = creatorSnap.exists
      ? (creatorSnap.data()?.personalizedPayoutRate ?? null)
      : null;
  }
  const adminShare = resolveAdminShare(lead.selectedPlan, personalizedRate);
  if (adminShare == null) {
    throw new BadRequestError(
      "This lead's PERSONALIZED plan has no payout rate configured for the creator. Ask an admin to set one before disbursing."
    );
  }
  return adminShare;
}

/**
 * Stages a new payout (and its first log entry) inside an existing
 * transaction; amounts come from `calculatePayout`. Guards against a
 * duplicate payout for the same lead — the duplicate check is a
 * transactional read, so two concurrent disbursals can't both pass it.
 *
 * Like every Firestore transaction, all reads must happen before any
 * writes: callers must do their own reads first, then call this.
 */
export async function createPayoutInTransaction(
  tx: FirebaseFirestore.Transaction,
  input: {
    leadId: string;
    createdBy: string;
    amount: number;
    commissionRate: number;
    adminShare: number;
  }
): Promise<FirebaseFirestore.DocumentReference> {
  const existing = await tx.get(
    adminDb.collection(COLLECTIONS.payouts).where("leadId", "==", input.leadId).limit(1)
  );
  if (!existing.empty) {
    throw new ConflictError("A payout already exists for this lead");
  }

  const { commissionAmount, payoutRate, payoutAmount } = calculatePayout(
    input.amount,
    input.commissionRate,
    input.adminShare
  );

  const ref = adminDb.collection(COLLECTIONS.payouts).doc();
  const now = FieldValue.serverTimestamp();
  tx.set(ref, {
    leadId: input.leadId,
    // Denormalized from the lead so DSA/PARTNER payout lists can filter on
    // it directly instead of resolving their lead IDs first.
    createdBy: input.createdBy,
    commissionRate: input.commissionRate,
    commissionAmount,
    payoutRate,
    payoutAmount,
    status: "PENDING",
    createdAt: now,
  });
  tx.set(ref.collection("logs").doc(), { status: "PENDING", timestamp: now });
  return ref;
}

/**
 * Manual/administrative payout creation for an already-DISBURSED lead that
 * has none (e.g. one disbursed before payouts were created atomically).
 * The lead read, DISBURSED check, duplicate check and writes all happen in
 * one transaction. `commissionRate` is a 0-1 decimal.
 */
export async function createPayoutForLead(leadId: string, commissionRate: number): Promise<Payout> {
  const ref = await adminDb.runTransaction(async (tx) => {
    const leadSnap = await tx.get(adminDb.collection(COLLECTIONS.leads).doc(leadId));
    if (!leadSnap.exists) throw new NotFoundError("Lead not found");
    const lead = leadSnap.data()!;
    if (lead.status !== "DISBURSED") {
      throw new BadRequestError("Payouts can only be created for DISBURSED leads");
    }
    const adminShare = await readAdminShareInTransaction(tx, {
      selectedPlan: lead.selectedPlan,
      createdBy: lead.createdBy,
    });
    return createPayoutInTransaction(tx, {
      leadId,
      createdBy: lead.createdBy,
      amount: lead.amount,
      commissionRate,
      adminShare,
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
