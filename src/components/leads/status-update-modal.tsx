"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useUpdateLeadStatus } from "@/hooks/use-leads";
import { getNextValidStatuses, STATUS_LABELS } from "@/lib/business/status-flow";
import { ApiClientError } from "@/lib/api-client";
import type { CaseType, LeadStatus } from "@/types";
import { clsx } from "clsx";

export function StatusUpdateModal({
  leadId,
  caseType,
  currentStatus,
  open,
  onClose,
}: {
  leadId: string;
  caseType: CaseType;
  currentStatus: LeadStatus;
  open: boolean;
  onClose: () => void;
}) {
  const nextOptions = getNextValidStatuses(caseType, currentStatus);
  const [selected, setSelected] = useState<LeadStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const mutation = useUpdateLeadStatus(leadId);

  const isRejectSelected = selected === "REJECTED";

  async function handleSubmit() {
    if (!selected) return;
    if (isRejectSelected && !rejectionReason.trim()) return;

    try {
      await mutation.mutateAsync({
        status: selected,
        rejectionReason: isRejectSelected ? rejectionReason : undefined,
      });
      toast.success(`Lead moved to ${STATUS_LABELS[selected] ?? selected}`);
      setSelected(null);
      setRejectionReason("");
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
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={isRejectSelected ? "danger" : "primary"}
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={!selected || (isRejectSelected && !rejectionReason.trim())}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
