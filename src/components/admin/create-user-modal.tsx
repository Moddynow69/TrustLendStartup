"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useCreateUser } from "@/hooks/use-users";
import { ApiClientError } from "@/lib/api-client";
import type { Role } from "@/types";

export function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUser();
  const [form, setForm] = useState({
    name: "",
    loginType: "email" as "email" | "username",
    identifier: "",
    password: "",
    role: "PARTNER" as Role,
  });
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.identifier || !form.password) {
      setError("Please fill in all fields.");
      return;
    }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password) || form.password.length < 8) {
      setError("Password must be 8+ characters with at least one letter and one number.");
      return;
    }

    try {
      await createUser.mutateAsync({
        name: form.name,
        password: form.password,
        role: form.role,
        ...(form.loginType === "email" ? { email: form.identifier } : { username: form.identifier }),
      });
      toast.success("Account created");
      setForm({ name: "", loginType: "email", identifier: "", password: "", role: "PARTNER" });
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create account");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Full name" value={form.name} onChange={(e) => update("name", e.target.value)} />

        <Select
          label="Login type"
          value={form.loginType}
          onChange={(e) => update("loginType", e.target.value as "email" | "username")}
          options={[
            { value: "email", label: "Email address" },
            { value: "username", label: "Username" },
          ]}
        />

        <Input
          label={form.loginType === "email" ? "Email" : "Username"}
          value={form.identifier}
          onChange={(e) => update("identifier", e.target.value)}
          placeholder={form.loginType === "email" ? "agent@company.com" : "rahul.k"}
        />

        <Input
          label="Initial password"
          type="text"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          hint="8+ characters, at least one letter and one number"
        />

        <Select
          label="Role"
          value={form.role}
          onChange={(e) => update("role", e.target.value as Role)}
          options={[
            { value: "DSA", label: "DSA" },
            { value: "PARTNER", label: "Partner" },
            { value: "OPERATIONS", label: "Operations" },
            { value: "ADMIN", label: "Admin" },
          ]}
        />

        {error && <p className="text-sm text-status-red">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createUser.isPending}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
