import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { leadStatusUpdateSchema } from "@/lib/validations/leads";
import { getLeadById, updateLeadStatus } from "@/lib/db/leads";
import { isValidTransition } from "@/lib/business/status-flow";
import { createPayoutForLead } from "@/lib/db/payouts";
import { handleApiError, BadRequestError } from "@/lib/api-response";
import type { LeadStatus } from "@/types";

/** Default payout rate applied automatically on disbursement for the MVP. */
const DEFAULT_PAYOUT_RATE = 0.01;

/**
 * Section 5.2/5.4: only ADMIN may progress a lead through its case-type
 * stages. The lead must already be verification-GREEN (enforced implicitly:
 * a lead only enters the case-type flow once GREEN sets its initial status).
 * Every transition is validated against the strict, in-order flow for the
 * lead's caseType — skipping stages or moving backward is rejected.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = leadStatusUpdateSchema.parse(await req.json());
    const nextStatus = body.status as LeadStatus;

    const lead = await getLeadById(params.id);

    if (lead.verificationStatus !== "GREEN") {
      throw new BadRequestError(
        "Lead must be verification-GREEN before it can move through case-type stages"
      );
    }

    if (!isValidTransition(lead.caseType, lead.status, nextStatus)) {
      throw new BadRequestError(
        `Cannot move a ${lead.caseType} lead from ${lead.status} to ${nextStatus}. ` +
          "Stages must progress in order and cannot be skipped or reversed."
      );
    }

    const updated = await updateLeadStatus(
      params.id,
      nextStatus,
      admin.id,
      body.rejectionReason,
      body.note
    );

    // Section 5.3: payout creation triggers only on DISBURSED.
    if (nextStatus === "DISBURSED") {
      await createPayoutForLead(updated.id, updated.amount, DEFAULT_PAYOUT_RATE);
    }

    return NextResponse.json({ lead: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
