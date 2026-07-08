import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { verificationStatusSchema } from "@/lib/validations/leads";
import { setVerificationStatus } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";

/** Section 5.4: only OPERATIONS and ADMIN may set verificationStatus. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(req, ["OPERATIONS", "ADMIN"]);
    const body = verificationStatusSchema.parse(await req.json());

    const lead = await setVerificationStatus(
      params.id,
      body.verificationStatus,
      user.id,
      body.note
    );

    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
