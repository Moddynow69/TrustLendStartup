import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { leadListQuerySchema } from "@/lib/validations/leads";
import { listLeads } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const { searchParams } = new URL(req.url);
    const filters = leadListQuerySchema.parse({
      verificationStatus: searchParams.get("verificationStatus") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      caseType: searchParams.get("caseType") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const result = await listLeads(admin, filters);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
