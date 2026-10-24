import type {
  CaseType,
  DocumentCategory,
  DocumentContentType,
  Lead,
  LeadDocument,
  Role,
} from "@/types";
import { canViewLead, type Actor } from "@/lib/business/permissions";
import { isTerminalStatus } from "@/lib/business/status-flow";

export const DOCUMENT_CATEGORIES: Record<DocumentCategory, { label: string; hint?: string }> = {
  PAN: { label: "PAN card" },
  ADDRESS_PROOF: {
    label: "Address proof",
    hint: "For Aadhaar, upload a masked copy with only the last 4 digits visible.",
  },
  BANK_STATEMENT: { label: "Bank statement, last 6 months" },
  INCOME_PROOF: { label: "Salary slips or ITR" },
  PROPERTY_PAPERS: { label: "Property papers" },
  OTHER: { label: "Other" },
};

/** Required documents per case type. OTHER is always optional. */
const CHECKLISTS: Record<CaseType, DocumentCategory[]> = {
  SECURED: ["PAN", "ADDRESS_PROOF", "BANK_STATEMENT", "INCOME_PROOF", "PROPERTY_PAPERS"],
  UNSECURED: ["PAN", "ADDRESS_PROOF", "BANK_STATEMENT", "INCOME_PROOF"],
};

export function getChecklist(caseType: CaseType): DocumentCategory[] {
  return CHECKLISTS[caseType];
}

/** Categories that hold one document per lead (everything except OTHER). */
export const isSingleSlotCategory = (category: DocumentCategory) => category !== "OTHER";

export const ALLOWED_CONTENT_TYPES: Record<DocumentContentType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_LEAD = 50;
export const MAX_COMMENT_LENGTH = 1000;

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Returns a user-facing problem with the file, or null if it's acceptable. */
export function validateDocumentFile(contentType: string, size: number): string | null {
  if (!(contentType in ALLOWED_CONTENT_TYPES)) {
    return "Only PDF, JPG and PNG files can be uploaded. Scan or save the document in one of those formats.";
  }
  if (!Number.isFinite(size) || size <= 0) return "The file is empty.";
  if (size > MAX_DOCUMENT_BYTES) {
    return `The file is ${formatFileSize(size)}. The limit is 10 MB; compress it or split it into parts.`;
  }
  return null;
}

/**
 * A safe object name for Storage: keeps letters, digits, dot, dash and
 * underscore, collapses everything else to "_", and caps the length while
 * keeping the extension. The display name is stored separately.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "") || "file";
  if (cleaned.length <= 100) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot).slice(0, 10) : "";
  return cleaned.slice(0, 100 - ext.length) + ext;
}

type LeadAccess = Pick<Lead, "createdBy" | "assignedTo" | "status" | "verificationStatus">;

const isReviewer = (role: Role) => role === "OPERATIONS" || role === "ADMIN";

/** Anyone who can see an open lead can add documents to it. Closed leads are read-only. */
export const canUploadDocuments = (user: Actor, lead: LeadAccess) =>
  canViewLead(user, lead) && !isTerminalStatus(lead.status);

export const canCommentOnDocuments = canUploadDocuments;

/**
 * Soft delete. Admins: any document on an open lead. DSA/Partner: their own
 * uploads until the lead is verified Green. Operations: never.
 */
export function canDeleteDocument(
  user: Actor,
  lead: LeadAccess,
  doc: Pick<LeadDocument, "file">
): boolean {
  if (!canViewLead(user, lead) || isTerminalStatus(lead.status) || !doc.file) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "DSA" || user.role === "PARTNER") {
    return doc.file.uploadedBy === user.id && lead.verificationStatus !== "GREEN";
  }
  return false;
}

/** Permanent removal of every version, for erasure requests. Admin only, any time. */
export const canPurgeDocument = (user: Actor) => user.role === "ADMIN";

/** Operations and Admins can ask for a better copy of an uploaded document. */
export const canRequestNewCopy = (user: Actor, lead: LeadAccess) =>
  isReviewer(user.role) && canViewLead(user, lead) && !isTerminalStatus(lead.status);

export const canDeleteComment = (user: Actor, comment: { authorId: string; system: boolean }) =>
  !comment.system && (user.role === "ADMIN" || comment.authorId === user.id);

/**
 * Checklist status for a lead. A required document counts as done only when
 * it's uploaded and has no open request for a new copy.
 */
export function checklistProgress(
  caseType: CaseType,
  docs: Pick<LeadDocument, "category" | "file" | "newCopyRequest">[]
) {
  const required = getChecklist(caseType);
  const byCategory = new Map(docs.filter((d) => d.file).map((d) => [d.category, d]));
  const missing = required.filter((c) => !byCategory.has(c));
  const needsNewCopy = docs.filter((d) => d.file && d.newCopyRequest).length;
  const done = required.filter((c) => {
    const d = byCategory.get(c);
    return d && !d.newCopyRequest;
  }).length;
  return { required: required.length, done, missing, needsNewCopy };
}
