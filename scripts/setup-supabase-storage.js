/**
 * Creates (or updates) the private Supabase Storage bucket for lead
 * documents, with the limits enforced by storage itself:
 *   - private: no public URLs; only server-issued signed links work
 *   - 10 MB per file
 *   - PDF, JPG and PNG only
 *
 * Usage:
 *   npm run setup:documents-storage
 *
 * Reads SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) and
 * optionally SUPABASE_DOCUMENTS_BUCKET from .env.local. Safe to re-run.
 */

const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.resolve(__dirname, "..", ".env.local");
if (dotenv.config({ path: envPath }).error) {
  console.error(`Could not read ${envPath}. Copy .env.example to .env.local first.`);
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const bucket = (process.env.SUPABASE_DOCUMENTS_BUCKET || "lead-documents").trim();

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (Supabase → Project Settings → API).");
  process.exit(1);
}

const options = {
  public: false,
  fileSizeLimit: 10 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
};

async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = await supabase.storage.getBucket(bucket);

  if (existing.data) {
    const { error } = await supabase.storage.updateBucket(bucket, options);
    if (error) throw error;
    console.log(`Updated bucket "${bucket}".`);
  } else {
    const { error } = await supabase.storage.createBucket(bucket, options);
    if (error) throw error;
    console.log(`Created bucket "${bucket}".`);
  }

  const { data, error } = await supabase.storage.getBucket(bucket);
  if (error) throw error;
  console.log(
    `  private: ${!data.public} | size limit: ${data.file_size_limit} bytes | types: ${(data.allowed_mime_types || []).join(", ")}`
  );
  if (data.public) {
    console.error("The bucket is PUBLIC. Make it private in Supabase → Storage before storing documents.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
