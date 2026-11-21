import { Router } from "express";
import {
  getAllSellers,
  getSellerById,
  updateSellerStatus,
  updateSeller,
  deleteSeller,
  updateSellerCategoryCommissions,
} from "../modules/seller/controllers/sellerController";
import { authenticate, requireUserType } from "../middleware/auth";
import { requireTiered } from "../middleware/permissions";

const router = Router();

// All routes require authentication and admin user type
router.use(authenticate);
router.use(requireUserType("Admin"));
// Three admin pages read these endpoints - Manage Seller List, Seller
// Transaction and Seller Location - but only Manage Seller List should be
// able to edit or delete a seller, so view and manage differ here.
router.use(
  requireTiered({
    view: ["sellers.list", "sellers.transaction", "sellers.location"],
    manage: ["sellers.list"],
  }),
);

// Get all sellers
router.get("/", getAllSellers);

// Get seller by ID
router.get("/:id", getSellerById);

// Update seller status
router.patch("/:id/status", updateSellerStatus);

// Update seller category commissions
router.put("/:id/category-commissions", updateSellerCategoryCommissions);

// Update seller details
router.put("/:id", updateSeller);

// Delete seller
router.delete("/:id", deleteSeller);

export default router;
