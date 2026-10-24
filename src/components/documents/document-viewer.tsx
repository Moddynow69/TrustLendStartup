"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchDocumentViewUrl,
  useAddComment,
  useDeleteComment,
  useDocumentComments,
  useResolveRequest,
} from "@/hooks/use-documents";
import { ApiClientError } from "@/lib/api-client";
import type { Actor } from "@/lib/business/permissions";
import {
  DOCUMENT_CATEGORIES,
  MAX_COMMENT_LENGTH,
  canCommentOnDocuments,
  canDeleteComment,
  canRequestNewCopy,
  canUploadDocuments,
} from "@/lib/business/documents";
import type { Lead, LeadDocument } from "@/types";

const ROLE_LABEL: Record<string, string> = {
  DSA: "DSA",
  PARTNER: "Partner",
  OPERATIONS: "Operations",
  ADMIN: "Admin",
};

/** The document (via a short-lived link) with its comment thread alongside. */
export function DocumentViewer({
  lead,
  user,
  doc,
  focusComments,
  onClose,
  onReplace,
}: {
  lead: Lead;
  user: Actor;
  doc: LeadDocument;
  focusComments: boolean;
  onClose: () => void;
  onReplace: (doc: LeadDocument) => void;
}) {
  const [link, setLink] = useState<{ url: string; expiresAt: Date } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [requestNewCopy, setRequestNewCopy] = useState(false);

  const { data: commentsData, isLoading: commentsLoading } = useDocumentComments(lead.id, doc.id);
  const addComment = useAddComment(lead.id, doc.id);
  const deleteComment = useDeleteComment(lead.id, doc.id);
  const resolve = useResolveRequest(lead.id, doc.id);

  const label = DOCUMENT_CATEGORIES[doc.category].label;
  const canComment = canCommentOnDocuments(user, lead);
  const canRequest = canRequestNewCopy(user, lead) && !!doc.file && !doc.newCopyRequest;

  useEffect(() => {
    if (!doc.file) return;
    let cancelled = false;
    fetchDocumentViewUrl(lead.id, doc.id)
      .then((r) => !cancelled && setLink({ url: r.url, expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000) }))
      .catch((err) => !cancelled && setLinkError(err instanceof ApiClientError ? err.message : "Couldn't open the document."));
    return () => {
      cancelled = true;
    };
  }, [lead.id, doc.id, doc.file]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await addComment.mutateAsync({ body: body.trim(), requestNewCopy: requestNewCopy || undefined });
      toast.success(requestNewCopy ? "Comment posted and new copy requested" : "Comment posted");
      setBody("");
      setRequestNewCopy(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't post the comment");
    }
  }

  const comments = commentsData?.comments ?? [];

  return (
    <Modal open onClose={onClose} title={label} size="lg">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Document */}
        <div className="min-w-0 space-y-2 lg:col-span-3">
          <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
            {!doc.file ? (
              <p className="p-6 text-center text-sm text-ink-400">No file uploaded yet.</p>
            ) : linkError ? (
              <p className="p-6 text-center text-sm text-status-red">{linkError}</p>
            ) : !link ? (
              <Skeleton className="h-[320px] w-full" />
            ) : doc.file.contentType === "application/pdf" ? (
              <iframe src={link.url} title={doc.file.name} className="h-[60vh] w-full bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.url} alt={label} className="max-h-[60vh] object-contain" />
            )}
          </div>
          {doc.file && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
              <span className="break-all">
                {doc.file.name}
                {link && ` · link expires at ${format(link.expiresAt, "h:mm a")} · this view is recorded`}
              </span>
              {link && (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
                >
                  Open in new tab <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Comments */}
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-ink-100 p-4 lg:col-span-2" aria-label="Comments">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Comments</h3>
            <span className="text-xs text-ink-400">{doc.commentCount}</span>
          </div>

          {doc.newCopyRequest && (
            <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
              <p>
                {doc.newCopyRequest.byName} asked for a new copy on{" "}
                {format(new Date(doc.newCopyRequest.at), "d MMM, h:mm a")}. Uploading a replacement resolves it.
              </p>
              <div className="flex flex-wrap gap-2">
                {canUploadDocuments(user, lead) && (
                  <Button size="sm" variant="secondary" onClick={() => onReplace(doc)}>
                    Upload new copy
                  </Button>
                )}
                {canRequestNewCopy(user, lead) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={resolve.isPending}
                    onClick={() =>
                      resolve.mutateAsync().then(
                        () => toast.success("Request resolved"),
                        (err) => toast.error(err instanceof ApiClientError ? err.message : "Couldn't resolve it")
                      )
                    }
                  >
                    Mark resolved
                  </Button>
                )}
              </div>
            </div>
          )}

          <ul className="max-h-80 space-y-3 overflow-y-auto">
            {commentsLoading && <Skeleton className="h-12 w-full" />}
            {!commentsLoading && comments.length === 0 && (
              <li className="text-sm text-ink-400">
                No comments yet. Note anything about this document here, such as a mismatch or a missing page.
              </li>
            )}
            {comments.map((c) => (
              <li key={c.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline gap-1.5 text-xs">
                  {!c.system && <span className="font-semibold text-ink-900">{c.authorName}</span>}
                  {c.authorRole && (
                    <span className="rounded-full border border-ink-100 bg-ink-50 px-1.5 text-[11px] text-ink-400">
                      {ROLE_LABEL[c.authorRole]}
                    </span>
                  )}
                  <span className="text-ink-400">{format(new Date(c.createdAt), "d MMM, h:mm a")}</span>
                </div>
                {c.body === null ? (
                  <p className="text-sm italic text-ink-400">Comment deleted{c.deletedByName ? ` by ${c.deletedByName}` : ""}.</p>
                ) : (
                  <p className={c.system ? "text-sm italic text-ink-500" : "whitespace-pre-wrap break-words text-sm text-ink-700"}>
                    {c.body}
                  </p>
                )}
                {c.requestsNewCopy && c.body !== null && (
                  <span className="text-xs font-medium text-amber-700">Asked for a new copy</span>
                )}
                {c.body !== null && canDeleteComment(user, c) && (
                  <button
                    type="button"
                    className="focus-ring block text-xs text-ink-400 underline underline-offset-2 hover:text-status-red"
                    onClick={() =>
                      deleteComment.mutateAsync(c.id).catch((err) =>
                        toast.error(err instanceof ApiClientError ? err.message : "Couldn't delete the comment")
                      )
                    }
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canComment ? (
            <form onSubmit={submit} className="space-y-2 border-t border-ink-100 pt-3">
              <label htmlFor={`comment-${doc.id}`} className="text-sm font-medium text-ink-700">
                Add a comment
              </label>
              <textarea
                id={`comment-${doc.id}`}
                autoFocus={focusComments}
                value={body}
                maxLength={MAX_COMMENT_LENGTH}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement).requestSubmit();
                  }
                }}
                rows={3}
                placeholder="e.g. Name on the statement doesn't match the PAN card"
                className="focus-ring w-full rounded-lg border border-ink-100 px-3 py-2 text-sm placeholder:text-ink-300"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {canRequest ? (
                  <label className="inline-flex items-center gap-2 text-sm text-ink-600">
                    <input
                      type="checkbox"
                      checked={requestNewCopy}
                      onChange={(e) => setRequestNewCopy(e.target.checked)}
                    />
                    Ask for a new copy
                  </label>
                ) : (
                  <span />
                )}
                <span className="text-xs tabular-nums text-ink-400">
                  {body.length} / {MAX_COMMENT_LENGTH}
                </span>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={addComment.isPending} disabled={!body.trim()}>
                  Comment
                </Button>
              </div>
            </form>
          ) : (
            <p className="border-t border-ink-100 pt-3 text-xs text-ink-400">This lead is closed, so comments are read-only.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
