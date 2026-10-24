import multer from "multer";
import { Request } from "express";

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_REEL_SIZE = 400 * 1024 * 1024; // 400MB (customer affiliation reels)

// Allowed file types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/m4v",
  "video/x-matroska",
  "video/mkv",
  "video/avi",
  "video/x-msvideo",
  "video/ogg",
  "video/3gpp",
];

// Memory storage for multer (files will be stored in memory as buffers)
const storage = multer.memoryStorage();

// File filter for images
const imageFileFilter = (
  _req: Request,
  file: any,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`
      )
    );
  }
};

// File filter for videos
const videoFileFilter = (
  _req: Request,
  file: any,
  cb: multer.FileFilterCallback
) => {
  const isVideoExt = /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp)$/i.test(
    file.originalname || ""
  );
  if (
    ALLOWED_VIDEO_TYPES.includes(file.mimetype) ||
    file.mimetype?.startsWith("video/") ||
    isVideoExt
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid video file type (${file.mimetype || "unknown"}). Allowed formats: MP4, WebM, MOV, MKV, AVI.`
      )
    );
  }
};

// File filter for documents (images + PDF)
const documentFileFilter = (
  _req: Request,
  file: any,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${ALLOWED_DOCUMENT_TYPES.join(", ")}`
      )
    );
  }
};

// Multer instance for single image upload
export const uploadSingleImage = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },
  fileFilter: imageFileFilter,
});

// Multer instance for multiple image uploads
export const uploadMultipleImages = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },
  fileFilter: imageFileFilter,
});

// Multer instance for single video upload
export const uploadSingleVideo = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE,
  },
  fileFilter: videoFileFilter,
});

// Multer instance for reel video upload (customers, up to 400MB)
export const uploadReelVideo = multer({
  storage,
  limits: {
    fileSize: MAX_REEL_SIZE,
  },
  fileFilter: videoFileFilter,
});

// Multer instance for document upload (image or PDF)
export const uploadDocument = multer({
  storage,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
  },
  fileFilter: documentFileFilter,
});

// Multer instance for multiple documents
export const uploadMultipleDocuments = multer({
  storage,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
  },
  fileFilter: documentFileFilter,
});

// Error handler middleware for multer errors
export const handleUploadError = (
  err: any,
  _req: Request,
  res: any,
  _next: any
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size exceeds the maximum allowed limit (Images: 50MB, Videos: 200MB, Reels: 400MB)",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files uploaded",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field",
      });
    }
  }

  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  _next(err);
};
