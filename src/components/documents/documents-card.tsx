"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { clsx } from "clsx";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDocumentModal } from "@/components/documents/upload-document-modal";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { useDeleteDocument, useLeadDocuments } from "@/hooks/use-documents";
import { ApiClientError } from "@/lib/api-client";
import type { Actor } from "@/lib/business/permissions";
import {
  DOCUMENT_CATEGORIES,
  canDeleteDocument,
  canPurgeDocument,
  canUploadDocuments,
  checklistProgress,
  formatFileSize,
  getChecklist,
  isSingleSlotCategory,
} from "@/lib/business/documents";
import type { DocumentActivity, DocumentCategory, Lead, LeadDocument } from "@/types";

const ACTIVITY_TEXT: Record<DocumentActivity["action"], string> = {
  UPLOADED: "uploaded",
  REPLACED: "uploaded a new copy of",
  VIEWED: "viewed",
  DELETED: "deleted",
  PURGED: "permanently deleted",
  COPY_REQUESTED: "asked for a new copy of",
  REQUEST_RESOLVED: "resolved the new-copy request on",
  COMMENT_DELETED: "deleted a comment on",
  OLD_VERSIONS_REMOVED: "removed old versions (over 30 days) of",
};

type Row = { category: DocumentCategory; doc: LeadDocument | null; required: boolean };

export function DocumentsCard({ lead, user }: { lead: Lead; user: Actor }) {
  const { data, isLoading } = useLeadDocuments(lead.id);
  const deleteDoc = useDeleteDocument(lead.id);

  const [upload, setUpload] = useState<{ category?: DocumentCategory; replacing?: LeadDocument } | null>(null);
  const [viewing, setViewing] = useState<{ docId: string; focusComments: boolean } | null>(null);
  const [deleting, setDeleting] = useState<LeadDocument | null>(null);
  const [permanent, setPermanent] = useState(false);

  const documents = data?.documents ?? [];
  const canUpload = canUploadDocuments(user, lead);
  const progress = checklistProgress(lead.caseType, documents);

  // Checklist slots first (in checklist order), then any "Other" documents.
  const bySlot = new Map(documents.filter((d) => isSingleSlotCategory(d.category)).map((d) => [d.category, d]));
  const rows: Row[] = [
    ...getChecklist(lead.caseType).map((c) => ({ category: c, doc: bySlot.get(c) ?? null, required: true })),
    ...(["PAN", "ADDRESS_PROOF", "BANK_STATEMENT", "INCOME_PROOF", "PROPERTY_PAPERS"] as DocumentCategory[])
      .filter((c) => !getChecklist(lead.caseType).includes(c) && bySlot.get(c))
      .map((c) => ({ category: c, doc: bySlot.get(c)!, required: false })),
    ...documents
      .filter((d) => d.category === "OTHER" && d.file)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((d) => ({ category: d.category, doc: d, required: false })),
  ];
  const emptySlots = rows.filter((r) => !r.doc?.file).map((r) => r.category);
  const uploadable = Array.from(new Set<DocumentCategory>([...emptySlots, "OTHER"]));
  const viewingDoc = viewing ? documents.find((d) => d.id === viewing.docId) ?? null : null;

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteDoc.mutateAsync({ documentId: deleting.id, permanent });
      toast.success(permanent ? "Document permanently deleted" : "Document deleted");
      setDeleting(null);
      setPermanent(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't delete the document");
    }
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Documents</h3>
        {canUpload && (
          <Button size="sm" onClick={() => setUpload({})}>
            Upload document
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-xs text-ink-400">
          <span>{lead.caseType === "SECURED" ? "Secured" : "Unsecured"} loan checklist</span>
          <span>
            <b className="tabular-nums text-ink-900">{progress.done}</b> of{" "}
            <b className="tabular-nums text-ink-900">{progress.required}</b> required
            {progress.needsNewCopy > 0 && ` · ${progress.needsNewCopy} need a new copy`}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
          <div className="h-full bg-status-green transition-[width]" style={{ width: `${(progress.done / progress.required) * 100}%` }} />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-ink-100">
          {rows.map(({ category, doc, required }) => {
            const file = doc?.file ?? null;
            return (
              <li key={doc?.id ?? category} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <span
                  aria-hidden
                  className={clsx(
                    "flex h-9 w-8 items-center justify-center rounded-md font-mono text-[9.5px] font-semibold",
                    !file && "border border-dashed border-ink-200 text-ink-300",
                    file?.contentType === "application/pdf" && "bg-red-50 text-status-red",
                    file && file.contentType !== "application/pdf" && "bg-brand-50 text-brand-600"
                  )}
                >
                  {file ? (file.contentType === "application/pdf" ? "PDF" : file.contentType === "image/png" ? "PNG" : "JPG") : "—"}
                </span>

                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-900">
                    {DOCUMENT_CATEGORIES[category].label}
                    {!required && category !== "OTHER" && <span className="text-xs font-normal text-ink-400">optional</span>}
                    {doc?.newCopyRequest && file && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        New copy requested
                      </span>
                    )}
                  </p>
                  {file ? (
                    <>
                      <p className="break-all font-mono text-xs text-ink-600">{file.name}</p>
                      <p className="text-xs text-ink-400">
                        {formatFileSize(file.size)} · uploaded by {file.uploadedByName} ·{" "}
                        {format(new Date(file.uploadedAt), "d MMM, h:mm a")}
                        {doc && doc.version > 1 && ` · version ${doc.version}`}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-700">Not uploaded yet</p>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-1.5">
                  {file && doc && (
                    <Button size="sm" variant="secondary" onClick={() => setViewing({ docId: doc.id, focusComments: false })}>
                      View
                    </Button>
                  )}
                  {doc && (file || doc.commentCount > 0) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`${doc.commentCount} comment${doc.commentCount === 1 ? "" : "s"} on ${DOCUMENT_CATEGORIES[category].label}`}
                      onClick={() => setViewing({ docId: doc.id, focusComments: true })}
                    >
                      Comments <span className="font-semibold tabular-nums">{doc.commentCount}</span>
                    </Button>
                  )}
                  {file && doc && canUpload && (doc.newCopyRequest || canDeleteDocument(user, lead, doc)) && (
                    <Button size="sm" variant={doc.newCopyRequest ? "primary" : "secondary"} onClick={() => setUpload({ replacing: doc })}>
                      Replace
                    </Button>
                  )}
                  {file && doc && (canDeleteDocument(user, lead, doc) || canPurgeDocument(user)) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-status-red"
                      onClick={() => {
                        setDeleting(doc);
                        // On a closed lead only permanent deletion (Admin) is possible.
                        setPermanent(!canDeleteDocument(user, lead, doc));
                      }}
                    >
                      Delete
                    </Button>
                  )}
                  {!file && canUpload && (
                    <Button size="sm" variant="secondary" onClick={() => setUpload({ category })}>
                      Upload
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(data?.activity.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Document history</h4>
          <ul className="space-y-1.5">
            {data!.activity.slice(0, 8).map((a) => (
              <li key={a.id} className="text-xs text-ink-600">
                <time className="mr-1.5 tabular-nums text-ink-400">{format(new Date(a.at), "d MMM, h:mm a")}</time>
                {a.userName} {ACTIVITY_TEXT[a.action]} {DOCUMENT_CATEGORIES[a.category].label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {upload && (
        <UploadDocumentModal
          key={upload.replacing?.id ?? upload.category ?? "new"}
          leadId={lead.id}
          open
          onClose={() => setUpload(null)}
          categories={uploadable}
          initialCategory={upload.category}
          replacing={upload.replacing ?? null}
        />
      )}

      {viewing && viewingDoc && (
        <DocumentViewer
          key={viewingDoc.id}
          lead={lead}
          user={user}
          doc={viewingDoc}
          focusComments={viewing.focusComments}
          onClose={() => setViewing(null)}
          onReplace={(d) => {
            setViewing(null);
            setUpload({ replacing: d });
          }}
        />
      )}

      <Modal
        open={!!deleting}
        onClose={() => {
          setDeleting(null);
          setPermanent(false);
        }}
        title="Delete document?"
      >
        {deleting?.file && (
          <div className="space-y-3 text-sm text-ink-600">
            <p>
              {canDeleteDocument(user, lead, deleting)
                ? `“${deleting.file.name}” will be removed from this lead. The history keeps a record that it existed and who deleted it.`
                : `This lead is closed, so “${deleting.file.name}” can only be deleted permanently, for an erasure request.`}
            </p>
            {canPurgeDocument(user) && (
              <label className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-status-red">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={permanent}
                  disabled={!canDeleteDocument(user, lead, deleting)}
                  onChange={(e) => setPermanent(e.target.checked)}
                />
                <span>
                  Delete permanently, for a customer&apos;s erasure request. Every version and the comment text are erased
                  and can&apos;t be recovered.
                </span>
              </label>
            )}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setDeleting(null);
              setPermanent(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleteDoc.isPending}>
            {permanent ? "Delete permanently" : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
