import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getPayoutById } from "@/lib/db/payouts";
import { canViewPayout } from "@/lib/business/permissions";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const payout = await getPayoutById(params.id);

    if (!canViewPayout(user, payout)) {
      throw new AuthError("You do not have access to this payout", 403);
    }

    return NextResponse.json({ payout });
  } catch (err) {
    return handleApiError(err);
  }
}
