"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useUpdateLeadStatus } from "@/hooks/use-leads";
import { getNextValidStatuses, STATUS_LABELS } from "@/lib/business/status-flow";
import { calculatePayout, PAYOUT_PLANS } from "@/lib/business/payout-plans";
import { ApiClientError } from "@/lib/api-client";
import type { CaseType, LeadStatus, PayoutPlan } from "@/types";
import { clsx } from "clsx";

export function StatusUpdateModal({
  leadId,
  caseType,
  currentStatus,
  amount,
  selectedPlan,
  open,
  onClose,
}: {
  leadId: string;
  caseType: CaseType;
  currentStatus: LeadStatus;
  amount: number;
  selectedPlan: PayoutPlan;
  open: boolean;
  onClose: () => void;
}) {
  const nextOptions = getNextValidStatuses(caseType, currentStatus);
  const [selected, setSelected] = useState<LeadStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [commissionInput, setCommissionInput] = useState("");
  const mutation = useUpdateLeadStatus(leadId);

  const isRejectSelected = selected === "REJECTED";
  const isDisburseSelected = selected === "DISBURSED";

  const commissionPct = Number(commissionInput);
  const commissionValid =
    commissionInput.trim() !== "" && Number.isFinite(commissionPct) && commissionPct > 0 && commissionPct <= 100;
  // The PERSONALIZED split depends on the creator's profile, which only the
  // server resolves, so the preview shows the DSA share for fixed plans only.
  const preview =
    commissionValid && selectedPlan !== "PERSONALIZED"
      ? calculatePayout(amount, commissionPct / 100, PAYOUT_PLANS[selectedPlan].rate)
      : null;
  const commissionAmount = commissionValid ? calculatePayout(amount, commissionPct / 100, 0).commissionAmount : null;

  async function handleSubmit() {
    if (!selected) return;
    if (isRejectSelected && !rejectionReason.trim()) return;
    if (isDisburseSelected && !commissionValid) return;

    try {
      await mutation.mutateAsync({
        status: selected,
        rejectionReason: isRejectSelected ? rejectionReason : undefined,
        commissionRate: isDisburseSelected ? commissionPct : undefined,
      });
      toast.success(`Lead moved to ${STATUS_LABELS[selected] ?? selected}`);
      setSelected(null);
      setRejectionReason("");
      setCommissionInput("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update status");
    }
  }

  if (nextOptions.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Update status">
        <p className="text-sm text-ink-500">
          This lead is at a terminal stage ({STATUS_LABELS[currentStatus] ?? currentStatus}) and cannot move further.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Update status">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-ink-400">
          Current: {STATUS_LABELS[currentStatus] ?? currentStatus}
        </p>
        {nextOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setSelected(opt)}
            className={clsx(
              "focus-ring block w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
              selected === opt
                ? opt === "REJECTED"
                  ? "border-status-red bg-red-50 text-status-red"
                  : "border-brand-500 bg-brand-50 text-brand-700"
                : "border-ink-100 text-ink-700 hover:bg-ink-50"
            )}
          >
            {STATUS_LABELS[opt] ?? opt}
          </button>
        ))}

        {isRejectSelected && (
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            rows={3}
            className="focus-ring w-full rounded-lg border border-ink-100 px-3 py-2 text-sm placeholder:text-ink-300"
          />
        )}

        {isDisburseSelected && (
          <div className="space-y-2">
            <Input
              label="Lender commission (% of loan amount)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 1.5"
              value={commissionInput}
              onChange={(e) => setCommissionInput(e.target.value)}
              error={
                commissionInput.trim() !== "" && !commissionValid
                  ? "Enter a percentage greater than 0 and at most 100."
                  : undefined
              }
            />
            {commissionAmount != null && (
              <dl className="space-y-1 rounded-lg bg-ink-50 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Commission</dt>
                  <dd className="font-medium text-ink-900">₹{commissionAmount.toLocaleString("en-IN")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">
                    DSA/Partner payout
                    {preview ? ` (${Math.round(preview.payoutRate * 100)}%, ${selectedPlan} plan)` : ""}
                  </dt>
                  <dd className="font-medium text-ink-900">
                    {preview
                      ? `₹${preview.payoutAmount.toLocaleString("en-IN")}`
                      : "Split by creator's personalized rate"}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={isRejectSelected ? "danger" : "primary"}
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={
            !selected ||
            (isRejectSelected && !rejectionReason.trim()) ||
            (isDisburseSelected && !commissionValid)
          }
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
