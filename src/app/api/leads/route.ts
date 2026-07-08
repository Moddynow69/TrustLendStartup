import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { createLeadSchema, leadListQuerySchema } from "@/lib/validations/leads";
import { canCreateLead } from "@/lib/business/permissions";
import { createLead, listLeads } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const filters = leadListQuerySchema.parse({
      verificationStatus: searchParams.get("verificationStatus") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      caseType: searchParams.get("caseType") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const result = await listLeads(user, filters);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!canCreateLead(user.role)) {
      throw new AuthError("Only DSA and Partner accounts can create leads", 403);
    }

    const body = createLeadSchema.parse(await req.json());
    const lead = await createLead({ ...body, createdBy: user.id });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
