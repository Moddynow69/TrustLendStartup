import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import { loginSchema } from "@/lib/validations/auth";
import { resolveLoginEmail, usernameToSyntheticEmail } from "@/lib/auth/identifier";
import { signInWithPassword } from "@/lib/auth/password-sign-in";
import {
  LOGIN_LIMITS,
  accountKey,
  ipKey,
  recordFailure,
  resetFailures,
  retryAfterSeconds,
} from "@/lib/auth/rate-limit";
import { createSessionCookie, sessionCookieOptions } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api-response";

const INVALID = { error: "Invalid credentials" };

function tooManyAttempts(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many login attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Single-step login. The password is verified here on the server (via
 * Firebase Auth's REST API) rather than in the browser, so every attempt
 * passes through the per-account and per-IP failure limits below before
 * it is tested. On success the resulting ID token is exchanged for a
 * secure, http-only session cookie.
 *
 * Unknown usernames, wrong passwords and disabled Firebase accounts all
 * return the same 401, so the endpoint can't be used to discover which
 * accounts exist.
 */
export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = loginSchema.parse(await req.json());
    const acct = accountKey(identifier);
    const ip = ipKey(req);

    const blockedFor =
      retryAfterSeconds(acct, LOGIN_LIMITS.perAccount) ?? retryAfterSeconds(ip, LOGIN_LIMITS.perIp);
    if (blockedFor != null) return tooManyAttempts(blockedFor);

    // Unknown usernames still go through Firebase (with the synthetic email
    // they would have had), so they take as long as a wrong password and
    // can't be told apart by timing.
    const email = (await resolveLoginEmail(identifier)) ?? usernameToSyntheticEmail(identifier);
    const result = await signInWithPassword(email, password);

    if (!result.ok) {
      recordFailure(acct);
      recordFailure(ip);
      if (result.reason === "throttled") return tooManyAttempts(15 * 60);
      return NextResponse.json(INVALID, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(result.idToken);
    const snap = await adminDb.collection(COLLECTIONS.users).doc(decoded.uid).get();
    if (!snap.exists) {
      // A valid Firebase account with no profile can't use the app.
      return NextResponse.json(INVALID, { status: 401 });
    }
    const profile = snap.data()!;
    if (!profile.isActive) {
      // Only reachable with the correct password, so this reveals nothing
      // to someone guessing.
      return NextResponse.json(
        { error: "This account has been disabled. Contact your administrator." },
        { status: 403 }
      );
    }

    resetFailures(acct);
    const sessionCookie = await createSessionCookie(result.idToken);
    const res = NextResponse.json({
      user: {
        id: snap.id,
        name: profile.name,
        email: profile.email,
        username: profile.username ?? null,
        role: profile.role,
        personalizedPayoutRate: profile.personalizedPayoutRate ?? null,
      },
    });
    res.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions());
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
