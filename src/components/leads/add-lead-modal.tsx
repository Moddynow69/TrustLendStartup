"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useCreateLead } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";

export function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const createLead = useCreateLead();

  const [form, setForm] = useState({
    customerName: "",
    productType: "",
    amount: "",
    bank: "",
    caseType: "SECURED",
  });
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const amount = Number(form.amount);
    if (!form.customerName || !form.productType || !form.bank || !amount) {
      setError("Please fill in all fields with a valid amount.");
      return;
    }

    try {
      await createLead.mutateAsync({
        customerName: form.customerName,
        productType: form.productType,
        amount,
        bank: form.bank,
        caseType: form.caseType as "SECURED" | "UNSECURED",
        assignedTo: user.id,
      });
      toast.success("Lead created");
      setForm({ customerName: "", productType: "", amount: "", bank: "", caseType: "SECURED" });
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create lead");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add lead">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Customer name"
          value={form.customerName}
          onChange={(e) => update("customerName", e.target.value)}
        />
        <Input
          label="Product type"
          placeholder="e.g. Home Loan, Business Loan"
          value={form.productType}
          onChange={(e) => update("productType", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Loan amount (₹)"
            type="number"
            min="1"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
          />
          <Input label="Bank" value={form.bank} onChange={(e) => update("bank", e.target.value)} />
        </div>
        <Select
          label="Case type"
          value={form.caseType}
          onChange={(e) => update("caseType", e.target.value)}
          options={[
            { value: "SECURED", label: "Secured" },
            { value: "UNSECURED", label: "Unsecured" },
          ]}
        />

        {error && <p className="text-sm text-status-red">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createLead.isPending}>
            Create lead
          </Button>
        </div>
      </form>
    </Modal>
  );
}
