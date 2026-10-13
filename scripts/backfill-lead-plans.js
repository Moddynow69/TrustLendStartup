/**
 * One-off backfill: sets `selectedPlan` on leads created before payout
 * plans existed. Without a plan, a lead can't be disbursed (there's no way
 * to split the commission).
 *
 * Usage:
 *   node scripts/backfill-lead-plans.js <plan>           # dry run: lists what would change
 *   node scripts/backfill-lead-plans.js <plan> --apply   # writes the changes
 *
 * <plan> is one of the fixed plans: 50-50, 70-30, 90-10. Reads Firebase
 * Admin credentials from .env.local. Safe to re-run: leads that already
 * have a plan are never touched. Each updated lead gets an ADMIN_NOTE
 * timeline entry recording the change.
 */

const path = require("path");
const admin = require("firebase-admin");
const dotenv = require("dotenv");

const FIXED_PLANS = ["50-50", "70-30", "90-10"];
const plan = process.argv[2];
const apply = process.argv.includes("--apply");

if (!FIXED_PLANS.includes(plan)) {
  console.error(`Usage: node scripts/backfill-lead-plans.js <${FIXED_PLANS.join("|")}> [--apply]`);
  process.exit(1);
}

const envPath = path.resolve(__dirname, "..", ".env.local");
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error(`Could not read ${envPath}. Copy .env.example to .env.local and fill in Firebase Admin credentials first.`);
  process.exit(1);
}

// Same normalization as src/lib/firebase/admin.ts — see there for why.
function normalizePrivateKey(raw) {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!key.includes("\n") && key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }
  return key;
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "");

if (!projectId || !clientEmail || !privateKey.includes("BEGIN PRIVATE KEY")) {
  console.error(
    "Missing or invalid Firebase Admin credentials in .env.local " +
      "(FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY)."
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});
const db = admin.firestore();

async function main() {
  const leads = await db.collection("leads").get();
  const missing = leads.docs.filter((d) => !d.data().selectedPlan);

  console.log(`${missing.length} of ${leads.size} leads have no payout plan.`);
  for (const doc of missing) {
    const { customerName, status, amount } = doc.data();
    console.log(`  ${doc.id}  ${status.padEnd(14)} ₹${amount}  ${customerName}`);
  }

  if (!apply) {
    console.log(`\nDry run — nothing written. Re-run with --apply to set these to "${plan}".`);
    return;
  }

  for (const doc of missing) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.update(doc.ref, { selectedPlan: plan, updatedAt: now });
    batch.set(doc.ref.collection("logs").doc(), {
      status: "ADMIN_NOTE",
      note: `Payout plan set to ${plan} (backfill for leads created before payout plans)`,
      updatedBy: "system",
      timestamp: now,
    });
    await batch.commit();
  }
  console.log(`\nDone. Set ${missing.length} lead(s) to "${plan}".`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
