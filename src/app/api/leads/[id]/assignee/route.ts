import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { reassignLeadSchema } from "@/lib/validations/leads";
import { reassignLead } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";

/**
 * Admin-only: hand a lead to another DSA/PARTNER. The assignee at disbursal
 * is the one paid, so this stays with Admins. Rules live in `reassignLead`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = reassignLeadSchema.parse(await req.json());
    const lead = await reassignLead(params.id, body.assignedTo, admin.id, body.note);
    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
