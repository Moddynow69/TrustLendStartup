import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getPayoutById, getPayoutTimeline } from "@/lib/db/payouts";
import { getLeadById } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const payout = await getPayoutById(params.id);

    if (user.role === "DSA" || user.role === "PARTNER") {
      const lead = await getLeadById(payout.leadId);
      if (lead.createdBy !== user.id) {
        throw new AuthError("You do not have access to this payout", 403);
      }
    }

    const logs = await getPayoutTimeline(params.id);
    return NextResponse.json({ logs });
  } catch (err) {
    return handleApiError(err);
  }
}
