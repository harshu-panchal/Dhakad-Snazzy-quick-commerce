import { Router } from "express";
import * as adminAuthController from "../modules/admin/controllers/adminAuthController";
import {
  otpRateLimiter,
  adminLoginRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} from "../middleware/rateLimiter";

const router = Router();

/**
 * Admin authentication.
 *
 * Email + password is the login path for every role EXCEPT Super Admin.
 * Super Admin signs in with mobile OTP only, and the OTP endpoints reject
 * every non-Super-Admin account.
 *
 * There is deliberately no public registration route. Admin accounts are
 * created from the System User page (POST /admin/system-users), behind
 * authentication and the settings.system_user permission.
 */

// Email + password login (all roles except Super Admin)
router.post("/login", adminLoginRateLimiter, adminAuthController.login);

// Mobile OTP login (Super Admin only)
router.post("/send-otp", otpRateLimiter, adminAuthController.sendOTP);
router.post("/verify-otp", adminLoginRateLimiter, adminAuthController.verifyOTP);

// Session lifecycle
router.post("/refresh", adminAuthController.refresh);
router.post("/logout", adminAuthController.logout);
router.post("/logout-all", adminAuthController.logoutAll);

// Password reset
router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  adminAuthController.forgotPassword,
);
router.post(
  "/reset-password",
  resetPasswordRateLimiter,
  adminAuthController.resetPassword,
);

export default router;
