import "server-only";
import { adminDb, COLLECTIONS } from "@/lib/firebase/admin";

const INTERNAL_DOMAIN = process.env.AUTH_INTERNAL_EMAIL_DOMAIN || "loanbandhu.internal";

/** Builds the synthetic email Firebase Auth stores for a username-only account. */
export function usernameToSyntheticEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_DOMAIN}`;
}

/**
 * Resolves whatever the person typed into the login form (a real email or a
 * plain username) to the email address Firebase Auth actually has on file.
 * Looks up Firestore first so a username maps to its stored email/synthetic
 * email rather than guessing.
 */
export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@") && !trimmed.endsWith(`@${INTERNAL_DOMAIN}`)) {
    return trimmed.toLowerCase();
  }

  const bareUsername = trimmed.replace(`@${INTERNAL_DOMAIN}`, "").toLowerCase();
  const snap = await adminDb
    .collection(COLLECTIONS.users)
    .where("username", "==", bareUsername)
    .limit(1)
    .get();

  if (!snap.empty) {
    return snap.docs[0].data().email as string;
  }

  // Fall back: maybe it really was an email that happens to contain the
  // internal domain, or a username with no matching Firestore doc.
  return trimmed.includes("@") ? trimmed.toLowerCase() : null;
}
