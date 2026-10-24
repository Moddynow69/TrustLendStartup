import { describe, expect, it } from "vitest";
import type { LeadStatus, Role, UserProfile, VerificationStatus } from "@/types";
import {
  canCommentOnDocuments,
  canDeleteComment,
  canDeleteDocument,
  canPurgeDocument,
  canRequestNewCopy,
  canUploadDocuments,
  checklistProgress,
  getChecklist,
  sanitizeFileName,
  validateDocumentFile,
  MAX_DOCUMENT_BYTES,
} from "@/lib/business/documents";

const user = (role: Role, id = `${role.toLowerCase()}-1`): UserProfile => ({
  id,
  name: role,
  email: `${id}@example.test`,
  username: null,
  role,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: null,
  personalizedPayoutRate: null,
});

const lead = (
  status: LeadStatus = "LEAD_SUBMITTED",
  verificationStatus: VerificationStatus = "YELLOW",
  createdBy = "dsa-1",
  assignedTo = "dsa-1"
) => ({ status, verificationStatus, createdBy, assignedTo });

const fileBy = (uploadedBy: string) => ({
  file: {
    name: "pan.pdf",
    contentType: "application/pdf" as const,
    size: 1000,
    uploadedBy,
    uploadedByName: "x",
    uploadedAt: "2026-01-01T00:00:00.000Z",
  },
});

describe("who can upload and comment", () => {
  it("lets the creator, the assignee and reviewers upload on open leads", () => {
    expect(canUploadDocuments(user("DSA", "dsa-1"), lead())).toBe(true);
    expect(canUploadDocuments(user("PARTNER", "p-9"), lead("CREDIT", "GREEN", "dsa-1", "p-9"))).toBe(true);
    expect(canUploadDocuments(user("OPERATIONS"), lead())).toBe(true);
    expect(canUploadDocuments(user("ADMIN"), lead())).toBe(true);
  });

  it("blocks DSAs who are neither creator nor assignee", () => {
    expect(canUploadDocuments(user("DSA", "dsa-2"), lead())).toBe(false);
    expect(canCommentOnDocuments(user("DSA", "dsa-2"), lead())).toBe(false);
  });

  it("makes disbursed and rejected leads read-only for everyone", () => {
    for (const status of ["DISBURSED", "REJECTED"] as LeadStatus[]) {
      expect(canUploadDocuments(user("ADMIN"), lead(status, "GREEN"))).toBe(false);
      expect(canCommentOnDocuments(user("OPERATIONS"), lead(status, "GREEN"))).toBe(false);
    }
  });
});

describe("who can delete a document", () => {
  it("lets a DSA delete their own upload until the lead is Green", () => {
    expect(canDeleteDocument(user("DSA", "dsa-1"), lead("LEAD_SUBMITTED", "YELLOW"), fileBy("dsa-1"))).toBe(true);
    expect(canDeleteDocument(user("DSA", "dsa-1"), lead("CREDIT", "GREEN"), fileBy("dsa-1"))).toBe(false);
  });

  it("doesn't let a DSA delete someone else's upload", () => {
    expect(canDeleteDocument(user("DSA", "dsa-1"), lead(), fileBy("ops-1"))).toBe(false);
  });

  it("never lets Operations delete, and lets Admins delete on open leads only", () => {
    expect(canDeleteDocument(user("OPERATIONS"), lead(), fileBy("operations-1"))).toBe(false);
    expect(canDeleteDocument(user("ADMIN"), lead("CREDIT", "GREEN"), fileBy("dsa-1"))).toBe(true);
    expect(canDeleteDocument(user("ADMIN"), lead("DISBURSED", "GREEN"), fileBy("dsa-1"))).toBe(false);
  });

  it("has nothing to delete before the first upload", () => {
    expect(canDeleteDocument(user("ADMIN"), lead(), { file: null })).toBe(false);
  });

  it("allows permanent deletion only for Admins", () => {
    expect(canPurgeDocument(user("ADMIN"))).toBe(true);
    for (const r of ["DSA", "PARTNER", "OPERATIONS"] as Role[]) expect(canPurgeDocument(user(r))).toBe(false);
  });
});

describe("new-copy requests and comments", () => {
  it("lets only reviewers ask for a new copy, on open leads", () => {
    expect(canRequestNewCopy(user("OPERATIONS"), lead())).toBe(true);
    expect(canRequestNewCopy(user("ADMIN"), lead())).toBe(true);
    expect(canRequestNewCopy(user("DSA", "dsa-1"), lead())).toBe(false);
    expect(canRequestNewCopy(user("OPERATIONS"), lead("REJECTED", "GREEN"))).toBe(false);
  });

  it("lets authors delete their own comments and Admins any, never system notes", () => {
    const own = { authorId: "dsa-1", system: false };
    expect(canDeleteComment(user("DSA", "dsa-1"), own)).toBe(true);
    expect(canDeleteComment(user("OPERATIONS"), own)).toBe(false);
    expect(canDeleteComment(user("ADMIN"), own)).toBe(true);
    expect(canDeleteComment(user("ADMIN"), { authorId: "system", system: true })).toBe(false);
  });
});

describe("file checks", () => {
  it("accepts PDF, JPG and PNG up to 10 MB", () => {
    expect(validateDocumentFile("application/pdf", 1)).toBeNull();
    expect(validateDocumentFile("image/png", MAX_DOCUMENT_BYTES)).toBeNull();
  });

  it("rejects other types, empty files and files over 10 MB with a reason", () => {
    expect(validateDocumentFile("application/msword", 1000)).toMatch(/PDF, JPG and PNG/);
    expect(validateDocumentFile("image/jpeg", 0)).toMatch(/empty/);
    expect(validateDocumentFile("image/jpeg", MAX_DOCUMENT_BYTES + 1)).toMatch(/limit is 10 MB/);
  });

  it("makes safe storage names", () => {
    expect(sanitizeFileName("Bank Statement (Mar-Aug).pdf")).toBe("Bank_Statement_Mar-Aug_.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\PAN card.pdf")).toBe("PAN_card.pdf");
    expect(sanitizeFileName("...")).toBe("file");
    const long = sanitizeFileName("a".repeat(300) + ".pdf");
    expect(long.length).toBe(100);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("checklist progress", () => {
  const up = (category: string, request = false) => ({
    category: category as never,
    file: fileBy("dsa-1").file,
    newCopyRequest: request ? { by: "ops-1", byName: "Ops", at: "x" } : null,
  });

  it("requires property papers only for secured loans", () => {
    expect(getChecklist("SECURED")).toContain("PROPERTY_PAPERS");
    expect(getChecklist("UNSECURED")).not.toContain("PROPERTY_PAPERS");
  });

  it("counts a document with an open new-copy request as not done", () => {
    const p = checklistProgress("UNSECURED", [up("PAN"), up("ADDRESS_PROOF", true), up("OTHER")]);
    expect(p).toEqual({ required: 4, done: 1, missing: ["BANK_STATEMENT", "INCOME_PROOF"], needsNewCopy: 1 });
  });

  it("ignores slots with no file yet", () => {
    const p = checklistProgress("SECURED", [{ category: "PAN", file: null, newCopyRequest: null }]);
    expect(p.done).toBe(0);
    expect(p.missing).toContain("PAN");
  });
});
