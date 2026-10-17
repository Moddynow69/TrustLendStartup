import type { PayoutStatus } from "@/types";

/**
 * Allowed payout status moves. PAID is final: money has gone out, so it
 * can't be reopened. A HOLD must be released (back to PENDING or
 * APPROVED) before the payout can be paid.
 */
const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  PENDING: ["APPROVED", "HOLD", "PAID"],
  APPROVED: ["PAID", "HOLD"],
  HOLD: ["PENDING", "APPROVED"],
  PAID: [],
};

export function getNextPayoutStatuses(current: PayoutStatus): PayoutStatus[] {
  return PAYOUT_TRANSITIONS[current] ?? [];
}

export function isValidPayoutTransition(current: PayoutStatus, next: PayoutStatus): boolean {
  return getNextPayoutStatuses(current).includes(next);
}

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  HOLD: "On hold",
  PAID: "Paid",
};
