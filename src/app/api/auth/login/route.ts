import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { loginIdentifierSchema } from "@/lib/validations/auth";
import { resolveLoginEmail } from "@/lib/auth/identifier";
import { checkRateLimit, getClientKey, resetRateLimit } from "@/lib/auth/rate-limit";
import { createSessionCookie, sessionCookieOptions } from "@/lib/auth/session";
import { handleApiError, BadRequestError } from "@/lib/api-response";
import { adminDb, COLLECTIONS } from "@/lib/firebase/admin";

/**
 * Login is a two-step flow because the Admin SDK cannot verify a password
 * directly:
 *   1. This route resolves the identifier to an email and returns it to the
 *      client, which then signs in with the Firebase JS SDK
 *      (signInWithEmailAndPassword) to obtain an ID token.
 *   2. The client calls this route again with the ID token; the server
 *      verifies it and mints a secure session cookie.
 *
 * Sending `idToken` triggers step 2; omitting it triggers step 1.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Step 2: client already authenticated with Firebase client SDK and is
    // exchanging the resulting ID token for a session cookie.
    if (body.idToken) {
      const decoded = await adminAuth.verifyIdToken(body.idToken);
      const snap = await adminDb.collection(COLLECTIONS.users).doc(decoded.uid).get();
      if (!snap.exists) throw new BadRequestError("User profile not found");
      const profile = snap.data()!;
      if (!profile.isActive) {
        return NextResponse.json(
          { error: "This account has been disabled. Contact your administrator." },
          { status: 403 }
        );
      }

      const sessionCookie = await createSessionCookie(body.idToken);
      const res = NextResponse.json({
        user: {
          id: snap.id,
          name: profile.name,
          email: profile.email,
          username: profile.username ?? null,
          role: profile.role,
        },
      });
      res.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions());
      resetRateLimit(getClientKey(req, body.identifier || decoded.email || decoded.uid));
      return res;
    }

    // Step 1: resolve identifier -> email for the client to sign in with.
    const parsed = loginIdentifierSchema.parse(body);

    const rl = checkRateLimit(getClientKey(req, parsed.identifier));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const email = await resolveLoginEmail(parsed.identifier);
    if (!email) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({ email });
  } catch (err) {
    return handleApiError(err);
  }
}
