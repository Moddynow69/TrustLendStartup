/**
 * Seeds the two starter accounts (Admin + DSA) directly via the Firebase
 * Admin SDK — both in Firebase Auth and in the matching Firestore `users`
 * profile doc, exactly as the app's own /api/admin/users route would.
 *
 * Usage:
 *   node scripts/seed-users.js
 *
 * Reads credentials from .env.local (same file the app itself uses), so
 * make sure FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL /
 * FIREBASE_ADMIN_PRIVATE_KEY are already set there before running this.
 *
 * Safe to re-run: if a username already exists, its password/profile are
 * updated in place instead of failing on a duplicate.
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

const INTERNAL_DOMAIN = process.env.AUTH_INTERNAL_EMAIL_DOMAIN || "loanbandhu.internal";

function usernameToSyntheticEmail(username) {
  return `${username.trim().toLowerCase()}@${INTERNAL_DOMAIN}`;
}

function normalizePrivateKey(raw) {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Strip Windows CRLF / stray carriage returns — see admin.ts for why this
  // matters (OpenSSL 3.x rejects PEM text containing them with an opaque
  // "DECODER routines::unsupported" error instead of a clear PEM error).
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

// Masked sanity check — doesn't print the secret, just enough to confirm
// the PEM structure survived parsing. A correctly-parsed key has 3+ lines
// (BEGIN header, one or more body lines, END footer).
const lineCount = privateKey.split("\n").length;
console.log(
  `Parsed private key: starts with "${privateKey.slice(0, 27)}", ` +
    `ends with "${privateKey.slice(-25).trimEnd()}", ${lineCount} lines.`
);
if (lineCount < 3) {
  console.warn(
    "Warning: that's suspiciously few lines for a PEM key — it may have been " +
      "flattened onto one line. If the next step fails with a key/JWT error, " +
      "re-check how FIREBASE_ADMIN_PRIVATE_KEY is quoted in .env.local."
  );
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const auth = admin.auth();
const db = admin.firestore();

// --- accounts to seed ---
const ACCOUNTS = [
  { name: "Admin", username: "admin", password: "ADMINLOCK", role: "ADMIN" },
  { name: "DSA", username: "dsa", password: "JustDoIt", role: "DSA" },
];

async function upsertAccount({ name, username, password, role }) {
  const email = usernameToSyntheticEmail(username);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password, displayName: name, disabled: false });
    console.log(`Updated existing auth user for "${username}" (${email})`);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    });
    console.log(`Created auth user for "${username}" (${email})`);
  }

  await db.collection("users").doc(userRecord.uid).set(
    {
      name,
      email,
      username: username.toLowerCase(),
      role,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: null,
    },
    { merge: true }
  );
  console.log(`Wrote Firestore profile for "${username}" with role ${role}\n`);
}

(async () => {
  for (const account of ACCOUNTS) {
    await upsertAccount(account);
  }
  console.log("Done. You can now log in with:");
  for (const a of ACCOUNTS) {
    console.log(`  - ${a.username} / ${a.password} (${a.role})`);
  }
  process.exit(0);
})().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
