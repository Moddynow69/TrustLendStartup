import "server-only";

/**
 * Minimal in-memory sliding-window rate limiter to mitigate brute-force
 * credential guessing on /api/auth/login. Suitable for a single-instance
 * MVP deployment; swap for a shared store (Redis/Upstash) once you run
 * more than one serverless instance, since in-memory state does not share
 * across Vercel function invocations at scale.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 8;

const attempts = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

export function getClientKey(req: Request, extra: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${ip}:${extra}`;
}
