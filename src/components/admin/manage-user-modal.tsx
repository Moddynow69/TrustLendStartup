"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useUpdateUser } from "@/hooks/use-users";
import { ApiClientError } from "@/lib/api-client";
import type { UserProfile, Role } from "@/types";

export function ManageUserModal({
  user,
  open,
  onClose,
}: {
  user: UserProfile | null;
  open: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState<Role>(user?.role ?? "PARTNER");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const updateUser = useUpdateUser(user?.id ?? "");

  if (!user) return null;

  async function handleToggleActive() {
    try {
      await updateUser.mutateAsync({ isActive: !user!.isActive });
      toast.success(user!.isActive ? "Account disabled" : "Account re-enabled");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update account");
    }
  }

  async function handleRoleChange() {
    try {
      await updateUser.mutateAsync({ role });
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update role");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || newPassword.length < 8) {
      setError("Password must be 8+ characters with at least one letter and one number.");
      return;
    }
    try {
      await updateUser.mutateAsync({ newPassword });
      toast.success("Password reset");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to reset password");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={user.name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-900">{user.email}</p>
            <p className="text-xs text-ink-400">{user.isActive ? "Active" : "Disabled"}</p>
          </div>
          <Button
            size="sm"
            variant={user.isActive ? "danger" : "secondary"}
            onClick={handleToggleActive}
            loading={updateUser.isPending}
          >
            {user.isActive ? "Disable" : "Re-enable"}
          </Button>
        </div>

        <div className="flex items-end gap-3">
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={[
              { value: "DSA", label: "DSA" },
              { value: "PARTNER", label: "Partner" },
              { value: "OPERATIONS", label: "Operations" },
              { value: "ADMIN", label: "Admin" },
            ]}
            className="flex-1"
          />
          <Button onClick={handleRoleChange} loading={updateUser.isPending}>
            Update
          </Button>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-3 border-t border-ink-100 pt-4">
          <Input
            label="Reset password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="8+ characters, at least one letter and one number"
          />
          {error && <p className="text-sm text-status-red">{error}</p>}
          <Button type="submit" variant="secondary" loading={updateUser.isPending} className="w-full">
            Set new password
          </Button>
        </form>
      </div>
    </Modal>
  );
}
