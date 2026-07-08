import { clsx } from "clsx";
import { STATUS_LABELS } from "@/lib/business/status-flow";
import type { PayoutStatus } from "@/types";

export function LeadStatusBadge({ status }: { status: string }) {
  const isRejected = status === "REJECTED";
  const isDisbursed = status === "DISBURSED";

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        isRejected && "bg-red-50 text-status-red",
        isDisbursed && "bg-emerald-50 text-status-green",
        !isRejected && !isDisbursed && "bg-brand-50 text-brand-700"
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const payoutConfig: Record<PayoutStatus, { bg: string; text: string }> = {
  PENDING: { bg: "bg-amber-50", text: "text-amber-700" },
  APPROVED: { bg: "bg-brand-50", text: "text-brand-700" },
  PAID: { bg: "bg-emerald-50", text: "text-status-green" },
  HOLD: { bg: "bg-ink-100", text: "text-ink-600" },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const c = payoutConfig[status];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", c.bg, c.text)}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
