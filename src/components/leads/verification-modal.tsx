"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useSetVerificationStatus } from "@/hooks/use-leads";
import { ApiClientError } from "@/lib/api-client";
import { clsx } from "clsx";

const OPTIONS = [
  { value: "RED" as const, label: "Red — Not doable", desc: "Lead is closed and does not proceed", dot: "bg-status-red" },
  { value: "YELLOW" as const, label: "Yellow — Docs pending", desc: "Waiting on documents from the customer", dot: "bg-status-yellow" },
  { value: "GREEN" as const, label: "Green — Ready", desc: "All documents submitted; ready for bank submission", dot: "bg-status-green" },
];

export function VerificationModal({
  leadId,
  open,
  onClose,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<"RED" | "YELLOW" | "GREEN" | null>(null);
  const [note, setNote] = useState("");
  const mutation = useSetVerificationStatus(leadId);

  async function handleSubmit() {
    if (!selected) return;
    try {
      await mutation.mutateAsync({ verificationStatus: selected, note: note || undefined });
      toast.success("Verification status updated");
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
        {OPTIONS.map((opt) => (
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

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note"
          rows={2}
          className="focus-ring mt-2 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm placeholder:text-ink-300"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={mutation.isPending} disabled={!selected}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
