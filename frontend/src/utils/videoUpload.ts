/**
 * Video upload utility functions
 */

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/**
 * Validate video file
 */
export function validateVideoFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_VIDEO_TYPES.join(", ")}`,
    };
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: `File size exceeds 50MB limit. Current size: ${(
        file.size /
        1024 /
        1024
      ).toFixed(2)}MB`,
    };
  }

  return { valid: true };
}

/**
 * Create a preview URL for a video file (object URL, not a data URL —
 * videos are far too large to base64-encode into memory/state).
 */
export function createVideoPreview(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Release a preview URL created by createVideoPreview once it's no longer shown,
 * to avoid leaking memory for large video blobs.
 */
export function revokeVideoPreview(previewUrl: string): void {
  if (previewUrl && previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
}
