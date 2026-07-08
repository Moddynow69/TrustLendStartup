import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { findDisbursedLeadsWithoutPayout, createPayoutForLead } from "@/lib/db/payouts";
import { handleApiError } from "@/lib/api-response";
import { z } from "zod";

const bodySchema = z.object({
  payoutRate: z.number().positive().default(0.01),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const { payoutRate } = bodySchema.parse(await req.json().catch(() => ({})));

    const pending = await findDisbursedLeadsWithoutPayout();
    const created = [];
    for (const lead of pending) {
      created.push(await createPayoutForLead(lead.id, lead.amount, payoutRate));
    }

    return NextResponse.json({ processedCount: created.length, payouts: created });
  } catch (err) {
    return handleApiError(err);
  }
}
