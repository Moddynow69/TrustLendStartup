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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAuth } from "@/hooks/use-auth";
import { canCreateLead } from "@/lib/business/permissions";
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
  // Cursor of each page after the first that we've moved to, so "Previous"
  // can step back one page. Empty = page 1.
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const cursor = pageCursors[pageCursors.length - 1];
  const resetPaging = () => setPageCursors([]);

  // Query once typing pauses, not on every keystroke.
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { data, isLoading, isFetching } = useLeads({
    search: debouncedSearch,
    verificationStatus,
    caseType,
    status,
    cursor,
    limit: 20,
  });

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
          resetPaging();
        }}
        verificationStatus={verificationStatus}
        onVerificationChange={(v) => {
          setVerificationStatus(v);
          resetPaging();
        }}
        caseType={caseType}
        onCaseTypeChange={(v) => {
          setCaseType(v);
          resetPaging();
        }}
        status={status}
        onStatusChange={(v) => {
          setStatus(v);
          resetPaging();
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

      {(data?.nextCursor || pageCursors.length > 0) && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-xs text-ink-400">Page {pageCursors.length + 1}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={pageCursors.length === 0 || isFetching}
            onClick={() => setPageCursors((c) => c.slice(0, -1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.nextCursor || isFetching}
            onClick={() => data?.nextCursor && setPageCursors((c) => [...c, data.nextCursor!])}
          >
            Next
          </Button>
        </div>
      )}

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
