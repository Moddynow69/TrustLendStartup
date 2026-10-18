import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getLeadById, getLeadPeople } from "@/lib/db/leads";
import { canViewLead } from "@/lib/business/permissions";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await getLeadById(params.id);

    if (!canViewLead(user, lead)) {
      throw new AuthError("You do not have access to this lead", 403);
    }

    const people = await getLeadPeople(lead);
    return NextResponse.json({ lead, people });
  } catch (err) {
    return handleApiError(err);
  }
}
