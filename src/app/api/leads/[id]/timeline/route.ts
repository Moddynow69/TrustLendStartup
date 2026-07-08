import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getLeadById, getLeadTimeline } from "@/lib/db/leads";
import { canViewAllLeads } from "@/lib/business/permissions";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await getLeadById(params.id);

    if (!canViewAllLeads(user.role) && lead.createdBy !== user.id) {
      throw new AuthError("You do not have access to this lead", 403);
    }

    const logs = await getLeadTimeline(params.id);
    return NextResponse.json({ logs });
  } catch (err) {
    return handleApiError(err);
  }
}
