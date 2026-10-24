"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { UploadCloud } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useUploadDocument } from "@/hooks/use-documents";
import { ApiClientError } from "@/lib/api-client";
import { DOCUMENT_CATEGORIES, formatFileSize, validateDocumentFile } from "@/lib/business/documents";
import { shrinkImage } from "@/lib/client/shrink-image";
import type { DocumentCategory, LeadDocument } from "@/types";

/**
 * Upload a new document, or a new copy of an existing one (`replacing`).
 * `categories` are the slots that can take a new upload.
 */
export function UploadDocumentModal({
  leadId,
  open,
  onClose,
  categories,
  initialCategory,
  replacing,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
  categories: DocumentCategory[];
  initialCategory?: DocumentCategory;
  replacing?: LeadDocument | null;
}) {
  const upload = useUploadDocument(leadId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<DocumentCategory | "">(
    replacing?.category ?? initialCategory ?? categories[0] ?? ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const activeCategory = replacing?.category ?? category;
  const hint = activeCategory ? DOCUMENT_CATEGORIES[activeCategory].hint : undefined;

  function close() {
    if (upload.isPending) return;
    setFile(null);
    setOriginalSize(null);
    setError(null);
    setProgress(null);
    onClose();
  }

  async function pick(picked: File | undefined) {
    setError(null);
    setFile(null);
    setOriginalSize(null);
    if (!picked) return;
    // Check the type first, then shrink large photos (which can also bring a
    // 12 MB photo under the 10 MB limit) before checking the size.
    const typeProblem = validateDocumentFile(picked.type, 1);
    if (typeProblem) {
      setError(`“${picked.name}”: ${typeProblem}`);
      return;
    }
    setPreparing(true);
    const f = await shrinkImage(picked);
    setPreparing(false);
    const problem = validateDocumentFile(f.type, f.size);
    if (problem) {
      setError(`“${picked.name}”: ${problem}`);
      return;
    }
    setFile(f);
    if (f !== picked) setOriginalSize(picked.size);
  }

  async function handleUpload() {
    if (!file || !activeCategory) return;
    setError(null);
    setProgress(0);
    try {
      await upload.mutateAsync({
        file,
        category: activeCategory,
        documentId: replacing?.id,
        onProgress: setProgress,
      });
      toast.success(replacing ? "New copy uploaded" : `${DOCUMENT_CATEGORIES[activeCategory].label} uploaded`);
      setFile(null);
      setProgress(null);
      onClose();
    } catch (err) {
      setProgress(null);
      setError(err instanceof ApiClientError ? err.message : "The upload failed. Try again.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={replacing ? `Upload a new copy: ${DOCUMENT_CATEGORIES[replacing.category].label}` : "Upload document"}
    >
      <div className="space-y-4">
        {!replacing && (
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            options={categories.map((c) => ({ value: c, label: DOCUMENT_CATEGORIES[c].label }))}
          />
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          disabled={upload.isPending}
          className={clsx(
            "focus-ring flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm",
            dragging ? "border-brand-500 bg-brand-50" : "border-brand-200 bg-brand-50/60"
          )}
        >
          <UploadCloud className="h-6 w-6 text-brand-600" aria-hidden />
          <span className="text-ink-700">
            <span className="font-semibold text-brand-700">Choose a file</span> or drag it here
          </span>
          <span className="text-xs text-ink-400">PDF, JPG or PNG, up to 10 MB</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {hint && <p className="text-xs text-ink-500">{hint}</p>}

        {preparing && <p className="text-sm text-ink-500">Preparing photo…</p>}
        {file && (
          <p className="break-all text-sm text-ink-700">
            {file.name} · {formatFileSize(file.size)}
            {originalSize && (
              <span className="text-ink-400"> (reduced from {formatFileSize(originalSize)} to save storage)</span>
            )}
          </p>
        )}

        {progress !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-red">{error}</p>}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={close} disabled={upload.isPending}>
          Cancel
        </Button>
        <Button onClick={handleUpload} loading={upload.isPending} disabled={!file || !activeCategory || preparing}>
          Upload
        </Button>
      </div>
    </Modal>
  );
}
