import "server-only";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { deleteStoredFiles } from "@/lib/storage/documents-storage";
import { abandonedUploadCutoff, splitExpiredVersions } from "@/lib/business/document-retention";

/*
 * Daily document clean-up (run by GET /api/cron/document-cleanup):
 *  1. Abandoned uploads: started more than a day ago and never confirmed.
 *     The stray file (if any) is deleted and the pending upload cleared; a
 *     document slot that never got a file and has no comments is removed.
 *  2. Old versions: replaced or deleted files older than 30 days are
 *     deleted from storage. A history entry records the clean-up.
 * Documents on closed leads are left alone (no retention period chosen).
 *
 * Each document is handled on its own, so one failure doesn't stop the run,
 * and every change re-checks the record inside a transaction in case a user
 * changed it meanwhile.
 */

const BATCH_LIMIT = 200; // documents per part per run; the next run picks up the rest

export interface CleanupReport {
  dryRun: boolean;
  abandonedUploads: { found: number; cleared: number; recordsRemoved: number };
  oldVersions: { documents: number; filesRemoved: number };
  errors: string[];
}

type Ts = FirebaseFirestore.Timestamp;
const toDate = (t: unknown) => ((t as Ts)?.toDate ? (t as Ts).toDate() : null);

function leadIdOf(ref: FirebaseFirestore.DocumentReference) {
  // leads/{leadId}/documents/{docId}
  return ref.parent.parent?.id ?? "unknown";
}

async function cleanAbandonedUploads(now: Date, dryRun: boolean, report: CleanupReport) {
  const cutoff = Timestamp.fromDate(abandonedUploadCutoff(now));
  const snap = await adminDb
    .collectionGroup("documents")
    .where("pendingUpload.startedAt", "<", cutoff)
    .limit(BATCH_LIMIT)
    .get();
  report.abandonedUploads.found = snap.size;
  if (dryRun) return;

  for (const doc of snap.docs) {
    const path = doc.data().pendingUpload?.storagePath as string | undefined;
    try {
      // The file may or may not have reached storage; deleting a missing one is harmless.
      if (path) await deleteStoredFiles([path]);
      const removed = await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const d = fresh.data();
        if (!fresh.exists || d?.pendingUpload?.storagePath !== path) return false; // a newer upload started
        if (d!.status === "PENDING" && !d!.file && !(d!.commentCount > 0)) {
          tx.delete(doc.ref);
          return true;
        }
        tx.update(doc.ref, {
          pendingUpload: null,
          ...(d!.status === "PENDING" ? { status: d!.file ? "UPLOADED" : "EMPTY" } : {}),
        });
        return false;
      });
      report.abandonedUploads.cleared += 1;
      if (removed) report.abandonedUploads.recordsRemoved += 1;
    } catch (err) {
      report.errors.push(`abandoned upload ${leadIdOf(doc.ref)}/${doc.id}: ${(err as Error).message}`);
    }
  }
}

async function cleanOldVersions(now: Date, dryRun: boolean, report: CleanupReport) {
  const snap = await adminDb
    .collectionGroup("documents")
    .where("oldVersionCount", ">", 0)
    .limit(BATCH_LIMIT)
    .get();

  for (const doc of snap.docs) {
    type Version = { storagePath?: string; replacedAt?: Ts; deletedAt?: Ts; [k: string]: unknown };
    const versions = (doc.data().versions ?? []) as Version[];
    const withDates = versions.map((v) => ({ v, replacedAt: toDate(v.replacedAt), deletedAt: toDate(v.deletedAt) }));
    const { expired } = splitExpiredVersions(withDates, now);
    if (expired.length === 0) continue;

    report.oldVersions.documents += 1;
    report.oldVersions.filesRemoved += expired.length;
    if (dryRun) continue;

    const expiredPaths = new Set(expired.map((e) => e.v.storagePath).filter((p): p is string => !!p));
    try {
      await deleteStoredFiles([...expiredPaths]);
      await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return;
        const d = fresh.data()!;
        const remaining = ((d.versions ?? []) as Version[]).filter(
          (v) => !(v.storagePath && expiredPaths.has(v.storagePath))
        );
        tx.update(doc.ref, { versions: remaining, oldVersionCount: remaining.length });
        tx.set(doc.ref.parent.parent!.collection("documentActivity").doc(), {
          action: "OLD_VERSIONS_REMOVED",
          documentId: doc.id,
          category: d.category,
          userId: "system",
          userName: "Automatic clean-up",
          at: Timestamp.now(),
        });
      });
    } catch (err) {
      report.oldVersions.filesRemoved -= expired.length;
      report.oldVersions.documents -= 1;
      report.errors.push(`old versions ${leadIdOf(doc.ref)}/${doc.id}: ${(err as Error).message}`);
    }
  }
}

export async function runDocumentCleanup({ dryRun = false, now = new Date() } = {}): Promise<CleanupReport> {
  const report: CleanupReport = {
    dryRun,
    abandonedUploads: { found: 0, cleared: 0, recordsRemoved: 0 },
    oldVersions: { documents: 0, filesRemoved: 0 },
    errors: [],
  };
  // Each part runs even if the other fails.
  for (const [name, part] of [
    ["abandoned uploads", cleanAbandonedUploads],
    ["old versions", cleanOldVersions],
  ] as const) {
    try {
      await part(now, dryRun, report);
    } catch (err) {
      report.errors.push(`${name}: ${(err as Error).message}`);
    }
  }
  return report;
}

