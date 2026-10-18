"use client";

import { useRouter } from "next/navigation";
import { FileText, CheckCircle2, Wallet, AlertCircle, XCircle } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CardSkeleton } from "@/components/ui/skeleton";
import { VerificationBadge } from "@/components/leads/verification-badge";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { useLeads } from "@/hooks/use-leads";
import { useDashboardStats } from "@/hooks/use-dashboard";
import type { Lead } from "@/types";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  // Counts come from the server (exact, however many leads exist); only the
  // eight most recent leads are loaded for the table.
  const { data: statsData, isLoading: statsLoading } = useDashboardStats();
  const { data: leadsData, isLoading: leadsLoading } = useLeads({ limit: 8 });
  const stats = statsData?.stats;
  const recent = leadsData?.items ?? [];

  const columns: Column<Lead>[] = [
    { header: "Customer", accessor: (l) => <span className="font-medium text-ink-900">{l.customerName}</span> },
    { header: "Case type", accessor: (l) => l.caseType },
    { header: "Verification", accessor: (l) => <VerificationBadge status={l.verificationStatus} /> },
    { header: "Status", accessor: (l) => <LeadStatusBadge status={l.status} /> },
    { header: "Amount", accessor: (l) => `₹${l.amount.toLocaleString("en-IN")}` },
    { header: "Created", accessor: (l) => format(new Date(l.createdAt), "d MMM yyyy") },
  ];

  return (
    <div>
      <Topbar title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsLoading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <DashboardCard label="Total leads" value={stats.totalLeads} icon={FileText} accent="brand" />
            <DashboardCard label="Disbursed" value={stats.disbursed} icon={CheckCircle2} accent="green" />
            <DashboardCard label="Pending payouts" value={stats.pendingPayouts} icon={Wallet} accent="yellow" />
            <DashboardCard label="Rejected" value={stats.rejected} icon={XCircle} accent="red" />
          </>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {statsLoading || !stats ? (
          Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <DashboardCard label="Red — Not doable" value={stats.red} icon={AlertCircle} accent="red" />
            <DashboardCard label="Yellow — Docs pending" value={stats.yellow} icon={AlertCircle} accent="yellow" />
            <DashboardCard label="Green — Ready" value={stats.green} icon={CheckCircle2} accent="green" />
          </>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Recent leads</h2>
      <DataTable
        columns={columns}
        data={recent}
        loading={leadsLoading}
        keyExtractor={(l) => l.id}
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
        emptyMessage="No leads yet. Create your first lead from the Leads page."
      />
    </div>
  );
}
