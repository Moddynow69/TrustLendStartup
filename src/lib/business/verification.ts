import type { LeadStatus } from "@/types";
import { isTerminalStatus } from "@/lib/business/status-flow";

export type VerificationColor = "RED" | "YELLOW" | "GREEN";

/** True once a lead has left LEAD_SUBMITTED but isn't yet DISBURSED/REJECTED. */
export function isInStageFlow(status: LeadStatus): boolean {
  return status !== "LEAD_SUBMITTED" && !isTerminalStatus(status);
}

/**
 * Which verification colours Operations/Admin may set on a lead at `status`:
 *  - LEAD_SUBMITTED: any (GREEN starts the case-type flow)
 *  - in the stage flow: RED (rejects the lead — see `verificationRejectsLead`)
 *    or GREEN (restores a lead whose verification was changed before these
 *    rules existed). YELLOW isn't allowed: docs are complete once GREEN.
 *  - DISBURSED / REJECTED: none, the lead is closed.
 */
export function allowedVerificationColors(status: LeadStatus): VerificationColor[] {
  if (isTerminalStatus(status)) return [];
  if (status === "LEAD_SUBMITTED") return ["RED", "YELLOW", "GREEN"];
  return ["RED", "GREEN"];
}

/** RED on a lead in the stage flow closes it: status moves to REJECTED. */
export function verificationRejectsLead(status: LeadStatus, color: VerificationColor): boolean {
  return color === "RED" && isInStageFlow(status);
}
