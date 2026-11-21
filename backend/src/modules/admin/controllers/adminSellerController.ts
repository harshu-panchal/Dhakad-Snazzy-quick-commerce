import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Seller from "../../../models/Seller";

/**
 * Get all sellers (for dropdowns/lists)
 */
export const getAllSellers = asyncHandler(async (_req: Request, res: Response) => {
    // Deleted sellers are not offered in pickers.
    const sellers = await Seller.find({ isDeleted: { $ne: true } })
        .select("sellerName storeName profile status")
        .sort({ storeName: 1 });

    return res.status(200).json({
        success: true,
        message: "Sellers fetched successfully",
        data: sellers,
    });
});
