"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Topbar } from "@/components/layout/topbar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { VerificationBadge } from "@/components/leads/verification-badge";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { useLeads } from "@/hooks/use-leads";
import type { Lead } from "@/types";

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

export default function AdminPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  const [caseType, setCaseType] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading } = useLeads(
    { search, verificationStatus, caseType, status, limit: 50 },
    true
  );

  const columns: Column<Lead>[] = [
    { header: "Customer", accessor: (l) => <span className="font-medium text-ink-900">{l.customerName}</span> },
    { header: "Case type", accessor: (l) => l.caseType },
    { header: "Verification", accessor: (l) => <VerificationBadge status={l.verificationStatus} /> },
    { header: "Status", accessor: (l) => <LeadStatusBadge status={l.status} /> },
    { header: "Assigned to", accessor: (l) => <span className="font-mono text-xs">{l.assignedTo.slice(0, 8)}…</span> },
    { header: "Amount", accessor: (l) => `₹${l.amount.toLocaleString("en-IN")}` },
    { header: "Created", accessor: (l) => format(new Date(l.createdAt), "d MMM yyyy") },
  ];

  return (
    <div>
      <Topbar title="Admin panel" />

      <LeadFilterBar
        search={search}
        onSearchChange={setSearch}
        verificationStatus={verificationStatus}
        onVerificationChange={setVerificationStatus}
        caseType={caseType}
        onCaseTypeChange={setCaseType}
        status={status}
        onStatusChange={setStatus}
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
    </div>
  );
}
