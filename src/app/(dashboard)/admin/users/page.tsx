"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CreateUserModal } from "@/components/admin/create-user-modal";
import { ManageUserModal } from "@/components/admin/manage-user-modal";
import { useUsers } from "@/hooks/use-users";
import type { UserProfile } from "@/types";
import { clsx } from "clsx";

export default function AdminUsersPage() {
  const { data, isLoading } = useUsers();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<UserProfile | null>(null);

  const columns: Column<UserProfile>[] = [
    { header: "Name", accessor: (u) => <span className="font-medium text-ink-900">{u.name}</span> },
    { header: "Login", accessor: (u) => u.email },
    { header: "Role", accessor: (u) => u.role },
    {
      header: "Status",
      accessor: (u) => (
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
            u.isActive ? "bg-emerald-50 text-status-green" : "bg-red-50 text-status-red"
          )}
        >
          {u.isActive ? "Active" : "Disabled"}
        </span>
      ),
    },
    { header: "Created", accessor: (u) => format(new Date(u.createdAt), "d MMM yyyy") },
  ];

  return (
    <div>
      <Topbar
        title="User management"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create account
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.users ?? []}
        loading={isLoading}
        keyExtractor={(u) => u.id}
        onRowClick={(u) => setSelected(u)}
        emptyMessage="No accounts yet."
      />

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ManageUserModal user={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
