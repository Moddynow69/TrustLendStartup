import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { requireLeadAccess, resolveNewCopyRequest } from "@/lib/db/documents";
import { handleApiError } from "@/lib/api-response";

/** Operations/Admin: close a new-copy request without a replacement file. */
export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    await resolveNewCopyRequest(lead, user, params.docId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
