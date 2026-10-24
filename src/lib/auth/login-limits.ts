import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/*
 * Failed-login limits and login history, stored in Supabase Postgres
 * (supabase/login-limits.sql). Counts are shared by every server instance.
 *
 * If Supabase is unreachable, not configured, or its free project is
 * paused, these calls give up after a short timeout and login carries on
 * without the extra limit (Firebase still throttles repeated failures on
 * an account). Refusing every login instead would lock everyone out.
 */

export const LOGIN_LIMITS = { perAccount: 5, perIp: 20, windowSeconds: 15 * 60 } as const;
const TIMEOUT_MS = 2500;

export type LoginOutcome = "success" | "invalid" | "blocked" | "throttled" | "disabled";

export function accountKey(identifier: string): string {
  return `acct:${identifier.trim().toLowerCase()}`;
}

/**
 * The client's IP. On Vercel, `x-forwarded-for` is set by the platform and
 * its first entry is the real client; behind other proxies make sure they
 * overwrite (not append to) this header, or it can be spoofed.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export const ipKey = (ip: string) => `ip:${ip}`;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false };
  try {
    const { data, error } = await supabase.rpc(fn, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) {
      console.warn(`[login-limits] ${fn} failed: ${error.message}`);
      return { ok: false };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    console.warn(`[login-limits] ${fn} unavailable: ${(err as Error).message}`);
    return { ok: false };
  }
}

/** Seconds until this account and IP may try again; 0 means allowed. */
export async function retryAfterSeconds(identifier: string, ip: string): Promise<number> {
  const res = await rpc<number>("login_check", {
    p_account: accountKey(identifier),
    p_ip: ipKey(ip),
    p_account_limit: LOGIN_LIMITS.perAccount,
    p_ip_limit: LOGIN_LIMITS.perIp,
    p_window_seconds: LOGIN_LIMITS.windowSeconds,
  });
  return res.ok ? Number(res.data) || 0 : 0;
}

/** Counts a failed attempt against the account and the IP, and records it. */
export async function recordFailure(identifier: string, ip: string, outcome: "invalid" | "throttled") {
  await rpc("login_failed", {
    p_account: accountKey(identifier),
    p_ip: ipKey(ip),
    p_window_seconds: LOGIN_LIMITS.windowSeconds,
    p_identifier: identifier.trim().toLowerCase(),
    p_ip_address: ip,
    p_outcome: outcome,
  });
}

/** Clears the account's failures and records the successful login. */
export async function recordSuccess(identifier: string, ip: string, userId: string) {
  await rpc("login_succeeded", {
    p_account: accountKey(identifier),
    p_identifier: identifier.trim().toLowerCase(),
    p_ip_address: ip,
    p_user_id: userId,
  });
}

/** Records an attempt refused for another reason (over the limit, disabled account). */
export async function recordEvent(identifier: string, ip: string, outcome: "blocked" | "disabled", userId?: string) {
  await rpc("login_log", {
    p_identifier: identifier.trim().toLowerCase(),
    p_ip_address: ip,
    p_outcome: outcome,
    p_user_id: userId ?? null,
  });
}
