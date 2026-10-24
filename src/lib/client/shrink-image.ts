/*
 * Shrinks phone photos of documents before upload so the free storage
 * lasts longer. A 3–5 MB photo of a PAN card typically becomes a few
 * hundred KB at 2000 px and still reads clearly. PDFs are never touched.
 */

export const MAX_IMAGE_SIDE = 2000;
const JPEG_QUALITY = 0.82;
const SHRINK_ABOVE_BYTES = 400 * 1024;

/** Output size that keeps the aspect ratio with the longer side at most `maxSide`. */
export function fitWithin(width: number, height: number, maxSide = MAX_IMAGE_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Whether a file is a photo worth re-encoding. */
export function shouldShrink(file: { type: string; size: number }) {
  return (file.type === "image/jpeg" || file.type === "image/png") && file.size > SHRINK_ABOVE_BYTES;
}

/**
 * Returns a smaller JPEG copy of a large photo, or the original file if it
 * isn't a photo, is already small, or re-encoding wouldn't help.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!shouldShrink(file) || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    // Respects the photo's EXIF rotation so documents aren't saved sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency: put transparent PNG areas on white paper.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob || blob.size >= file.size) return file;

  const base = file.name.replace(/\.(png|jpe?g)$/i, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
