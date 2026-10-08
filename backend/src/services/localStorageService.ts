import fs from "fs";
import path from "path";
import { UploadOptions, UploadResult } from "./cloudinaryService";

const UPLOADS_BASE_DIR = path.join(process.cwd(), "uploads");

/**
 * Ensure destination directory exists on disk
 */
function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export interface LocalUploadOptions extends UploadOptions {
  baseUrl?: string;
  originalname?: string;
}

export function getFullUrl(relativePath: string, baseUrl?: string): string {
  const cleanPath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  if (baseUrl && baseUrl.trim() !== "") {
    return `${baseUrl.trim().replace(/\/$/, "")}${cleanPath}`;
  }
  const defaultServerUrl = "https://api.dhakadsnazzy.com";
  const serverUrl =
    process.env.SERVER_URL && process.env.SERVER_URL.trim() !== ""
      ? process.env.SERVER_URL.trim().replace(/\/$/, "")
      : defaultServerUrl;
  return `${serverUrl}${cleanPath}`;
}

/**
 * Ensures relative upload paths starting with /uploads/ are converted to full absolute URLs
 */
export function ensureAbsoluteImageUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return url || "";
  const trimmed = url.trim();
  if (trimmed.startsWith("/uploads/")) {
    return getFullUrl(trimmed);
  }
  return trimmed;
}

/**
 * Save image buffer to local uploads directory
 */
export async function uploadImageFromBuffer(
  buffer: Buffer,
  options: LocalUploadOptions = {}
): Promise<UploadResult> {
  const folder = options.folder || "dhakadsnazzy/products";
  const normalizedFolder = folder.replace(/^\/+/, "");
  const targetDir = path.join(UPLOADS_BASE_DIR, normalizedFolder);
  ensureDirExists(targetDir);

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);
  const extFromName = options.originalname
    ? path.extname(options.originalname).replace(".", "").toLowerCase()
    : "";
  const ext =
    extFromName && ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extFromName)
      ? extFromName
      : "png";
  const filename = `${timestamp}_${randomSuffix}.${ext}`;
  const filePath = path.join(targetDir, filename);

  await fs.promises.writeFile(filePath, buffer);

  const relativeUrl = `/uploads/${normalizedFolder}/${filename}`;
  const fullUrl = getFullUrl(relativeUrl, options.baseUrl);

  return {
    url: fullUrl,
    secureUrl: fullUrl,
    publicId: `${normalizedFolder}/${filename}`,
    bytes: buffer.length,
    format: ext,
  };
}

const VIDEO_EXTENSIONS_BY_MIMETYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "video/m4v": "m4v",
  "video/x-matroska": "mkv",
  "video/mkv": "mkv",
  "video/avi": "avi",
  "video/x-msvideo": "avi",
  "video/ogg": "ogv",
  "video/3gpp": "3gp",
};

/**
 * Save video buffer to local uploads directory.
 * Unlike uploadImageFromBuffer, the extension is derived from the real mimetype
 * rather than hardcoded, since express.static (and browsers) rely on the file
 * extension to pick the Content-Type — a video saved as ".png" won't play.
 */
export async function uploadVideoFromBuffer(
  buffer: Buffer,
  mimetype: string,
  options: LocalUploadOptions = {}
): Promise<UploadResult> {
  const folder = options.folder || "dhakadsnazzy/products/videos";
  const normalizedFolder = folder.replace(/^\/+/, "");
  const targetDir = path.join(UPLOADS_BASE_DIR, normalizedFolder);
  ensureDirExists(targetDir);

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);
  const extFromName = options.originalname
    ? path.extname(options.originalname).replace(".", "").toLowerCase()
    : "";
  const ext = VIDEO_EXTENSIONS_BY_MIMETYPE[mimetype] || extFromName || "mp4";
  const filename = `${timestamp}_${randomSuffix}.${ext}`;
  const filePath = path.join(targetDir, filename);

  await fs.promises.writeFile(filePath, buffer);

  const relativeUrl = `/uploads/${normalizedFolder}/${filename}`;
  const fullUrl = getFullUrl(relativeUrl, options.baseUrl);

  return {
    url: fullUrl,
    secureUrl: fullUrl,
    publicId: `${normalizedFolder}/${filename}`,
    bytes: buffer.length,
    format: ext,
  };
}

/**
 * Save document buffer (image / pdf) to local uploads directory
 */
export async function uploadDocumentFromBuffer(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const folder = options.folder || "dhakadsnazzy/documents";
  const normalizedFolder = folder.replace(/^\/+/, "");
  const targetDir = path.join(UPLOADS_BASE_DIR, normalizedFolder);
  ensureDirExists(targetDir);

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);
  const ext = options.resourceType === "raw" ? "pdf" : "png";
  const filename = `${timestamp}_${randomSuffix}.${ext}`;
  const filePath = path.join(targetDir, filename);

  await fs.promises.writeFile(filePath, buffer);

  const relativeUrl = `/uploads/${normalizedFolder}/${filename}`;
  const fullUrl = getFullUrl(relativeUrl);

  return {
    url: fullUrl,
    secureUrl: fullUrl,
    publicId: `${normalizedFolder}/${filename}`,
    bytes: buffer.length,
    format: ext,
  };
}

/**
 * Delete file from local disk by publicId or URL
 */
export async function deleteImage(publicIdOrUrl: string): Promise<void> {
  try {
    let relativePath = publicIdOrUrl;
    if (relativePath.includes("/uploads/")) {
      const idx = relativePath.indexOf("/uploads/");
      relativePath = relativePath.substring(idx + "/uploads/".length);
    }
    const fullPath = path.join(UPLOADS_BASE_DIR, relativePath);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  } catch (error) {
    console.error(`Failed to delete local file ${publicIdOrUrl}:`, error);
  }
}
