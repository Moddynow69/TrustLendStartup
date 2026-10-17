"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useSetVerificationStatus } from "@/hooks/use-leads";
import { ApiClientError } from "@/lib/api-client";
import { allowedVerificationColors, verificationRejectsLead } from "@/lib/business/verification";
import { STATUS_LABELS } from "@/lib/business/status-flow";
import type { LeadStatus } from "@/types";
import { clsx } from "clsx";

const OPTIONS = [
  { value: "RED" as const, label: "Red — Not doable", desc: "Lead is closed and does not proceed", dot: "bg-status-red" },
  { value: "YELLOW" as const, label: "Yellow — Docs pending", desc: "Waiting on documents from the customer", dot: "bg-status-yellow" },
  { value: "GREEN" as const, label: "Green — Ready", desc: "All documents submitted; ready for bank submission", dot: "bg-status-green" },
];

export function VerificationModal({
  leadId,
  leadStatus,
  open,
  onClose,
}: {
  leadId: string;
  leadStatus: LeadStatus;
  open: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<"RED" | "YELLOW" | "GREEN" | null>(null);
  const [note, setNote] = useState("");
  const mutation = useSetVerificationStatus(leadId);

  const allowed = allowedVerificationColors(leadStatus);
  const options = OPTIONS.filter((opt) => allowed.includes(opt.value));
  // RED on a lead already in the lender stages rejects it, so a reason is required.
  const rejects = selected != null && verificationRejectsLead(leadStatus, selected);
  const missingReason = rejects && !note.trim();

  async function handleSubmit() {
    if (!selected || missingReason) return;
    try {
      await mutation.mutateAsync({ verificationStatus: selected, note: note.trim() || undefined });
      toast.success(rejects ? "Lead rejected" : "Verification status updated");
      setSelected(null);
      setNote("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Set verification status">
      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={clsx(
              "focus-ring flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              selected === opt.value ? "border-brand-500 bg-brand-50" : "border-ink-100 hover:bg-ink-50"
            )}
          >
            <span className={clsx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", opt.dot)} />
            <span>
              <span className="block text-sm font-medium text-ink-900">{opt.label}</span>
              <span className="block text-xs text-ink-400">{opt.desc}</span>
            </span>
          </button>
        ))}

        {rejects && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-red">
            This lead is at {STATUS_LABELS[leadStatus] ?? leadStatus}. Setting it to Red rejects it, and a
            rejected lead can&apos;t be reopened.
          </p>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={rejects ? "Reason for rejection (required)" : "Optional note"}
          rows={2}
          className="focus-ring mt-2 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm placeholder:text-ink-300"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={rejects ? "danger" : "primary"}
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={!selected || missingReason}
        >
          {rejects ? "Reject lead" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
