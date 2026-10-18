import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/db/dashboard";
import { handleApiError } from "@/lib/api-response";

/** Exact, role-scoped dashboard counts (see lib/db/dashboard.ts). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const stats = await getDashboardStats(user);
    return NextResponse.json({ stats });
  } catch (err) {
    return handleApiError(err);
  }
}
