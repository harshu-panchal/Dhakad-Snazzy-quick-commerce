import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import { clearProductActivity, recordProductView } from "../modules/customer/controllers/productEngagementController";

const router = Router();
router.use(authenticate, requireUserType("Customer"));
router.post("/view", recordProductView);
router.delete("/", clearProductActivity);
export default router;
