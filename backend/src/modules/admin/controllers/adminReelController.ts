import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Reel from "../../../models/Reel";
import ReelCommission from "../../../models/ReelCommission";

/**
 * GET /api/v1/admin/reels?status=&page=&limit=&search=
 * List all reels with owner/product info and lifetime earnings.
 */
export const listReels = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const query: any = {};
  if (req.query.status && req.query.status !== "all") {
    query.status = req.query.status;
  }

  const [total, reels] = await Promise.all([
    Reel.countDocuments(query),
    Reel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: "product", select: "productName mainImage price" })
      .populate({ path: "customer", select: "name phone" })
      .populate({ path: "seller", select: "storeName sellerName city" })
      .lean(),
  ]);

  const reelIds = reels.map((r: any) => r._id);
  const earnings = await ReelCommission.aggregate([
    { $match: { reel: { $in: reelIds }, status: "Paid" } },
    { $group: { _id: "$reel", total: { $sum: "$commissionAmount" }, orders: { $sum: 1 } } },
  ]);
  const earnMap = new Map(earnings.map((e: any) => [e._id.toString(), e]));

  const data = reels.map((r: any) => ({
    ...r,
    earnings: Math.round((earnMap.get(r._id.toString())?.total || 0) * 100) / 100,
    conversions: earnMap.get(r._id.toString())?.orders || 0,
  }));

  return res.status(200).json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * PATCH /api/v1/admin/reels/:id/status  { status: "Active" | "Removed" }
 */
export const updateReelStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!["Active", "Removed"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }
  const reel = await Reel.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!reel) {
    return res.status(404).json({ success: false, message: "Reel not found" });
  }
  return res.status(200).json({ success: true, data: reel });
});

/**
 * DELETE /api/v1/admin/reels/:id — hard delete a reel.
 */
export const deleteReel = asyncHandler(async (req: Request, res: Response) => {
  const reel = await Reel.findByIdAndDelete(req.params.id);
  if (!reel) {
    return res.status(404).json({ success: false, message: "Reel not found" });
  }
  return res.status(200).json({ success: true, message: "Reel deleted" });
});

/**
 * GET /api/v1/admin/reels/stats — headline numbers for the admin dashboard.
 */
export const reelStats = asyncHandler(async (_req: Request, res: Response) => {
  const [totalReels, activeReels, agg] = await Promise.all([
    Reel.countDocuments({}),
    Reel.countDocuments({ status: "Active" }),
    ReelCommission.aggregate([
      { $match: { status: "Paid" } },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$commissionAmount" },
          conversions: { $sum: 1 },
        },
      },
    ]),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      totalReels,
      activeReels,
      totalCommissionPaid:
        Math.round((agg[0]?.totalPaid || 0) * 100) / 100,
      conversions: agg[0]?.conversions || 0,
    },
  });
});
