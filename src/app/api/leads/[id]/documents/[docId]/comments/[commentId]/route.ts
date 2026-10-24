import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteComment, requireLeadAccess } from "@/lib/db/documents";
import { handleApiError } from "@/lib/api-response";

/** Authors delete their own comments; Admins any. The entry stays without its text. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string; commentId: string } }
) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    await deleteComment(lead, user, params.docId, params.commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
