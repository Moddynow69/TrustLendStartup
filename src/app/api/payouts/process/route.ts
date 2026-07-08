import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { processPayoutSchema } from "@/lib/validations/payouts";
import { getLeadById } from "@/lib/db/leads";
import { createPayoutForLead } from "@/lib/db/payouts";
import { handleApiError, BadRequestError } from "@/lib/api-response";

/**
 * Manual/administrative payout creation, e.g. to (re)process a lead with a
 * custom payoutRate. Still enforces Section 5.3's rule that payouts only
 * apply to DISBURSED leads.
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const body = processPayoutSchema.parse(await req.json());

    const lead = await getLeadById(body.leadId);
    if (lead.status !== "DISBURSED") {
      throw new BadRequestError("Payouts can only be created for DISBURSED leads");
    }

    const payout = await createPayoutForLead(lead.id, lead.amount, body.payoutRate);
    return NextResponse.json({ payout }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
