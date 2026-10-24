import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { uploadVideoFromBuffer } from "../../../services/localStorageService";
import { CLOUDINARY_FOLDERS } from "../../../config/cloudinary";
import {
  getReelFeed,
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
 * Multipart: field "video" (<=400MB) + productId, caption?, durationSec?,
 * city?, state?
 */
export const uploadReel = asyncHandler(async (req: Request, res: Response) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const file = (req as any).file;
  if (!file) {
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
  const uploadResult = await uploadVideoFromBuffer(file.buffer, file.mimetype, {
    folder: CLOUDINARY_FOLDERS.REELS,
    resourceType: "video",
    baseUrl,
    originalname: file.originalname,
  });

  try {
    const reel = await createReel({
      customerId,
      productId,
      videoUrl: uploadResult.secureUrl || uploadResult.url,
      videoPublicId: uploadResult.publicId,
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
