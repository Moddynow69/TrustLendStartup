import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "lb_session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/forgot-password"];

/**
 * Lightweight edge check: presence of the session cookie only. Full
 * verification (signature, expiry, revocation) happens in `requireUser`
 * inside each API route via the Admin SDK, since that verification needs
 * Node APIs unavailable in the Edge runtime. This middleware just keeps
 * signed-out users from loading protected pages/shells.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (!isPublic && !hasSession && pathname !== "/") {
    const isProtectedPage =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/leads") ||
      pathname.startsWith("/payouts") ||
      pathname.startsWith("/admin");
    if (isProtectedPage) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/leads/:path*", "/payouts/:path*", "/admin/:path*", "/login"],
};
