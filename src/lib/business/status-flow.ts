import type { CaseType, LeadStatus } from "@/types";

/**
 * Strict, ordered stage sequences per case type. "REJECTED" is intentionally
 * excluded from these arrays because it is reachable from ANY active stage,
 * not just the previous one in sequence — it is handled as a special case
 * in `getNextValidStatuses` / `isValidTransition` below.
 */
export const SECURED_FLOW: LeadStatus[] = [
  "BANK_SUBMITTED",
  "TECHNICAL",
  "CREDIT",
  "SANCTION",
  "DISBURSED",
];

export const UNSECURED_FLOW: LeadStatus[] = [
  "JVR",
  "LOGIN",
  "FI",
  "CREDIT",
  "SANCTION",
  "DISBURSED",
];

export function getFlow(caseType: CaseType): LeadStatus[] {
  return caseType === "SECURED" ? SECURED_FLOW : UNSECURED_FLOW;
}

/** The status a freshly-GREEN-verified lead should start at for its case type. */
export function getInitialStatus(caseType: CaseType): LeadStatus {
  return getFlow(caseType)[0];
}

/**
 * Returns the set of statuses that `status` in the given caseType may legally
 * move to next: the single next stage in order, plus REJECTED (always allowed
 * from any active, non-terminal stage). DISBURSED and REJECTED are terminal.
 */
export function getNextValidStatuses(
  caseType: CaseType,
  currentStatus: LeadStatus
): LeadStatus[] {
  const flow = getFlow(caseType);
  if (currentStatus === "DISBURSED" || currentStatus === "REJECTED") {
    return []; // terminal states, no further transitions
  }
  const idx = flow.indexOf(currentStatus);
  if (idx === -1) return [];
  const next: LeadStatus[] = ["REJECTED"];
  if (idx + 1 < flow.length) {
    next.unshift(flow[idx + 1]);
  }
  return next;
}

/**
 * Validates a proposed status transition against Section 5.2's strict,
 * in-order progression rules. Skipping stages or moving backward is
 * rejected; REJECTED is allowed from any active stage.
 */
export function isValidTransition(
  caseType: CaseType,
  currentStatus: LeadStatus,
  nextStatus: LeadStatus
): boolean {
  return getNextValidStatuses(caseType, currentStatus).includes(nextStatus);
}

export function isTerminalStatus(status: LeadStatus): boolean {
  return status === "DISBURSED" || status === "REJECTED";
}

/** Human-readable labels for timeline rendering. */
export const STATUS_LABELS: Record<string, string> = {
  LEAD_SUBMITTED: "Lead Submitted",
  BANK_SUBMITTED: "Bank Submission",
  TECHNICAL: "Technical",
  CREDIT: "Credit",
  SANCTION: "Sanction",
  DISBURSED: "Disbursed",
  JVR: "JVR",
  LOGIN: "Log In",
  FI: "FI",
  REJECTED: "Rejected",
};
