import { Router } from "express";
import {
  getNearbyShops,
  getShopDetails,
  getShopProducts,
} from "../modules/customer/controllers/customerShopController";

const router = Router();

// Public routes for customer shop browsing
router.get("/", getNearbyShops);
router.get("/:sellerId", getShopDetails);
router.get("/:sellerId/products", getShopProducts);

export default router;
