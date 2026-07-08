import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  // Strip a single layer of wrapping quotes if the env var was pasted with them.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Normalize Windows-style line endings. A PEM key pasted as a real
  // multi-line value into a CRLF-saved .env.local ends up with a stray "\r"
  // before every "\n" (and sometimes a trailing lone "\r"). Node's OpenSSL 3.x
  // PEM decoder rejects that outright with an opaque
  // "error:1E08010C:DECODER routines::unsupported" instead of a clear
  // "invalid PEM" message, so this must be cleaned up unconditionally.
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // If the value doesn't already contain real newlines, turn literal "\n"
  // sequences into actual line breaks (the standard way private keys are
  // stored in a single-line env var).
  if (!key.includes("\n") && key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  // Support pasting the whole key as base64 (no dashes/newlines at all) —
  // e.g. `base64 -w 0 key.pem` output — which some hosts prefer for env vars.
  if (!key.includes("BEGIN PRIVATE KEY")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) key = decoded;
    } catch {
      // not base64 either; fall through and let cert() surface the real error
    }
  }

  return key;
}

function buildAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  const privateKey = normalizePrivateKey(rawPrivateKey);

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_ADMIN_PRIVATE_KEY does not look like a valid PEM key. " +
        "Copy the 'private_key' field from your Firebase service account JSON " +
        "exactly as-is, wrap it in double quotes in .env.local, and keep its " +
        "literal \\n sequences — see .env.example for the expected format."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const adminApp = buildAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export { FieldValue, Timestamp };

// Firestore collection name constants to avoid magic strings across API routes.
export const COLLECTIONS = {
  users: "users",
  leads: "leads",
  payouts: "payouts",
} as const;
