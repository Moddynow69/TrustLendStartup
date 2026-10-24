import "server-only";
import { adminDb, COLLECTIONS, FieldValue, Timestamp, documentsBucket } from "@/lib/firebase/admin";
import { AuthError } from "@/lib/auth/session";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api-response";
import { canViewLead } from "@/lib/business/permissions";
import {
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_LEAD,
  canCommentOnDocuments,
  canDeleteComment,
  canDeleteDocument,
  canPurgeDocument,
  canRequestNewCopy,
  canUploadDocuments,
  isSingleSlotCategory,
  sanitizeFileName,
  validateDocumentFile,
} from "@/lib/business/documents";
import { getLeadById } from "@/lib/db/leads";
import type {
  DocumentActivity,
  DocumentActivityAction,
  DocumentCategory,
  DocumentComment,
  DocumentContentType,
  Lead,
  LeadDocument,
  UserProfile,
} from "@/types";

/*
 * Firestore layout (all server-side; firestore.rules deny direct access):
 *   leads/{leadId}
 *     openDocumentRequests: number          open "new copy" requests, for the dashboard
 *     documents/{docId}                     docId = category for checklist slots, random for OTHER
 *       status: PENDING | UPLOADED | EMPTY | DELETED | PURGED
 *       file, versions[], pendingUpload, version, newCopyRequest, commentCount
 *       comments/{commentId}
 *     documentActivity/{id}                 uploads, views, deletions, requests
 * Storage: leads/{leadId}/{docId}/{timestamp}-{safe file name}, one object per version.
 */

const UPLOAD_LINK_MINUTES = 10;
const VIEW_LINK_MINUTES = 5;

type Status = "PENDING" | "UPLOADED" | "EMPTY" | "DELETED" | "PURGED";

interface StoredFile {
  name: string;
  contentType: DocumentContentType;
  size: number;
  storagePath: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: FirebaseFirestore.Timestamp;
}

const leadRef = (leadId: string) => adminDb.collection(COLLECTIONS.leads).doc(leadId);
const docsCol = (leadId: string) => leadRef(leadId).collection("documents");
const activityCol = (leadId: string) => leadRef(leadId).collection("documentActivity");

const iso = (v: unknown): string =>
  (v as FirebaseFirestore.Timestamp)?.toDate?.().toISOString?.() ?? (v as string);

function serializeDocument(id: string, leadId: string, d: FirebaseFirestore.DocumentData): LeadDocument {
  const f = d.file as StoredFile | null;
  return {
    id,
    leadId,
    category: d.category,
    file: f
      ? {
          name: f.name,
          contentType: f.contentType,
          size: f.size,
          uploadedBy: f.uploadedBy,
          uploadedByName: f.uploadedByName,
          uploadedAt: iso(f.uploadedAt),
        }
      : null,
    version: d.version ?? 0,
    newCopyRequest: d.newCopyRequest
      ? { by: d.newCopyRequest.by, byName: d.newCopyRequest.byName, at: iso(d.newCopyRequest.at) }
      : null,
    commentCount: d.commentCount ?? 0,
    createdAt: iso(d.createdAt),
  };
}

function serializeComment(id: string, c: FirebaseFirestore.DocumentData): DocumentComment {
  return {
    id,
    body: c.deletedAt ? null : c.body,
    authorId: c.authorId,
    authorName: c.authorName,
    authorRole: c.authorRole ?? null,
    requestsNewCopy: !!c.requestsNewCopy,
    system: !!c.system,
    deletedByName: c.deletedByName ?? null,
    createdAt: iso(c.createdAt),
  };
}

function activityEntry(
  action: DocumentActivityAction,
  docId: string,
  category: DocumentCategory,
  user: UserProfile
) {
  return { action, documentId: docId, category, userId: user.id, userName: user.name, at: Timestamp.now() };
}

function systemComment(text: string) {
  return {
    body: text,
    authorId: "system",
    authorName: "Loan Bandhu",
    authorRole: null,
    requestsNewCopy: false,
    system: true,
    createdAt: Timestamp.now(),
  };
}

/** Loads a lead and checks the user may see it (the same rule as the lead page). */
export async function requireLeadAccess(user: UserProfile, leadId: string): Promise<Lead> {
  const lead = await getLeadById(leadId);
  if (!canViewLead(user, lead)) {
    throw new AuthError("You do not have access to this lead", 403);
  }
  return lead;
}

async function getDocSnap(
  tx: FirebaseFirestore.Transaction,
  leadId: string,
  documentId: string
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const snap = await tx.get(docsCol(leadId).doc(documentId));
  const status = snap.data()?.status as Status | undefined;
  if (!snap.exists || status === "DELETED" || status === "PURGED") {
    throw new NotFoundError("Document not found");
  }
  return snap;
}

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

export async function listDocuments(leadId: string) {
  const [docsSnap, activitySnap] = await Promise.all([
    docsCol(leadId).where("status", "in", ["UPLOADED", "EMPTY"]).get(),
    activityCol(leadId).orderBy("at", "desc").limit(20).get(),
  ]);
  const documents = docsSnap.docs.map((d) => serializeDocument(d.id, leadId, d.data()));
  const activity: DocumentActivity[] = activitySnap.docs.map((a) => {
    const x = a.data();
    return {
      id: a.id,
      action: x.action,
      documentId: x.documentId,
      category: x.category,
      userId: x.userId,
      userName: x.userName,
      at: iso(x.at),
    };
  });
  return { documents, activity };
}

/* ------------------------------------------------------------------ */
/* Uploading: start (signed link) -> browser PUT -> complete (verify)  */
/* ------------------------------------------------------------------ */

export async function startUpload(
  lead: Lead,
  user: UserProfile,
  input: {
    category: DocumentCategory;
    fileName: string;
    contentType: DocumentContentType;
    size: number;
    /** Set to replace the file of an existing document. */
    documentId?: string;
  }
) {
  if (!canUploadDocuments(user, lead)) {
    throw new AuthError("Documents can't be added to this lead", 403);
  }
  const problem = validateDocumentFile(input.contentType, input.size);
  if (problem) throw new BadRequestError(problem);

  const active = await docsCol(lead.id).where("status", "in", ["UPLOADED", "PENDING"]).count().get();
  if (!input.documentId && active.data().count >= MAX_DOCUMENTS_PER_LEAD) {
    throw new BadRequestError(`A lead can hold at most ${MAX_DOCUMENTS_PER_LEAD} documents.`);
  }

  // Checklist categories have one fixed slot per lead, so concurrent
  // uploads of the same category land on the same document.
  const ref = input.documentId
    ? docsCol(lead.id).doc(input.documentId)
    : isSingleSlotCategory(input.category)
      ? docsCol(lead.id).doc(input.category)
      : docsCol(lead.id).doc();

  const storagePath = `leads/${lead.id}/${ref.id}/${Date.now()}-${sanitizeFileName(input.fileName)}`;
  const pendingUpload = {
    storagePath,
    name: input.fileName.trim().slice(0, 200) || "document",
    contentType: input.contentType,
    size: input.size,
    by: user.id,
    byName: user.name,
    startedAt: Timestamp.now(),
  };

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    const status = d?.status as Status | undefined;

    if (input.documentId) {
      if (!snap.exists || status !== "UPLOADED") throw new NotFoundError("Document not found");
      tx.update(ref, { pendingUpload });
      return;
    }
    if (status === "UPLOADED") {
      throw new ConflictError(
        `${DOCUMENT_CATEGORIES[input.category].label} is already uploaded. Use Replace to upload a new copy.`
      );
    }
    if (snap.exists && (status === "EMPTY" || status === "PENDING")) {
      tx.update(ref, { pendingUpload, status: status === "EMPTY" ? "EMPTY" : "PENDING" });
    } else {
      tx.set(ref, {
        category: input.category,
        status: "PENDING",
        file: null,
        versions: [],
        pendingUpload,
        version: 0,
        newCopyRequest: null,
        commentCount: 0,
        createdAt: Timestamp.now(),
      });
    }
  });

  const lengthRange = `0,${MAX_DOCUMENT_BYTES}`;
  const [uploadUrl] = await documentsBucket()
    .file(storagePath)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + UPLOAD_LINK_MINUTES * 60 * 1000,
      contentType: input.contentType,
      // Storage itself rejects anything over the limit.
      extensionHeaders: { "x-goog-content-length-range": lengthRange },
    });

  return {
    documentId: ref.id,
    uploadUrl,
    uploadHeaders: { "Content-Type": input.contentType, "x-goog-content-length-range": lengthRange },
  };
}

/** True if the first bytes are really a PDF, JPEG or PNG of the declared type. */
function matchesSignature(contentType: DocumentContentType, head: Buffer): boolean {
  if (contentType === "application/pdf") return head.subarray(0, 5).toString("latin1") === "%PDF-";
  if (contentType === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

export async function completeUpload(lead: Lead, user: UserProfile, documentId: string): Promise<LeadDocument> {
  const ref = docsCol(lead.id).doc(documentId);
  const before = await ref.get();
  const pending = before.data()?.pendingUpload;
  if (!before.exists || !pending) throw new NotFoundError("No upload is waiting to be confirmed for this document.");
  if (pending.by !== user.id) throw new AuthError("Only the person who started this upload can finish it.", 403);

  const object = documentsBucket().file(pending.storagePath);
  let reason: string | null = null;
  try {
    const [meta] = await object.getMetadata();
    const size = Number(meta.size);
    if (size !== pending.size || size > MAX_DOCUMENT_BYTES) reason = "The uploaded file's size doesn't match. Try again.";
    else if (meta.contentType !== pending.contentType) reason = "The uploaded file's type doesn't match. Try again.";
    else {
      const [head] = await object.download({ start: 0, end: 7 });
      if (!matchesSignature(pending.contentType, head)) {
        reason = `This file isn't a real ${pending.contentType === "application/pdf" ? "PDF" : "image"}. Upload the original document.`;
      }
    }
  } catch (err) {
    if ((err as { code?: number }).code === 404) {
      throw new BadRequestError("The file didn't reach storage. Try uploading again.");
    }
    throw err;
  }

  if (reason) {
    await object.delete({ ignoreNotFound: true });
    await ref.update({ pendingUpload: null });
    throw new BadRequestError(reason);
  }

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data()!;
    if (d.pendingUpload?.storagePath !== pending.storagePath) {
      throw new ConflictError("A newer upload replaced this one. Refresh and check the document.");
    }
    const replacing = !!d.file;
    const openRequest = !!d.newCopyRequest;
    const file: StoredFile = {
      name: pending.name,
      contentType: pending.contentType,
      size: pending.size,
      storagePath: pending.storagePath,
      uploadedBy: user.id,
      uploadedByName: user.name,
      uploadedAt: Timestamp.now(),
    };

    tx.update(ref, {
      status: "UPLOADED",
      file,
      pendingUpload: null,
      version: (d.version ?? 0) + 1,
      newCopyRequest: null,
      // Earlier files stay in Storage for the audit trail until purged.
      ...(replacing ? { versions: FieldValue.arrayUnion({ ...d.file, replacedAt: Timestamp.now() }) } : {}),
    });
    if (openRequest) tx.update(leadRef(lead.id), { openDocumentRequests: FieldValue.increment(-1) });
    if (replacing || openRequest) {
      tx.set(
        ref.collection("comments").doc(),
        systemComment(
          `${user.name} uploaded a new copy${openRequest ? ". The request for a new copy is resolved." : "."}`
        )
      );
    }
    tx.set(activityCol(lead.id).doc(), activityEntry(replacing ? "REPLACED" : "UPLOADED", ref.id, d.category, user));
  });

  const after = await ref.get();
  return serializeDocument(after.id, lead.id, after.data()!);
}

/* ------------------------------------------------------------------ */
/* Viewing                                                             */
/* ------------------------------------------------------------------ */

export async function getViewUrl(lead: Lead, user: UserProfile, documentId: string) {
  const snap = await docsCol(lead.id).doc(documentId).get();
  const d = snap.data();
  if (!snap.exists || d?.status !== "UPLOADED" || !d.file) throw new NotFoundError("Document not found");
  const f = d.file as StoredFile;

  const [url] = await documentsBucket()
    .file(f.storagePath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + VIEW_LINK_MINUTES * 60 * 1000,
      responseType: f.contentType,
      responseDisposition: `inline; filename="${sanitizeFileName(f.name)}"`,
    });

  await activityCol(lead.id).add(activityEntry("VIEWED", snap.id, d.category, user));
  return { url, expiresInSeconds: VIEW_LINK_MINUTES * 60, contentType: f.contentType, name: f.name };
}

/* ------------------------------------------------------------------ */
/* Deleting                                                            */
/* ------------------------------------------------------------------ */

/** Soft delete: the file leaves the lead but stays in Storage until purged. */
export async function deleteDocument(lead: Lead, user: UserProfile, documentId: string) {
  await adminDb.runTransaction(async (tx) => {
    const snap = await getDocSnap(tx, lead.id, documentId);
    const d = snap.data()!;
    const doc = serializeDocument(snap.id, lead.id, d);
    if (!canDeleteDocument(user, lead, doc)) {
      throw new AuthError("You can't delete this document", 403);
    }
    // A checklist slot stays (empty, with its comments); an OTHER document goes.
    tx.update(snap.ref, {
      status: isSingleSlotCategory(d.category) ? "EMPTY" : "DELETED",
      file: null,
      newCopyRequest: null,
      versions: FieldValue.arrayUnion({ ...d.file, deletedAt: Timestamp.now(), deletedBy: user.id }),
    });
    if (d.newCopyRequest) tx.update(leadRef(lead.id), { openDocumentRequests: FieldValue.increment(-1) });
    tx.set(snap.ref.collection("comments").doc(), systemComment(`${user.name} deleted ${d.file.name}.`));
    tx.set(activityCol(lead.id).doc(), activityEntry("DELETED", snap.id, d.category, user));
  });
}

/**
 * Permanent removal for erasure requests (Admin only, any lead): deletes
 * every stored version and removes comment text. The record and a history
 * entry remain so the audit trail shows that something was erased.
 */
export async function purgeDocument(lead: Lead, user: UserProfile, documentId: string) {
  if (!canPurgeDocument(user)) throw new AuthError("Only Admins can delete documents permanently", 403);
  const ref = docsCol(lead.id).doc(documentId);
  const snap = await ref.get();
  const d = snap.data();
  if (!snap.exists || d?.status === "PURGED") throw new NotFoundError("Document not found");

  const paths = new Set<string>();
  if (d!.file?.storagePath) paths.add(d!.file.storagePath);
  if (d!.pendingUpload?.storagePath) paths.add(d!.pendingUpload.storagePath);
  for (const v of d!.versions ?? []) if (v?.storagePath) paths.add(v.storagePath);
  const bucket = documentsBucket();
  await Promise.all([...paths].map((p) => bucket.file(p).delete({ ignoreNotFound: true })));

  const comments = await ref.collection("comments").get();
  const batch = adminDb.batch();
  batch.update(ref, {
    status: "PURGED",
    file: null,
    versions: [],
    pendingUpload: null,
    newCopyRequest: null,
    commentCount: 0,
    purgedAt: Timestamp.now(),
    purgedBy: user.id,
  });
  if (d!.newCopyRequest) batch.update(leadRef(lead.id), { openDocumentRequests: FieldValue.increment(-1) });
  for (const c of comments.docs) {
    batch.update(c.ref, { body: null, deletedAt: Timestamp.now(), deletedByName: `${user.name} (permanent deletion)` });
  }
  batch.set(activityCol(lead.id).doc(), activityEntry("PURGED", ref.id, d!.category, user));
  await batch.commit();
}

/* ------------------------------------------------------------------ */
/* Comments and new-copy requests                                      */
/* ------------------------------------------------------------------ */

export async function listComments(leadId: string, documentId: string): Promise<DocumentComment[]> {
  const snap = await docsCol(leadId).doc(documentId).collection("comments").orderBy("createdAt", "asc").get();
  return snap.docs.map((c) => serializeComment(c.id, c.data()));
}

export async function addComment(
  lead: Lead,
  user: UserProfile,
  documentId: string,
  input: { body: string; requestNewCopy?: boolean }
): Promise<DocumentComment> {
  if (!canCommentOnDocuments(user, lead)) {
    throw new AuthError("Comments can't be added to this lead", 403);
  }
  const body = input.body.trim();
  const commentRef = docsCol(lead.id).doc(documentId).collection("comments").doc();

  await adminDb.runTransaction(async (tx) => {
    const snap = await getDocSnap(tx, lead.id, documentId);
    const d = snap.data()!;
    const request = !!input.requestNewCopy;
    if (request) {
      if (!canRequestNewCopy(user, lead)) throw new AuthError("Only Operations and Admins can ask for a new copy", 403);
      if (!d.file) throw new BadRequestError("There's no file yet to ask a new copy of.");
      if (d.newCopyRequest) throw new BadRequestError("A new copy has already been requested for this document.");
    }
    tx.set(commentRef, {
      body,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      requestsNewCopy: request,
      system: false,
      createdAt: Timestamp.now(),
    });
    tx.update(snap.ref, {
      commentCount: FieldValue.increment(1),
      ...(request ? { newCopyRequest: { by: user.id, byName: user.name, at: Timestamp.now() } } : {}),
    });
    if (request) {
      tx.update(leadRef(lead.id), { openDocumentRequests: FieldValue.increment(1) });
      tx.set(activityCol(lead.id).doc(), activityEntry("COPY_REQUESTED", snap.id, d.category, user));
    }
  });

  const created = await commentRef.get();
  return serializeComment(created.id, created.data()!);
}

/** Removes the comment's text; the entry stays as "Comment deleted by …". */
export async function deleteComment(lead: Lead, user: UserProfile, documentId: string, commentId: string) {
  await adminDb.runTransaction(async (tx) => {
    const docSnap = await getDocSnap(tx, lead.id, documentId);
    const ref = docSnap.ref.collection("comments").doc(commentId);
    const c = await tx.get(ref);
    if (!c.exists || c.data()!.deletedAt) throw new NotFoundError("Comment not found");
    if (!canDeleteComment(user, { authorId: c.data()!.authorId, system: !!c.data()!.system })) {
      throw new AuthError("You can only delete your own comments", 403);
    }
    tx.update(ref, { body: null, deletedAt: Timestamp.now(), deletedBy: user.id, deletedByName: user.name });
    tx.update(docSnap.ref, { commentCount: FieldValue.increment(-1) });
    tx.set(activityCol(lead.id).doc(), activityEntry("COMMENT_DELETED", docSnap.id, docSnap.data()!.category, user));
  });
}

/** Clears an open new-copy request without a new file (Operations/Admin). */
export async function resolveNewCopyRequest(lead: Lead, user: UserProfile, documentId: string) {
  if (!canRequestNewCopy(user, lead)) {
    throw new AuthError("Only Operations and Admins can resolve a request", 403);
  }
  await adminDb.runTransaction(async (tx) => {
    const snap = await getDocSnap(tx, lead.id, documentId);
    const d = snap.data()!;
    if (!d.newCopyRequest) throw new BadRequestError("There's no open request on this document.");
    tx.update(snap.ref, { newCopyRequest: null });
    tx.update(leadRef(lead.id), { openDocumentRequests: FieldValue.increment(-1) });
    tx.set(snap.ref.collection("comments").doc(), systemComment(`${user.name} marked the request for a new copy as resolved.`));
    tx.set(activityCol(lead.id).doc(), activityEntry("REQUEST_RESOLVED", snap.id, d.category, user));
  });
}
