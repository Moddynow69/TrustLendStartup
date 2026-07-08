"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationBadge } from "@/components/leads/verification-badge";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import { LeadTimeline } from "@/components/leads/lead-timeline";
import { VerificationModal } from "@/components/leads/verification-modal";
import { StatusUpdateModal } from "@/components/leads/status-update-modal";
import { useLead, useLeadTimeline } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { canSetVerificationStatus, canUpdateCaseStatus } from "@/lib/business/permissions";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading } = useLead(id);
  const { data: timelineData } = useLeadTimeline(id);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const lead = data.lead;
  const canVerify = user && canSetVerificationStatus(user.role);
  const canProgress = user && canUpdateCaseStatus(user.role) && lead.verificationStatus === "GREEN";

  return (
    <div>
      <Topbar
        title={lead.customerName}
        actions={
          <>
            {canVerify && (
              <Button variant="secondary" onClick={() => setVerifyOpen(true)}>
                Set verification
              </Button>
            )}
            {canProgress && <Button onClick={() => setStatusOpen(true)}>Update status</Button>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-400">
              Lead details
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Product" value={lead.productType} />
              <Row label="Bank" value={lead.bank} />
              <Row label="Amount" value={`₹${lead.amount.toLocaleString("en-IN")}`} />
              <Row label="Case type" value={lead.caseType} />
              <Row label="Verification" value={<VerificationBadge status={lead.verificationStatus} />} />
              <Row label="Status" value={<LeadStatusBadge status={lead.status} />} />
              <Row label="Created" value={format(new Date(lead.createdAt), "d MMM yyyy, h:mm a")} />
            </dl>

            {lead.status === "REJECTED" && lead.rejectionReason && (
              <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-status-red">
                <p className="font-medium">Rejection reason</p>
                <p>{lead.rejectionReason}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-card">
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-ink-400">Timeline</h3>
            <LeadTimeline
              caseType={lead.caseType}
              currentStatus={lead.status}
              logs={timelineData?.logs ?? []}
              rejectionReason={lead.rejectionReason}
            />
          </div>
        </div>
      </div>

      {canVerify && (
        <VerificationModal leadId={lead.id} open={verifyOpen} onClose={() => setVerifyOpen(false)} />
      )}
      {canProgress && (
        <StatusUpdateModal
          leadId={lead.id}
          caseType={lead.caseType}
          currentStatus={lead.status}
          open={statusOpen}
          onClose={() => setStatusOpen(false)}
        />
      )}
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
