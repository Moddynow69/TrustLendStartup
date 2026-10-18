"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useUsers } from "@/hooks/use-users";
import { useReassignLead } from "@/hooks/use-leads";
import { ApiClientError } from "@/lib/api-client";
import type { Lead } from "@/types";

/**
 * Admin-only: hand a lead to another DSA/PARTNER. Mirrors the server rules
 * in `reassignLead` so the admin only sees people the server will accept.
 */
export function ReassignLeadModal({
  lead,
  assignedToName,
  open,
  onClose,
}: {
  lead: Pick<Lead, "id" | "assignedTo" | "selectedPlan">;
  assignedToName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useUsers();
  const reassign = useReassignLead(lead.id);
  const [assigneeId, setAssigneeId] = useState("");
  const [note, setNote] = useState("");

  const eligible = (data?.users ?? []).filter(
    (u) => (u.role === "DSA" || u.role === "PARTNER") && u.isActive && u.id !== lead.assignedTo
  );
  // On the Personalized plan, the assignee's own rate is used at disbursal.
  const needsRate = lead.selectedPlan === "PERSONALIZED";
  const options = eligible.filter((u) => !needsRate || u.personalizedPayoutRate != null);
  const hiddenForRate = eligible.length - options.length;

  function close() {
    setAssigneeId("");
    setNote("");
    onClose();
  }

  async function handleSubmit() {
    if (!assigneeId) return;
    try {
      await reassign.mutateAsync({ assignedTo: assigneeId, note: note.trim() || undefined });
      toast.success("Lead reassigned");
      close();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to reassign lead");
    }
  }

  return (
    <Modal open={open} onClose={close} title="Reassign lead">
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          Currently assigned to <span className="font-medium text-ink-900">{assignedToName ?? "—"}</span>. The new
          assignee sees this lead alongside its creator, and is paid if it&apos;s disbursed while assigned to them.
        </p>

        <Select
          label="Assign to"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          placeholder={isLoading ? "Loading…" : options.length ? "Choose a DSA or partner" : "No one available"}
          options={options.map((u) => ({
            value: u.id,
            label: `${u.name} (${u.role === "DSA" ? "DSA" : "Partner"})`,
          }))}
          hint={
            hiddenForRate > 0
              ? `${hiddenForRate} ${hiddenForRate === 1 ? "person isn't" : "people aren't"} listed: this lead is on the Personalized plan and they have no personalized rate.`
              : undefined
          }
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional reason (added to the lead's history)"
          rows={2}
          className="focus-ring w-full rounded-lg border border-ink-100 px-3 py-2 text-sm placeholder:text-ink-300"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={reassign.isPending} disabled={!assigneeId}>
          Reassign
        </Button>
      </div>
    </Modal>
  );
}
