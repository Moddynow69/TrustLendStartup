import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { addComment, listComments, requireLeadAccess } from "@/lib/db/documents";
import { addCommentSchema } from "@/lib/validations/documents";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const user = await requireUser(req);
    await requireLeadAccess(user, params.id);
    return NextResponse.json({ comments: await listComments(params.id, params.docId) });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Adds a comment; Operations/Admin may also ask for a new copy with it. */
export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    const body = addCommentSchema.parse(await req.json());
    const comment = await addComment(lead, user, params.docId, body);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
