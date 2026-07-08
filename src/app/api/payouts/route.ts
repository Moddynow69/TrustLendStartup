import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { listPayouts } from "@/lib/db/payouts";
import { handleApiError } from "@/lib/api-response";
import { z } from "zod";

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "PAID", "HOLD"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const filters = querySchema.parse({
      status: searchParams.get("status") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const result = await listPayouts(user, filters);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
