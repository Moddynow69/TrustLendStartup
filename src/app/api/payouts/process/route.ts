import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { processPayoutSchema } from "@/lib/validations/payouts";
import { createPayoutForLead } from "@/lib/db/payouts";
import { handleApiError } from "@/lib/api-response";

/**
 * Manual/administrative payout creation for a DISBURSED lead that has no
 * payout yet. `commissionRate` is the lender's commission as a percent;
 * the lead's plan splits it exactly as at disbursal.
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const body = processPayoutSchema.parse(await req.json());

    const payout = await createPayoutForLead(body.leadId, body.commissionRate / 100);
    return NextResponse.json({ payout }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
