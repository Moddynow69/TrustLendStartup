import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { searchLenders } from "@/lib/lenders";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50, 100);
    return NextResponse.json({ items: searchLenders(q, limit) });
  } catch (err) {
    return handleApiError(err);
  }
}
