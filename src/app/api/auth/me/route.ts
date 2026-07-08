import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
