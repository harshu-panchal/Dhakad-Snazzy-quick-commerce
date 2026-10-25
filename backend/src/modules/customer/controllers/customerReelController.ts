import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { uploadVideoFromBuffer, uploadImageFromBuffer } from "../../../services/localStorageService";
import { CLOUDINARY_FOLDERS } from "../../../config/cloudinary";
import { verifyToken } from "../../../services/jwtService";
import {
  getReelFeed,
  getPublicReel,
  createReel,
  toggleLike,
  recordShare,
  recordView,
  getMyReels,
  deleteReel,
  getReelEarnings,
} from "../../../services/reelService";

const getCustomerId = (req: Request): string | undefined => req.user?.userId;

/**
 * GET /api/v1/reels/:id — PUBLIC (no auth required).
 * Backs shared reel links, which must open for logged-out viewers. If a valid
 * customer token is sent anyway, it's used only to report like/owner state; an
 * invalid or expired token is ignored rather than rejected.
 */
export const getPublicReelById = asyncHandler(async (req: Request, res: Response) => {
  let viewerId: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = verifyToken(authHeader.substring(7));
      if (decoded.userType === "Customer") viewerId = decoded.userId;
    } catch {
      // Anonymous view — a bad token must not block a public link.
    }
  }

  const reel = await getPublicReel(req.params.id, viewerId);
  if (!reel) {
    return res.status(404).json({ success: false, message: "Reel not found" });
  }
  return res.status(200).json({ success: true, data: reel });
});

/**
 * GET /api/v1/customer/reels/feed?lat=&lng=&page=&limit=
 * Location-aware reel feed — only reels whose product is deliverable to the
 * viewer's current coordinates.
 */
export const getFeed = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const latitude = parseFloat(req.query.lat as string);
  const longitude = parseFloat(req.query.lng as string);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({
      success: false,
      message: "Your location (lat, lng) is required to load reels",
    });
  }

  const data = await getReelFeed({
    customerId,
    latitude,
    longitude,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 5,
    feedSeed: typeof req.query.feedSeed === "string" ? req.query.feedSeed : undefined,
  });

  return res.status(200).json({ success: true, data });
});

/**
 * POST /api/v1/customer/reels
 * Multipart: field "video" (<=400MB), optional field "thumbnail" (a small
 * JPEG the client captures from the clip's first frame — see ReelUpload.tsx)
 * + productId, caption?, durationSec?, city?, state?
 *
 * The thumbnail gives the feed an instant poster image to show while the
 * (possibly large) video is still buffering, instead of a black screen —
 * this is the main lever against "large reels feel slow to load".
 */
export const uploadReel = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const files = (req as any).files as
    | { video?: any[]; thumbnail?: any[] }
    | undefined;
  const videoFile = files?.video?.[0];
  const thumbnailFile = files?.thumbnail?.[0];

  if (!videoFile) {
    return res.status(400).json({ success: false, message: "No video file provided" });
  }

  const { productId, caption, durationSec, city, state } = req.body;
  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "A product must be linked to the reel",
    });
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const uploadResult = await uploadVideoFromBuffer(videoFile.buffer, videoFile.mimetype, {
    folder: CLOUDINARY_FOLDERS.REELS,
    resourceType: "video",
    baseUrl,
    originalname: videoFile.originalname,
  });

  let thumbnailUrl: string | undefined;
  let thumbnailPublicId: string | undefined;
  if (thumbnailFile) {
    try {
      const thumbResult = await uploadImageFromBuffer(thumbnailFile.buffer, {
        folder: `${CLOUDINARY_FOLDERS.REELS}/thumbnails`,
        resourceType: "image",
        baseUrl,
        originalname: thumbnailFile.originalname,
      });
      thumbnailUrl = thumbResult.secureUrl || thumbResult.url;
      thumbnailPublicId = thumbResult.publicId;
    } catch (e) {
      // Non-fatal — the reel still works without a poster image.
      console.error("Failed to upload reel thumbnail:", e);
    }
  }

  try {
    const reel = await createReel({
      customerId,
      productId,
      videoUrl: uploadResult.secureUrl || uploadResult.url,
      videoPublicId: uploadResult.publicId,
      thumbnailUrl,
      thumbnailPublicId,
      caption,
      durationSec: durationSec ? Number(durationSec) : undefined,
      sizeBytes: uploadResult.bytes,
      uploaderCity: city,
      uploaderState: state,
    });

    return res.status(201).json({ success: true, data: reel });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create reel",
    });
  }
});

/** POST /api/v1/customer/reels/:id/like */
export const likeReel = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  try {
    const result = await toggleLike(req.params.id, customerId);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

/** POST /api/v1/customer/reels/:id/share */
export const shareReel = asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await recordShare(req.params.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

/** POST /api/v1/customer/reels/:id/view */
export const viewReel = asyncHandler(async (req: Request, res: Response) => {
  await recordView(req.params.id);
  return res.status(200).json({ success: true });
});

/** GET /api/v1/customer/reels/mine */
export const myReels = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const reels = await getMyReels(customerId);
  return res.status(200).json({ success: true, data: reels });
});

/** GET /api/v1/customer/reels/earnings */
export const earnings = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const data = await getReelEarnings(customerId);
  return res.status(200).json({ success: true, data });
});

/** DELETE /api/v1/customer/reels/:id */
export const removeReel = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  try {
    await deleteReel(req.params.id, customerId);
    return res.status(200).json({ success: true, message: "Reel deleted" });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});
