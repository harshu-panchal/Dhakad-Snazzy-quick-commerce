import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { runMigration } from "../scripts/migrateCloudinaryToLocal";
import { authenticate, requireUserType } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/permissions";

const router = Router();

import { updateImageUrlsDomain } from "../scripts/fixImageDomain";

/**
 * One-off maintenance endpoints.
 *
 * Both routes rewrite image URLs across the entire database. They were
 * previously mounted at /admin with NO authentication of any kind, making them
 * callable by anyone on the internet. They are now Super Admin only.
 */
// Applied per route, NOT with router.use: this router is mounted at /admin, so a
// router-level guard would intercept every /admin request that no earlier router
// handled (including /admin/withdrawals) and answer it 401/403.
const superAdminOnly = [authenticate, requireUserType("Admin"), requireSuperAdmin()];

/**
 * GET /api/v1/admin/migrate-images
 * Trigger Cloudinary to Local Storage migration
 */
router.get(
  "/migrate-images",
  ...superAdminOnly,
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await runMigration();
    return res.status(200).json({
      success: true,
      message: "Image migration completed successfully",
      data: result,
    });
  })
);

/**
 * GET /api/v1/admin/fix-image-domain
 * Update image URLs in DB to target domain (default: https://api.dhakadsnazzy.com)
 */
router.get(
  "/fix-image-domain",
  ...superAdminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const domain = (req.query.domain as string) || "https://api.dhakadsnazzy.com";
    const result = await updateImageUrlsDomain(domain);
    return res.status(200).json({
      success: true,
      message: `Image URLs domain updated to ${domain}`,
      data: result,
    });
  })
);

export default router;
