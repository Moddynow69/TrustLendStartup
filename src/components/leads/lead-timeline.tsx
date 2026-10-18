import { clsx } from "clsx";
import { Check, X, Clock } from "lucide-react";
import {
  SECURED_FLOW,
  UNSECURED_FLOW,
  STATUS_LABELS,
  furthestStageReached,
} from "@/lib/business/status-flow";
import type { CaseType, LeadLog } from "@/types";
import { format } from "date-fns";

interface LeadTimelineProps {
  caseType: CaseType;
  currentStatus: string;
  logs: LeadLog[];
  rejectionReason?: string | null;
}

/**
 * Renders the case-type-specific stage sequence (Section 9), marking each
 * stage as done / current / upcoming relative to `currentStatus`, and
 * annotating stages with the timestamp of the matching log entry if present.
 * A rejected lead shows only the stages it actually reached, then where and
 * why it was rejected.
 */
export function LeadTimeline({ caseType, currentStatus, logs, rejectionReason }: LeadTimelineProps) {
  const flow = caseType === "SECURED" ? SECURED_FLOW : UNSECURED_FLOW;
  const isRejected = currentStatus === "REJECTED";
  // For a rejected lead, "current" is the furthest stage it reached.
  const currentIdx = isRejected
    ? furthestStageReached(caseType, logs.map((l) => l.status))
    : flow.indexOf(currentStatus as (typeof flow)[number]);
  const stages = isRejected ? flow.slice(0, currentIdx + 1) : flow;

  // First time each status was logged. The first stage has no log of its
  // own: the lead enters it when verification is set to GREEN.
  const logByStatus = new Map<string, LeadLog>();
  for (const log of logs) if (!logByStatus.has(log.status)) logByStatus.set(log.status, log);
  const stageLog = (stage: string, idx: number) =>
    logByStatus.get(stage) ?? (idx === 0 ? logByStatus.get("VERIFICATION_GREEN") : undefined);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-400">
        <span>{caseType === "SECURED" ? "Secured" : "Unsecured"} flow</span>
      </div>

      <ol className="relative space-y-0">
        {stages.map((stage, idx) => {
          const isCurrent = !isRejected && idx === currentIdx && stage !== "DISBURSED";
          const isDoneStrict = idx <= currentIdx;
          const log = stageLog(stage, idx);
          // A rejected lead's last reached stage still connects to the Rejected entry.
          const isLast = idx === stages.length - 1 && !isRejected;

          return (
            <li key={stage} className="relative flex gap-4 pb-8 last:pb-0">
              {!isLast && (
                <span
                  className={clsx(
                    "absolute left-[15px] top-8 h-full w-px",
                    isDoneStrict && idx < currentIdx ? "bg-status-green" : "bg-ink-100"
                  )}
                  aria-hidden
                />
              )}
              <span
                className={clsx(
                  "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                  isDoneStrict
                    ? "border-status-green bg-status-green text-white"
                    : isCurrent
                    ? "border-brand-500 bg-white text-brand-600"
                    : "border-ink-200 bg-white text-ink-300"
                )}
              >
                {isDoneStrict ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </span>
              <div className="pt-1">
                <p
                  className={clsx(
                    "text-sm font-medium",
                    isDoneStrict || isCurrent ? "text-ink-900" : "text-ink-400"
                  )}
                >
                  {STATUS_LABELS[stage] ?? stage}
                </p>
                {log && (
                  <p className="text-xs text-ink-400">
                    {format(new Date(log.timestamp), "d MMM yyyy, h:mm a")}
                  </p>
                )}
              </div>
            </li>
          );
        })}

        {isRejected && (
          <li className="relative flex gap-4">
            <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-status-red bg-status-red text-white">
              <X className="h-4 w-4" />
            </span>
            <div className="pt-1">
              <p className="text-sm font-medium text-status-red">
                {currentIdx >= 0 ? `Rejected at ${STATUS_LABELS[flow[currentIdx]] ?? flow[currentIdx]}` : "Rejected"}
              </p>
              {rejectionReason && <p className="text-xs text-ink-500">{rejectionReason}</p>}
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
