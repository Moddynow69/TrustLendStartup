/**
 * One-off backfill: copies each lead's `createdBy` onto its payout doc.
 * Payouts created before `createdBy` was denormalized onto them won't
 * appear in DSA/PARTNER payout lists until this has run.
 *
 * Usage:
 *   node scripts/backfill-payout-created-by.js
 *
 * Reads Firebase Admin credentials from .env.local. Safe to re-run: payouts
 * that already have `createdBy` are skipped.
 */

const path = require("path");
const admin = require("firebase-admin");
const dotenv = require("dotenv");

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
  const payouts = await db.collection("payouts").get();
  let updated = 0;
  let skipped = 0;
  let orphaned = 0;

  for (const doc of payouts.docs) {
    const data = doc.data();
    if (data.createdBy) {
      skipped++;
      continue;
    }
    const leadSnap = await db.collection("leads").doc(data.leadId).get();
    if (!leadSnap.exists) {
      console.warn(`Payout ${doc.id}: lead ${data.leadId} not found, leaving as-is`);
      orphaned++;
      continue;
    }
    await doc.ref.update({ createdBy: leadSnap.data().createdBy });
    updated++;
  }

  console.log(`Done. Updated ${updated}, already set ${skipped}, orphaned ${orphaned}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
