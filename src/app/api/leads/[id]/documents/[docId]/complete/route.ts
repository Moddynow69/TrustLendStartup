import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { completeUpload, requireLeadAccess } from "@/lib/db/documents";
import { handleApiError } from "@/lib/api-response";

/** Step 3 of an upload: verifies the stored file and saves it on the lead. */
export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    const document = await completeUpload(lead, user, params.docId);
    return NextResponse.json({ document });
  } catch (err) {
    return handleApiError(err);
  }
}
