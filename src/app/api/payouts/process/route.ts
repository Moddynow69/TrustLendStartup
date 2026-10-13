import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { processPayoutSchema } from "@/lib/validations/payouts";
import { createPayoutForLead } from "@/lib/db/payouts";
import { handleApiError } from "@/lib/api-response";

/**
 * Manual/administrative payout creation, e.g. to (re)process a lead with a
 * custom payoutRate. Still enforces Section 5.3's rule that payouts only
 * apply to DISBURSED leads (checked inside the transaction).
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const body = processPayoutSchema.parse(await req.json());

    const payout = await createPayoutForLead(body.leadId, body.payoutRate);
    return NextResponse.json({ payout }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
