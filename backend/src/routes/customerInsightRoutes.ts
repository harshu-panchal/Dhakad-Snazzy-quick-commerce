import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import * as controller from "../modules/seller/controllers/customerInsightController";
import { productReminderRateLimiter } from "../middleware/rateLimiter";

const router = Router();
router.use(authenticate, requireUserType("Seller"));
router.get("/summary", controller.getInsightSummary);
router.get("/products", controller.getSellerInsightProducts);
router.get("/templates", controller.getActiveTemplates);
router.get("/campaigns", controller.getCampaigns);
router.patch("/campaigns/:id/cancel", controller.cancelCampaign);
router.post("/campaigns", productReminderRateLimiter, controller.createSellerCampaign);
router.get("/", controller.getInsights);
export default router;
