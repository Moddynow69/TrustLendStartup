"use client";

import { useParams } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { CheckCircle2, Clock } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PayoutStatusBadge } from "@/components/leads/status-badge";
import { usePayout, usePayoutTimeline, useUpdatePayoutStatus } from "@/hooks/use-payouts";
import { useLead } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { clsx } from "clsx";

export default function PayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading } = usePayout(id);
  const { data: timelineData } = usePayoutTimeline(id);
  const updateStatus = useUpdatePayoutStatus(id!);
  const { data: leadData } = useLead(data?.payout.leadId);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const payout = data.payout;
  const lead = leadData?.lead;

  async function markPaid() {
    try {
      await updateStatus.mutateAsync("PAID");
      toast.success("Payout marked as paid");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update payout");
    }
  }

  return (
    <div>
      <Topbar
        title="Payout details"
        actions={
          user?.role === "ADMIN" && payout.status !== "PAID" ? (
            <Button onClick={markPaid} loading={updateStatus.isPending}>
              Mark as paid
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card lg:col-span-1">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-400">Breakdown</h3>
          <dl className="space-y-3 text-sm">
            <Row label="Customer" value={lead?.customerName ?? "—"} />
            <Row label="Loan amount" value={lead ? `₹${lead.amount.toLocaleString("en-IN")}` : "—"} />
            <Row label="Payout rate" value={`${(payout.payoutRate * 100).toFixed(2)}%`} />
            <Row label="Payout amount" value={`₹${payout.payoutAmount.toLocaleString("en-IN")}`} />
            <Row label="Status" value={<PayoutStatusBadge status={payout.status} />} />
            <Row label="Created" value={format(new Date(payout.createdAt), "d MMM yyyy")} />
          </dl>
        </div>

        <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-card lg:col-span-2">
          <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Disbursed → Paid
          </h3>
          <ol className="space-y-6">
            {(timelineData?.logs ?? []).map((log, idx, arr) => (
              <li key={log.id} className="relative flex gap-4">
                {idx < arr.length - 1 && (
                  <span className="absolute left-[15px] top-8 h-full w-px bg-ink-100" aria-hidden />
                )}
                <span
                  className={clsx(
                    "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                    log.status === "PAID"
                      ? "border-status-green bg-status-green text-white"
                      : "border-brand-500 bg-white text-brand-600"
                  )}
                >
                  {log.status === "PAID" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </span>
                <div className="pt-1">
                  <p className="text-sm font-medium text-ink-900">
                    {log.status.charAt(0) + log.status.slice(1).toLowerCase()}
                  </p>
                  <p className="text-xs text-ink-400">{format(new Date(log.timestamp), "d MMM yyyy, h:mm a")}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-400">{label}</dt>
      <dd className="font-medium text-ink-800">{value}</dd>
    </div>
  );
}
