import { clsx } from "clsx";
import type { VerificationStatus } from "@/types";

const config: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  RED: { label: "Not Doable", dot: "bg-status-red", bg: "bg-red-50", text: "text-status-red" },
  YELLOW: {
    label: "Docs Pending",
    dot: "bg-status-yellow",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  GREEN: { label: "Ready", dot: "bg-status-green", bg: "bg-emerald-50", text: "text-status-green" },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Unverified
      </span>
    );
  }

  const c = config[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        c.bg,
        c.text
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
