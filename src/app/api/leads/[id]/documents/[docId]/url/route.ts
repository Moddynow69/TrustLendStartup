import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getViewUrl, requireLeadAccess } from "@/lib/db/documents";
import { handleApiError } from "@/lib/api-response";

/** A 5-minute read link. Access is re-checked and the view is logged every time. */
export async function GET(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    const result = await getViewUrl(lead, user, params.docId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}
