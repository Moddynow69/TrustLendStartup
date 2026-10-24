import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import { loginSchema } from "@/lib/validations/auth";
import { resolveLoginEmail, usernameToSyntheticEmail } from "@/lib/auth/identifier";
import { signInWithPassword } from "@/lib/auth/password-sign-in";
import {
  clientIp,
  recordEvent,
  recordFailure,
  recordSuccess,
  retryAfterSeconds,
} from "@/lib/auth/login-limits";
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
 * Single-step login. Accounts stay in Firebase Auth, but the password is
 * checked here on the server (Firebase Auth REST API) rather than in the
 * browser, so every attempt passes through the failure limits first:
 * 5 per account and 20 per IP per 15 minutes, counted in Supabase
 * (lib/auth/login-limits.ts), which also keeps a history of attempts.
 *
 * Unknown usernames, wrong passwords and disabled Firebase accounts all
 * return the same 401, so login can't be used to discover which accounts exist.
 */
export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = loginSchema.parse(await req.json());
    const ip = clientIp(req);

    const blockedFor = await retryAfterSeconds(identifier, ip);
    if (blockedFor > 0) {
      await recordEvent(identifier, ip, "blocked");
      return tooManyAttempts(blockedFor);
    }

    // Unknown usernames still go through Firebase (with the synthetic email
    // they would have had), so they take as long as a wrong password.
    const email = (await resolveLoginEmail(identifier)) ?? usernameToSyntheticEmail(identifier);
    const result = await signInWithPassword(email, password);

    if (!result.ok) {
      await recordFailure(identifier, ip, result.reason === "throttled" ? "throttled" : "invalid");
      if (result.reason === "throttled") return tooManyAttempts(15 * 60);
      return NextResponse.json(INVALID, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(result.idToken);
    const snap = await adminDb.collection(COLLECTIONS.users).doc(decoded.uid).get();
    if (!snap.exists) {
      // A valid Firebase account with no profile can't use the app.
      await recordFailure(identifier, ip, "invalid");
      return NextResponse.json(INVALID, { status: 401 });
    }
    const profile = snap.data()!;
    if (!profile.isActive) {
      // Only reachable with the correct password, so this reveals nothing to a guesser.
      await recordEvent(identifier, ip, "disabled", snap.id);
      return NextResponse.json(
        { error: "This account has been disabled. Contact your administrator." },
        { status: 403 }
      );
    }

    await recordSuccess(identifier, ip, snap.id);
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
