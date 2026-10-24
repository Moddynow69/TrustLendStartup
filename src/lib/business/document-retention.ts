/*
 * Rules for the daily document clean-up (see lib/db/document-cleanup.ts).
 *
 *  - Abandoned uploads: an upload that was started but never confirmed.
 *    Supabase upload links stop working after 2 hours, so anything still
 *    pending after a day will never complete.
 *  - Old versions: files that were replaced or deleted are kept for
 *    OLD_VERSION_RETENTION_DAYS so a mistake can be undone, then removed.
 *    The history entry about the replacement or deletion stays.
 *  - Documents on closed leads are NOT removed automatically: no
 *    retention period has been chosen yet.
 */

export const ABANDONED_UPLOAD_HOURS = 24;
export const OLD_VERSION_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function abandonedUploadCutoff(now: Date): Date {
  return new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
}

export function isAbandonedUpload(startedAt: Date | null | undefined, now: Date): boolean {
  return !!startedAt && startedAt.getTime() < abandonedUploadCutoff(now).getTime();
}

/** When a replaced or deleted version stopped being current, if known. */
export function versionRetiredAt(version: { replacedAt?: Date | null; deletedAt?: Date | null }): Date | null {
  return version.replacedAt ?? version.deletedAt ?? null;
}

/**
 * Splits a document's old versions into those to keep and those whose
 * retention has passed. Versions with no retirement date are kept.
 */
export function splitExpiredVersions<T extends { replacedAt?: Date | null; deletedAt?: Date | null }>(
  versions: T[],
  now: Date,
  retentionDays = OLD_VERSION_RETENTION_DAYS
): { keep: T[]; expired: T[] } {
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  const keep: T[] = [];
  const expired: T[] = [];
  for (const v of versions) {
    const retired = versionRetiredAt(v);
    (retired && retired.getTime() < cutoff ? expired : keep).push(v);
  }
  return { keep, expired };
}
