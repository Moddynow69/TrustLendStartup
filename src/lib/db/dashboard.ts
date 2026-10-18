import "server-only";
import { adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import type { DashboardStats, UserProfile } from "@/types";
import { canViewAllLeads, canViewAllPayouts } from "@/lib/business/permissions";
import { mineFilter } from "@/lib/db/leads";

/**
 * Exact dashboard counts via Firestore count() aggregations, which are
 * computed server-side from the indexes (billed at about one read per
 * 1,000 matching entries) instead of loading documents. Scoped like the
 * list endpoints: DSA/PARTNER count leads they created or are assigned to,
 * and payouts paid to them.
 */
export async function getDashboardStats(user: UserProfile): Promise<DashboardStats> {
  const leads = (): FirebaseFirestore.Query => {
    const q = adminDb.collection(COLLECTIONS.leads);
    return canViewAllLeads(user.role) ? q : q.where(mineFilter(user.id));
  };
  const payouts = (): FirebaseFirestore.Query => {
    const q = adminDb.collection(COLLECTIONS.payouts);
    return canViewAllPayouts(user.role) ? q : q.where("payeeId", "==", user.id);
  };
  const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;

  const [totalLeads, red, yellow, green, disbursed, rejected, pendingPayouts] = await Promise.all([
    count(leads()),
    count(leads().where("verificationStatus", "==", "RED")),
    count(leads().where("verificationStatus", "==", "YELLOW")),
    count(leads().where("verificationStatus", "==", "GREEN")),
    count(leads().where("status", "==", "DISBURSED")),
    count(leads().where("status", "==", "REJECTED")),
    count(payouts().where("status", "==", "PENDING")),
  ]);

  return { totalLeads, red, yellow, green, disbursed, rejected, pendingPayouts };
}
