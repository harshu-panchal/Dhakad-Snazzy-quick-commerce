/**
 * Inserts a Cloudinary transformation (resize + auto quality/format) into a
 * Cloudinary delivery URL, so a grid thumbnail downloads a resized/compressed
 * image instead of the full-resolution original.
 *
 * Safe no-op for anything that isn't a recognizable Cloudinary `/image/upload/`
 * URL (e.g. locally-served /uploads/... paths, or a missing image) - those are
 * returned unchanged.
 */

const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

export interface CloudinaryTransformOptions {
  /** Target width in pixels. Height scales automatically to preserve aspect ratio. */
  width: number;
}

export function getOptimizedImageUrl(
  url: string | null | undefined,
  { width }: CloudinaryTransformOptions
): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes("res.cloudinary.com")) return url;

  const markerIndex = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (markerIndex === -1) return url;

  const insertAt = markerIndex + CLOUDINARY_UPLOAD_MARKER.length;
  const prefix = url.slice(0, insertAt);
  const rest = url.slice(insertAt);

  // Already has a transformation segment (e.g. starts with "w_" / "q_" / "f_")
  // right after /image/upload/ - don't stack a second one.
  const firstSegment = rest.split("/")[0] || "";
  if (/^[a-z]_/i.test(firstSegment)) {
    return url;
  }

  return `${prefix}w_${Math.round(width)},q_auto,f_auto/${rest}`;
}
