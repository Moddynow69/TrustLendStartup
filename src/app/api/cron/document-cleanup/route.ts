import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDocumentCleanup } from "@/lib/db/document-cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // refuse to run unprotected
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily document clean-up (scheduled in vercel.json). Add `?dryRun=1` to see
 * what would be removed without changing anything.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const dryRun = ["1", "true"].includes(req.nextUrl.searchParams.get("dryRun") ?? "");
  const report = await runDocumentCleanup({ dryRun });
  if (report.errors.length) console.error("[document-cleanup]", report.errors);
  console.log("[document-cleanup]", JSON.stringify(report));
  return NextResponse.json(report, { status: report.errors.length ? 207 : 200 });
}
