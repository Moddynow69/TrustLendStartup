"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { VerificationBadge } from "@/components/leads/verification-badge";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { AddLeadModal } from "@/components/leads/add-lead-modal";
import { useLeads } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { canCreateLead, canViewAllLeads } from "@/lib/business/permissions";
import type { Lead } from "@/types";
import { format } from "date-fns";

const ALL_STATUSES = [
  { value: "LEAD_SUBMITTED", label: "Lead Submitted" },
  { value: "BANK_SUBMITTED", label: "Bank Submission" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "JVR", label: "JVR" },
  { value: "LOGIN", label: "Log In" },
  { value: "FI", label: "FI" },
  { value: "CREDIT", label: "Credit" },
  { value: "SANCTION", label: "Sanction" },
  { value: "DISBURSED", label: "Disbursed" },
  { value: "REJECTED", label: "Rejected" },
];

export default function LeadsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  const [caseType, setCaseType] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const adminScope = !!user && canViewAllLeads(user.role);
  const { data, isLoading } = useLeads(
    { search, verificationStatus, caseType, status, cursor, limit: 20 },
    adminScope
  );

  const columns: Column<Lead>[] = [
    { header: "Customer", accessor: (l) => <span className="font-medium text-ink-900">{l.customerName}</span> },
    { header: "Product", accessor: (l) => l.productType },
    { header: "Bank", accessor: (l) => l.bank },
    { header: "Case type", accessor: (l) => l.caseType },
    { header: "Verification", accessor: (l) => <VerificationBadge status={l.verificationStatus} /> },
    { header: "Status", accessor: (l) => <LeadStatusBadge status={l.status} /> },
    { header: "Amount", accessor: (l) => `₹${l.amount.toLocaleString("en-IN")}` },
    { header: "Created", accessor: (l) => format(new Date(l.createdAt), "d MMM yyyy") },
  ];

  return (
    <div>
      <Topbar
        title="Leads"
        actions={
          user && canCreateLead(user.role) ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add lead
            </Button>
          ) : undefined
        }
      />

      <LeadFilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setCursor(undefined);
        }}
        verificationStatus={verificationStatus}
        onVerificationChange={(v) => {
          setVerificationStatus(v);
          setCursor(undefined);
        }}
        caseType={caseType}
        onCaseTypeChange={(v) => {
          setCaseType(v);
          setCursor(undefined);
        }}
        status={status}
        onStatusChange={(v) => {
          setStatus(v);
          setCursor(undefined);
        }}
        statusOptions={ALL_STATUSES}
      />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        keyExtractor={(l) => l.id}
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
        emptyMessage="No leads match your filters."
      />

      {(data?.nextCursor || cursor) && (
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" size="sm" disabled={!cursor} onClick={() => setCursor(undefined)}>
            Reset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.nextCursor}
            onClick={() => setCursor(data?.nextCursor ?? undefined)}
          >
            Next page
          </Button>
        </div>
      )}

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
