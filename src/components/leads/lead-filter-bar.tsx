"use client";

import { Search } from "lucide-react";
import { Select } from "@/components/ui/form";

interface LeadFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  verificationStatus: string;
  onVerificationChange: (v: string) => void;
  caseType: string;
  onCaseTypeChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  statusOptions: { value: string; label: string }[];
}

export function LeadFilterBar({
  search,
  onSearchChange,
  verificationStatus,
  onVerificationChange,
  caseType,
  onCaseTypeChange,
  status,
  onStatusChange,
  statusOptions,
}: LeadFilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by customer name"
          className="focus-ring w-full rounded-lg border border-ink-100 bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-ink-300"
        />
      </div>

      <Select
        value={caseType}
        onChange={(e) => onCaseTypeChange(e.target.value)}
        placeholder="All case types"
        options={[
          { value: "SECURED", label: "Secured" },
          { value: "UNSECURED", label: "Unsecured" },
        ]}
        className="w-44"
      />

      <Select
        value={verificationStatus}
        onChange={(e) => onVerificationChange(e.target.value)}
        placeholder="All verification"
        options={[
          { value: "RED", label: "Red — Not doable" },
          { value: "YELLOW", label: "Yellow — Docs pending" },
          { value: "GREEN", label: "Green — Ready" },
        ]}
        className="w-52"
      />

      <Select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        placeholder="All statuses"
        options={statusOptions}
        className="w-48"
      />
    </div>
  );
}
