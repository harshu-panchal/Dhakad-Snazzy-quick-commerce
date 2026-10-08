import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import {
  getBalance,
  getTransactions,
  requestWithdrawal,
  getWithdrawals,
  getCommissions,
  createAdminPayoutOrder,
  verifyAdminPayout,
  createAdminPayoutOrderCashfree,
  verifyAdminPayoutCashfree,
} from "../modules/delivery/controllers/deliveryWalletController";

const router = Router();

// All routes require delivery boy authentication
router.use(authenticate, requireUserType("Delivery"));

// Wallet balance
router.get("/balance", getBalance);

// Wallet transactions
router.get("/transactions", getTransactions);

// Withdrawal requests
router.post("/withdraw", requestWithdrawal);
router.get("/withdrawals", getWithdrawals);

// Commission earnings
router.get("/commissions", getCommissions);

// Admin Payout via Cashfree (PRIMARY gateway)
router.post("/admin-payout/cashfree/create", createAdminPayoutOrderCashfree);
router.post("/admin-payout/cashfree/verify", verifyAdminPayoutCashfree);

// Admin Payout via Razorpay (SECONDARY / fallback gateway)
router.post("/admin-payout/create", createAdminPayoutOrder);
router.post("/admin-payout/verify", verifyAdminPayout);

export default router;
