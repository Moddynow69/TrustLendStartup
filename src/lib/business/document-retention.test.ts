import { describe, expect, it } from "vitest";
import { isAbandonedUpload, splitExpiredVersions } from "@/lib/business/document-retention";

const now = new Date("2026-10-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

describe("abandoned uploads", () => {
  it("treats uploads pending for more than a day as abandoned", () => {
    expect(isAbandonedUpload(hoursAgo(25), now)).toBe(true);
    expect(isAbandonedUpload(hoursAgo(23), now)).toBe(false);
  });

  it("leaves uploads started within the last day alone, including in-progress ones", () => {
    expect(isAbandonedUpload(hoursAgo(0.1), now)).toBe(false);
    expect(isAbandonedUpload(null, now)).toBe(false);
  });
});

describe("old versions", () => {
  it("removes versions retired more than 30 days ago and keeps newer ones", () => {
    const versions = [
      { id: "a", replacedAt: daysAgo(45) },
      { id: "b", deletedAt: daysAgo(31) },
      { id: "c", replacedAt: daysAgo(29) },
      { id: "d", deletedAt: daysAgo(1) },
    ];
    const { keep, expired } = splitExpiredVersions(versions, now);
    expect(expired.map((v) => v.id)).toEqual(["a", "b"]);
    expect(keep.map((v) => v.id)).toEqual(["c", "d"]);
  });

  it("keeps versions with no retirement date rather than guessing", () => {
    const undated: { id: string; replacedAt?: Date }[] = [{ id: "x" }];
    const { keep, expired } = splitExpiredVersions(undated, now);
    expect(expired).toEqual([]);
    expect(keep).toHaveLength(1);
  });

  it("respects a custom retention period", () => {
    const { expired } = splitExpiredVersions([{ replacedAt: daysAgo(8) }], now, 7);
    expect(expired).toHaveLength(1);
  });
});
