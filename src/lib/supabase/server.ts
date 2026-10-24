import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Server-only Supabase client using the secret key, which bypasses all
 * Supabase access rules, so it must never reach the browser. Returns null
 * when SUPABASE_URL / SUPABASE_SECRET_KEY aren't set, so each caller can
 * decide how to degrade (documents refuse uploads; login skips limits).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
    client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }
  return client;
}
