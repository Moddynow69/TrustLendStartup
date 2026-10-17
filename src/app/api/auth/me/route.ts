import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ user });
  } catch (err) {
    const res = handleApiError(err);
    // The middleware only checks that the session cookie exists, so a
    // revoked/expired/disabled session would otherwise keep bouncing the
    // user between /login and /dashboard. Clearing it here lets the
    // client's redirect to /login stick.
    if (err instanceof AuthError) {
      res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    }
    return res;
  }
}
