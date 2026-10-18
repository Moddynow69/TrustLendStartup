import "server-only";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import type { Payout, PayoutLog, PayoutPlan, PayoutStatus, UserProfile } from "@/types";
import { canViewAllPayouts } from "@/lib/business/permissions";
import { NotFoundError, ConflictError, BadRequestError } from "@/lib/api-response";
import { calculatePayout, resolveAdminShare } from "@/lib/business/payout-plans";
import { isValidPayoutTransition, PAYOUT_STATUS_LABELS } from "@/lib/business/payout-status";

function serializePayout(id: string, data: FirebaseFirestore.DocumentData): Payout {
  return {
    id,
    leadId: data.leadId,
    // Payouts created before reassignment existed were always paid to the
    // lead's creator, which is what their `createdBy` holds.
    payeeId: data.payeeId ?? data.createdBy ?? null,
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
 * lead's plan. PERSONALIZED resolves from the payee's current profile (the
 * lead's assignee), since an admin may have changed it after submission.
 */
export async function readAdminShareInTransaction(
  tx: FirebaseFirestore.Transaction,
  lead: { selectedPlan: PayoutPlan; payeeId: string }
): Promise<number> {
  // Leads created before payout plans existed have no selectedPlan.
  if (!lead.selectedPlan) {
    throw new BadRequestError(
      "This lead has no payout plan. Set one (npm run backfill:lead-plans) before disbursing."
    );
  }
  let personalizedRate: number | null = null;
  if (lead.selectedPlan === "PERSONALIZED") {
    const payeeSnap = await tx.get(adminDb.collection(COLLECTIONS.users).doc(lead.payeeId));
    personalizedRate = payeeSnap.exists
      ? (payeeSnap.data()?.personalizedPayoutRate ?? null)
      : null;
  }
  const adminShare = resolveAdminShare(lead.selectedPlan, personalizedRate);
  if (adminShare == null) {
    throw new BadRequestError(
      "This lead's PERSONALIZED plan has no payout rate configured for the person it's assigned to. Set one in User Management before disbursing."
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
    /** The lead's creator, kept for history. */
    createdBy: string;
    /** Who is paid: the lead's assignee at disbursal. */
    payeeId: string;
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
    createdBy: input.createdBy,
    // DSA/PARTNER payout lists and access checks filter on this directly.
    payeeId: input.payeeId,
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
    const payeeId = lead.assignedTo ?? lead.createdBy;
    const adminShare = await readAdminShareInTransaction(tx, {
      selectedPlan: lead.selectedPlan,
      payeeId,
    });
    return createPayoutInTransaction(tx, {
      leadId,
      createdBy: lead.createdBy,
      payeeId,
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
 * DSA/PARTNER see only payouts paid to them; ADMIN and OPERATIONS see all
 * (OPERATIONS read-only).
 */
export async function listPayouts(user: UserProfile, filters: PayoutFilters) {
  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.payouts);
  if (!canViewAllPayouts(user.role)) {
    query = query.where("payeeId", "==", user.id);
  }
  if (filters.status) {
    query = query.where("status", "==", filters.status);
  }
  query = query.orderBy("createdAt", "desc");

  if (filters.cursor) {
    const cursorSnap = await adminDb.collection(COLLECTIONS.payouts).doc(filters.cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  // Fetch one extra row: if it exists there's a next page, so the last page
  // never ends with an empty "Next".
  query = query.limit(filters.limit + 1);
  const snap = await query.get();
  const pageDocs = snap.docs.slice(0, filters.limit);
  const items = pageDocs.map((d) => serializePayout(d.id, d.data()));
  const nextCursor = snap.docs.length > filters.limit ? pageDocs[pageDocs.length - 1].id : null;

  return { items, nextCursor };
}

/**
 * Moves a payout to `status` if the move is allowed (see
 * lib/business/payout-status.ts; PAID is final). The check, the update and
 * the timeline entry recording who made the change happen in one
 * transaction.
 */
export async function updatePayoutStatus(
  payoutId: string,
  status: PayoutStatus,
  updatedBy: string
): Promise<Payout> {
  const ref = adminDb.collection(COLLECTIONS.payouts).doc(payoutId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundError("Payout not found");
    const current = snap.data()!.status as PayoutStatus;

    if (!isValidPayoutTransition(current, status)) {
      throw new BadRequestError(
        current === "PAID"
          ? "This payout is already paid and can't be changed."
          : `A payout can't move from ${PAYOUT_STATUS_LABELS[current]} to ${PAYOUT_STATUS_LABELS[status]}.`
      );
    }

    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status });
    tx.set(ref.collection("logs").doc(), { status, updatedBy, timestamp: now });
  });

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
      // Absent on the initial PENDING entry and on entries written before
      // payout changes were attributed.
      updatedBy: data.updatedBy ?? null,
      timestamp: data.timestamp?.toDate?.().toISOString?.() ?? data.timestamp,
    };
  });
}
