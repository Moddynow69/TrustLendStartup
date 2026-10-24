import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteDocument, purgeDocument, requireLeadAccess } from "@/lib/db/documents";
import { handleApiError } from "@/lib/api-response";

/**
 * Deletes a document. By default the file leaves the lead but is kept for
 * the audit trail; `?permanent=true` (Admin only) erases every version.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    if (req.nextUrl.searchParams.get("permanent") === "true") {
      await purgeDocument(lead, user, params.docId);
    } else {
      await deleteDocument(lead, user, params.docId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
