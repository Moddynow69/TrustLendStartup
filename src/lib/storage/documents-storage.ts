import "server-only";
import { BadRequestError } from "@/lib/api-response";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/*
 * Private file storage for lead documents, on Supabase Storage (free plan).
 * Only the server talks to Supabase, with the secret key; browsers only
 * ever receive short-lived signed links. The bucket itself is private and
 * enforces the size limit and allowed file types (see
 * scripts/setup-supabase-storage.js).
 *
 * Everything Supabase-specific lives in this file, so moving to another
 * provider later means replacing these functions only.
 */

function storage() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Shown to the user: the rest of the app works, only file storage is missing.
    throw new BadRequestError(
      "Document storage isn't set up yet. An admin needs to finish the setup (README: Setting up document storage)."
    );
  }
  return supabase.storage.from(bucketName());
}

/** Throws the user-facing "not set up" error before any record is written. */
export function assertStorageConfigured() {
  storage();
}

export function bucketName() {
  return process.env.SUPABASE_DOCUMENTS_BUCKET?.trim() || "lead-documents";
}

function fail(action: string, error: { message: string }): never {
  throw new Error(`Document storage: couldn't ${action}: ${error.message}`);
}

/**
 * A one-time upload link for `path`. The browser PUTs the file to it as
 * multipart form data (see useUploadDocument). Supabase keeps these links
 * valid for 2 hours; the server verifies the stored file before accepting it.
 */
export async function createUploadLink(path: string): Promise<string> {
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error) fail("create an upload link", error);
  return data.signedUrl;
}

/** Size and type of a stored file, or null if it isn't there. */
export async function getStoredFileInfo(path: string): Promise<{ size: number; contentType: string } | null> {
  const { data, error } = await storage().info(path);
  if (error) {
    const status = (error as { status?: number; statusCode?: string }).status;
    if (status === 400 || status === 404) return null;
    fail("read file details", error);
  }
  const info = data as unknown as { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } };
  return {
    size: Number(info.size ?? info.metadata?.size ?? NaN),
    contentType: String(info.contentType ?? info.metadata?.mimetype ?? ""),
  };
}

/** The first `bytes` bytes of a stored file, to check it really is what it claims. */
export async function readFileStart(path: string, bytes = 8): Promise<Buffer> {
  const url = await createViewLink(path, 60);
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Document storage: couldn't read the file (${res.status})`);
  return Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
}

/** A read link valid for `seconds`. Files open in the browser with their stored type. */
export async function createViewLink(path: string, seconds: number): Promise<string> {
  const { data, error } = await storage().createSignedUrl(path, seconds);
  if (error) fail("create a view link", error);
  return data.signedUrl;
}

export async function deleteStoredFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await storage().remove(paths);
  if (error) fail("delete files", error);
}
