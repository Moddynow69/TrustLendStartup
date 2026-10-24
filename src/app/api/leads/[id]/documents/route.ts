import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { listDocuments, requireLeadAccess, startUpload } from "@/lib/db/documents";
import { startUploadSchema } from "@/lib/validations/documents";
import { handleApiError } from "@/lib/api-response";

/** The lead's documents plus recent document activity. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    await requireLeadAccess(user, params.id);
    return NextResponse.json(await listDocuments(params.id));
  } catch (err) {
    return handleApiError(err);
  }
}

/** Step 1 of an upload: checks and returns a short-lived upload link. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const lead = await requireLeadAccess(user, params.id);
    const body = startUploadSchema.parse(await req.json());
    return NextResponse.json(await startUpload(lead, user, body), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
