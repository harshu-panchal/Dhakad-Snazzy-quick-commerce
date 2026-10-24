import { Router } from "express";
import * as customerController from "../modules/customer/controllers/customerController";
import { authenticate } from "../middleware/auth";

const router = Router();

// Get customer profile (protected route)
router.get("/profile", authenticate, customerController.getProfile);

// Update customer profile (protected route)
router.put("/profile", authenticate, customerController.updateProfile);

// Update customer location (protected route)
router.post("/location", authenticate, customerController.updateLocation);

// Get customer location (protected route)
router.get("/location", authenticate, customerController.getLocation);

// Get customer wallet (balance + transactions)
router.get("/wallet", authenticate, customerController.getWallet);

export default router;
