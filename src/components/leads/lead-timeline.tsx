import { clsx } from "clsx";
import { Check, X, Clock } from "lucide-react";
import { SECURED_FLOW, UNSECURED_FLOW, STATUS_LABELS } from "@/lib/business/status-flow";
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
 */
export function LeadTimeline({ caseType, currentStatus, logs, rejectionReason }: LeadTimelineProps) {
  const flow = caseType === "SECURED" ? SECURED_FLOW : UNSECURED_FLOW;
  const isRejected = currentStatus === "REJECTED";
  const currentIdx = flow.indexOf(currentStatus as (typeof flow)[number]);

  const logByStatus = new Map(logs.map((l) => [l.status, l]));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-400">
        <span>{caseType === "SECURED" ? "Secured" : "Unsecured"} flow</span>
      </div>

      <ol className="relative space-y-0">
        {flow.map((stage, idx) => {
          const isDone = !isRejected && (idx < currentIdx || (idx === currentIdx && stage === "DISBURSED"));
          const isCurrent = !isRejected && idx === currentIdx && stage !== "DISBURSED";
          const isDoneStrict = !isRejected && idx <= currentIdx;
          const log = logByStatus.get(stage);
          const isLast = idx === flow.length - 1;

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
              <p className="text-sm font-medium text-status-red">Rejected</p>
              {rejectionReason && <p className="text-xs text-ink-500">{rejectionReason}</p>}
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
