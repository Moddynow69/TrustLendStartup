import "server-only";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { adminAuth, adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import type { Role, UserProfile } from "@/types";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "lb_session";
const SESSION_EXPIRES_IN_MS =
  1000 * Number(process.env.SESSION_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 5);

/**
 * Exchanges a Firebase client ID token for a long-lived, secure, http-only
 * session cookie. Called from POST /api/auth/login after the client signs in
 * with the Firebase JS SDK.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_EXPIRES_IN_MS / 1000,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the session cookie on an incoming API request via the Admin SDK
 * and loads the corresponding Firestore user profile. Throws AuthError with
 * a 401 for missing/invalid/expired tokens, or 403 if the account has been
 * deactivated by an Admin.
 */
export async function requireUser(req: NextRequest): Promise<UserProfile> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) throw new AuthError("Not authenticated", 401);

  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(cookie, true);
  } catch {
    throw new AuthError("Session expired or invalid", 401);
  }

  const snap = await adminDb.collection(COLLECTIONS.users).doc(decoded.uid).get();
  if (!snap.exists) throw new AuthError("User profile not found", 401);

  const data = snap.data()!;
  if (!data.isActive) throw new AuthError("Account has been disabled", 403);

  return {
    id: snap.id,
    name: data.name,
    email: data.email,
    username: data.username ?? null,
    role: data.role,
    isActive: data.isActive,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt,
    createdBy: data.createdBy ?? null,
  };
}

/** Convenience helper for routes restricted to a set of roles. */
export async function requireRole(req: NextRequest, allowed: Role[]): Promise<UserProfile> {
  const user = await requireUser(req);
  if (!allowed.includes(user.role)) {
    throw new AuthError("You do not have permission to perform this action", 403);
  }
  return user;
}

/** Reads the current session server-side, e.g. from a Server Component. */
export async function getServerUser(): Promise<UserProfile | null> {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    const snap = await adminDb.collection(COLLECTIONS.users).doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    return {
      id: snap.id,
      name: data.name,
      email: data.email,
      username: data.username ?? null,
      role: data.role,
      isActive: data.isActive,
      createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt,
      createdBy: data.createdBy ?? null,
    };
  } catch {
    return null;
  }
}
