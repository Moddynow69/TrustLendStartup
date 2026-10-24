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
 * Each new account gets a random password, printed once at the end: save
 * it, then change it after first login. Nothing is hard-coded, because this
 * repository is public.
 *
 * Safe to re-run: accounts that already exist are left exactly as they are
 * (password, role and profile untouched).
 */

const path = require("path");
const crypto = require("crypto");
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
  { name: "Admin", username: "admin", role: "ADMIN" },
  { name: "DSA", username: "dsa", role: "DSA" },
];

/** 16 characters with letters and digits, so it meets the app's password rule. */
function randomPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Returns the new password, or null if the account already existed. */
async function createAccountIfMissing({ name, username, role }) {
  const email = usernameToSyntheticEmail(username);

  try {
    await auth.getUserByEmail(email);
    console.log(`"${username}" already exists, left unchanged.`);
    return null;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
  }

  const password = randomPassword();
  const userRecord = await auth.createUser({ email, password, displayName: name, disabled: false });
  console.log(`Created auth user for "${username}" (${email})`);

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
  return password;
}

(async () => {
  const created = [];
  for (const account of ACCOUNTS) {
    const password = await createAccountIfMissing(account);
    if (password) created.push({ ...account, password });
  }
  if (created.length === 0) {
    console.log("Done. No new accounts were needed.");
  } else {
    console.log("Done. New accounts (this is the only time these passwords are shown; change them after first login):");
    for (const a of created) console.log(`  - ${a.username} / ${a.password} (${a.role})`);
  }
  process.exit(0);
})().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
