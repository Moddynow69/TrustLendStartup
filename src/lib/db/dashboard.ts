import "server-only";
import { adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import type { DashboardStats, UserProfile } from "@/types";

/**
 * Exact dashboard counts via Firestore count() aggregations, which are
 * computed server-side from the indexes (billed at about one read per
 * 1,000 matching entries) instead of loading documents. Scoped like the
 * list endpoints: DSA/PARTNER count only their own leads and payouts.
 */
export async function getDashboardStats(user: UserProfile): Promise<DashboardStats> {
  const ownOnly = user.role === "DSA" || user.role === "PARTNER";
  const leads = (): FirebaseFirestore.Query => {
    const q = adminDb.collection(COLLECTIONS.leads);
    return ownOnly ? q.where("createdBy", "==", user.id) : q;
  };
  const payouts = (): FirebaseFirestore.Query => {
    const q = adminDb.collection(COLLECTIONS.payouts);
    return ownOnly ? q.where("createdBy", "==", user.id) : q;
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
