import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { leadStatusUpdateSchema } from "@/lib/validations/leads";
import { transitionLeadStatus } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";
import type { LeadStatus } from "@/types";

/**
 * Section 5.2/5.4: only ADMIN may progress a lead through its case-type
 * stages. Validation, the status update and (on DISBURSED) payout creation
 * all run atomically in `transitionLeadStatus`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = leadStatusUpdateSchema.parse(await req.json());

    const lead = await transitionLeadStatus(
      params.id,
      body.status as LeadStatus,
      admin.id,
      body.rejectionReason,
      body.note
    );

    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
