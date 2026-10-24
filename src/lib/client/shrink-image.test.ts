import { describe, expect, it } from "vitest";
import { fitWithin, shouldShrink, MAX_IMAGE_SIDE } from "@/lib/client/shrink-image";

describe("photo shrinking", () => {
  it("scales the longer side down to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_IMAGE_SIDE, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: MAX_IMAGE_SIDE });
  });

  it("never enlarges small images", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it("only re-encodes large JPG/PNG photos, never PDFs", () => {
    expect(shouldShrink({ type: "image/jpeg", size: 3_000_000 })).toBe(true);
    expect(shouldShrink({ type: "image/png", size: 2_000_000 })).toBe(true);
    expect(shouldShrink({ type: "image/jpeg", size: 200_000 })).toBe(false);
    expect(shouldShrink({ type: "application/pdf", size: 9_000_000 })).toBe(false);
  });
});
