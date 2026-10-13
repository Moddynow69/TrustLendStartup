"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Wallet, CheckCircle2, Clock, PauseCircle } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { PayoutStatusBadge } from "@/components/leads/status-badge";
import { Select } from "@/components/ui/form";
import { usePayouts } from "@/hooks/use-payouts";
import type { Payout } from "@/types";

export default function PayoutsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { data, isLoading } = usePayouts({ status, limit: 50 });

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: items.length,
      pending: items.filter((p) => p.status === "PENDING").length,
      paid: items.filter((p) => p.status === "PAID").length,
      hold: items.filter((p) => p.status === "HOLD").length,
    };
  }, [data]);

  const columns: Column<Payout>[] = [
    { header: "Lead ID", accessor: (p) => <span className="font-mono text-xs">{p.leadId.slice(0, 10)}…</span> },
    {
      header: "Commission",
      accessor: (p) => (p.commissionAmount != null ? `₹${p.commissionAmount.toLocaleString("en-IN")}` : "—"),
    },
    { header: "DSA/Partner share", accessor: (p) => `${(p.payoutRate * 100).toFixed(2)}%` },
    { header: "Payout", accessor: (p) => `₹${p.payoutAmount.toLocaleString("en-IN")}` },
    { header: "Status", accessor: (p) => <PayoutStatusBadge status={p.status} /> },
    { header: "Created", accessor: (p) => format(new Date(p.createdAt), "d MMM yyyy") },
  ];

  return (
    <div>
      <Topbar title="Payouts" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <DashboardCard label="Total payouts" value={stats.total} icon={Wallet} accent="brand" />
        <DashboardCard label="Pending" value={stats.pending} icon={Clock} accent="yellow" />
        <DashboardCard label="Paid" value={stats.paid} icon={CheckCircle2} accent="green" />
        <DashboardCard label="On hold" value={stats.hold} icon={PauseCircle} accent="red" />
      </div>

      <div className="mb-4">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="All statuses"
          options={[
            { value: "PENDING", label: "Pending" },
            { value: "APPROVED", label: "Approved" },
            { value: "PAID", label: "Paid" },
            { value: "HOLD", label: "Hold" },
          ]}
          className="w-48"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        keyExtractor={(p) => p.id}
        onRowClick={(p) => router.push(`/payouts/${p.id}`)}
        emptyMessage="No payouts yet. Payouts are created automatically when a lead is disbursed."
      />
    </div>
  );
}
