import "server-only";

/**
 * In-memory fixed-window counter of failed login attempts, checked before
 * a password is ever tested (see POST /api/auth/login). Two limits apply:
 *  - per account: stops guessing one account's password
 *  - per IP: stops spraying a common password across many accounts
 *
 * State lives in this server instance's memory, so on Vercel each warm
 * function instance keeps its own counts. That still bounds guessing per
 * instance, and Firebase Auth applies its own throttling on top; move this
 * to a shared store (e.g. Upstash Redis) if you need exact global limits.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const LOGIN_LIMITS = {
  perAccount: 5,
  perIp: 20,
} as const;

const failures = new Map<string, { count: number; windowStart: number }>();

function liveEntry(key: string, now: number) {
  const entry = failures.get(key);
  if (entry && now - entry.windowStart > WINDOW_MS) {
    failures.delete(key);
    return undefined;
  }
  return entry;
}

/** Seconds until `key` may try again, or null if it is under `max` failures. */
export function retryAfterSeconds(key: string, max: number): number | null {
  const now = Date.now();
  const entry = liveEntry(key, now);
  if (!entry || entry.count < max) return null;
  return Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = liveEntry(key, now);
  if (entry) {
    entry.count += 1;
  } else {
    failures.set(key, { count: 1, windowStart: now });
  }
  // Opportunistically drop expired windows so the map can't grow without
  // bound under a flood of distinct identifiers/IPs.
  if (failures.size > 10_000) {
    failures.forEach((e, k) => {
      if (now - e.windowStart > WINDOW_MS) failures.delete(k);
    });
  }
}

export function resetFailures(key: string): void {
  failures.delete(key);
}

export function accountKey(identifier: string): string {
  return `acct:${identifier.trim().toLowerCase()}`;
}

/**
 * Client IP for per-IP limiting. On Vercel, `x-forwarded-for` is set by the
 * platform and its first entry is the real client; behind other proxies
 * make sure they overwrite (not append to) this header, or it can be spoofed.
 */
export function ipKey(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `ip:${ip}`;
}
