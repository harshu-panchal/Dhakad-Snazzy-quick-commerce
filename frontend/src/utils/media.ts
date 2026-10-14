/**
 * Distinguishes a video URL from an image URL. Used because product "main image"
 * fields can now hold either — the same field, just a different file type.
 */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp)(\?.*)?$/i.test(url);
}

/**
 * Resolves media URLs (images, videos) for local development and production.
 * If backend returned an absolute URL with api.dhakadsnazzy.com or a relative /uploads path,
 * but the client is running on localhost/127.0.0.1, it routes to the local backend (localhost:5000).
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();

  // If it's a blob: or data: URL, return as-is
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  const isLocalClient =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  if (isLocalClient) {
    if (trimmed.includes("api.dhakadsnazzy.com/uploads/")) {
      return trimmed.replace(
        "https://api.dhakadsnazzy.com",
        "http://localhost:5000"
      );
    }
    if (trimmed.startsWith("/uploads/")) {
      return `http://localhost:5000${trimmed}`;
    }
  }

  // If it's a relative /uploads/ path in production
  if (trimmed.startsWith("/uploads/")) {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://api.dhakadsnazzy.com";
    return `${origin}${trimmed}`;
  }

  return trimmed;
}
