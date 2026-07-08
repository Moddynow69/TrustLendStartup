import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { payoutStatusUpdateSchema } from "@/lib/validations/payouts";
import { updatePayoutStatus } from "@/lib/db/payouts";
import { handleApiError } from "@/lib/api-response";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(req, ["ADMIN"]);
    const body = payoutStatusUpdateSchema.parse(await req.json());
    const payout = await updatePayoutStatus(params.id, body.status);
    return NextResponse.json({ payout });
  } catch (err) {
    return handleApiError(err);
  }
}
