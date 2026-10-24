import "server-only";

/**
 * Server-only Firebase Web API key used to verify passwords. Prefer a
 * dedicated key that never ships to the browser; the NEXT_PUBLIC_ fallback
 * keeps existing environments working until FIREBASE_WEB_API_KEY is set.
 */
const API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export type PasswordSignInResult =
  | { ok: true; idToken: string }
  | { ok: false; reason: "invalid" | "throttled" };

/**
 * Verifies an email/password pair with Firebase Auth's REST API (the same
 * check the browser SDK's signInWithEmailAndPassword performs) and returns
 * a fresh ID token on success. Running it server-side means every password
 * attempt passes through our own rate limiting.
 *
 * Wrong password, unknown account and disabled account all map to
 * "invalid" so callers can't be used to tell them apart.
 */
export async function signInWithPassword(email: string, password: string): Promise<PasswordSignInResult> {
  if (!API_KEY) {
    throw new Error("Missing FIREBASE_WEB_API_KEY (or NEXT_PUBLIC_FIREBASE_API_KEY)");
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
    }
  );
  const body = await res.json().catch(() => ({}));

  if (res.ok && typeof body.idToken === "string") {
    return { ok: true, idToken: body.idToken };
  }

  // Firebase messages look like "INVALID_LOGIN_CREDENTIALS" or
  // "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been...".
  const code = String(body?.error?.message ?? "").split(" ")[0];
  switch (code) {
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return { ok: false, reason: "throttled" };
    case "INVALID_LOGIN_CREDENTIALS":
    case "INVALID_PASSWORD":
    case "EMAIL_NOT_FOUND":
    case "INVALID_EMAIL":
    case "USER_DISABLED":
    case "MISSING_PASSWORD":
      return { ok: false, reason: "invalid" };
    default:
      // Misconfiguration (bad/restricted API key, quota, outage) — surface it
      // as a server error rather than blaming the user's password.
      throw new Error(`Firebase password sign-in failed: ${code || res.status}`);
  }
}
