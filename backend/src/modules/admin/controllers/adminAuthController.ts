import { Request, Response } from "express";
import crypto from "crypto";
import Admin, { validatePasswordStrength } from "../../../models/Admin";
import AdminSession from "../../../models/AdminSession";
import {
  sendOTP as sendOTPService,
  verifyOTP as verifyOTPService,
} from "../../../services/otpService";
import {
  generateAdminAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  ADMIN_REFRESH_TOKEN_TTL_DAYS,
} from "../../../services/jwtService";
import { resolveAdminContext, serializePermissions } from "../../../services/adminPermissionService";
import { sendAdminPasswordResetEmail, isEmailConfigured } from "../../../services/emailService";
import { recordAuthEvent } from "../../../middleware/auditLog";
import { SUPER_ADMIN_ROLE } from "../../../config/permissions";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Admin authentication.
 *
 * Login routing (confirmed product decision):
 *   Super Admin        -> mobile OTP only. Rejected by /login.
 *   every other role   -> email + password only. Rejected by /send-otp.
 *
 * Sessions: a short-lived access token in the Authorization header plus an
 * opaque refresh token in an httpOnly cookie. Refresh tokens rotate on every
 * use; replaying a rotated token revokes the whole family.
 */

const REFRESH_COOKIE = "adminRefreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth/admin";
const RESET_TOKEN_TTL_MINUTES = Number(process.env.ADMIN_RESET_TOKEN_TTL_MINUTES || 30);

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * The panel is served from dhakadsnazzy.com while the API is on
 * api.dhakadsnazzy.com, so the cookie is cross-site and needs
 * SameSite=None; Secure in production.
 *
 * Local development runs over plain HTTP, where SameSite=None; Secure is
 * rejected by browsers - hence the environment-dependent flags.
 */
const refreshCookieOptions = (maxAgeMs: number) =>
  ({
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? ("none" as const) : ("lax" as const),
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  });

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(
    REFRESH_COOKIE,
    token,
    refreshCookieOptions(ADMIN_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  );
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
  });
}

/** Shape returned to the client on a successful login or refresh. */
async function buildSession(
  req: Request,
  res: Response,
  admin: { _id: any; firstName: string; lastName: string; mobile: string; email: string; role: string; tokenVersion?: number },
) {
  const adminId = String(admin._id);
  const tokenVersion = admin.tokenVersion ?? 0;

  const accessToken = generateAdminAccessToken(adminId, admin.role, tokenVersion);
  const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();

  await AdminSession.create({
    adminId: admin._id,
    tokenHash,
    expiresAt,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  setRefreshCookie(res, refreshToken);

  const ctx = await resolveAdminContext(adminId);

  return {
    token: accessToken,
    user: {
      id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      mobile: admin.mobile,
      email: admin.email,
      role: admin.role,
      userType: "Admin" as const,
      isSuperAdmin: ctx?.isSuperAdmin ?? false,
    },
    permissions: ctx ? serializePermissions(ctx) : [],
  };
}

/* -------------------------------------------------------------------------- */
/*                          Email + password login                            */
/* -------------------------------------------------------------------------- */

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select("+password");

  // One generic message for "no such account" and "wrong password" so the
  // response cannot be used to enumerate admin emails.
  const invalid = () => {
    void recordAuthEvent(req, {
      event: "login.failure",
      statusCode: 401,
      adminEmail: String(email).toLowerCase().trim(),
      adminId: admin?._id,
      adminRole: admin?.role,
    });
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  };

  if (!admin) return invalid();

  if (admin.role === SUPER_ADMIN_ROLE) {
    return res.status(403).json({
      success: false,
      code: "OTP_LOGIN_REQUIRED",
      message: "Super Admin accounts sign in with mobile OTP.",
    });
  }

  if (admin.isActive === false) {
    void recordAuthEvent(req, {
      event: "login.disabled",
      statusCode: 403,
      adminId: admin._id,
      adminEmail: admin.email,
      adminRole: admin.role,
    });
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_DISABLED",
      message: "This account has been deactivated. Contact your administrator.",
    });
  }

  const ok = await admin.comparePassword(password);
  if (!ok) return invalid();

  admin.lastLoginAt = new Date();
  await admin.save({ validateBeforeSave: false });

  const session = await buildSession(req, res, admin as any);

  void recordAuthEvent(req, {
    event: "login.success",
    statusCode: 200,
    adminId: admin._id,
    adminEmail: admin.email,
    adminRole: admin.role,
  });

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: session,
  });
});

/* -------------------------------------------------------------------------- */
/*                      Mobile OTP login (Super Admin only)                   */
/* -------------------------------------------------------------------------- */

export const sendOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body ?? {};

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  const admin = await Admin.findOne({ mobile });

  // Same response whether the number is unknown or simply not a Super Admin,
  // so this endpoint cannot be used to discover which numbers are admins.
  if (!admin || admin.role !== SUPER_ADMIN_ROLE || admin.isActive === false) {
    void recordAuthEvent(req, {
      event: "otp.rejected",
      statusCode: 403,
      adminId: admin?._id,
      adminEmail: admin?.email ?? "",
      adminRole: admin?.role ?? "",
    });
    return res.status(403).json({
      success: false,
      code: "PASSWORD_LOGIN_REQUIRED",
      message: "This number cannot sign in with OTP. Use your email and password.",
    });
  }

  const result = await sendOTPService(mobile, "Admin", true);

  return res.status(200).json({
    success: true,
    message: result.message,
  });
});

export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp } = req.body ?? {};

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  if (!otp || !/^[0-9]{4,6}$/.test(String(otp))) {
    return res.status(400).json({
      success: false,
      message: "Valid OTP is required",
    });
  }

  const admin = await Admin.findOne({ mobile });

  if (!admin || admin.role !== SUPER_ADMIN_ROLE || admin.isActive === false) {
    return res.status(403).json({
      success: false,
      code: "PASSWORD_LOGIN_REQUIRED",
      message: "This number cannot sign in with OTP. Use your email and password.",
    });
  }

  const isValid = await verifyOTPService(mobile, String(otp), "Admin");
  if (!isValid) {
    void recordAuthEvent(req, {
      event: "otp.failure",
      statusCode: 401,
      adminId: admin._id,
      adminEmail: admin.email,
      adminRole: admin.role,
    });
    return res.status(401).json({
      success: false,
      message: "Invalid or expired OTP",
    });
  }

  admin.lastLoginAt = new Date();
  await admin.save({ validateBeforeSave: false });

  const session = await buildSession(req, res, admin as any);

  void recordAuthEvent(req, {
    event: "login.success.otp",
    statusCode: 200,
    adminId: admin._id,
    adminEmail: admin.email,
    adminRole: admin.role,
  });

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: session,
  });
});

/* -------------------------------------------------------------------------- */
/*                             Session lifecycle                              */
/* -------------------------------------------------------------------------- */

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const presented = req.cookies?.[REFRESH_COOKIE];

  if (!presented || typeof presented !== "string") {
    return res.status(401).json({
      success: false,
      code: "NO_REFRESH_TOKEN",
      message: "No session to refresh.",
    });
  }

  const tokenHash = hashRefreshToken(presented);
  const session = await AdminSession.findOne({ tokenHash });

  if (!session) {
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      code: "INVALID_REFRESH_TOKEN",
      message: "Your session has ended. Please sign in again.",
    });
  }

  // A token that was already rotated is being replayed. Treat it as theft:
  // revoke every session for the account and force a fresh sign-in.
  if (session.revokedAt) {
    await AdminSession.updateMany(
      { adminId: session.adminId, revokedAt: { $exists: false } },
      { revokedAt: new Date(), revokedReason: "reuse-detected" },
    );
    clearRefreshCookie(res);
    void recordAuthEvent(req, {
      event: "refresh.reuse-detected",
      statusCode: 401,
      adminId: session.adminId,
      adminEmail: "",
      adminRole: "",
    });
    return res.status(401).json({
      success: false,
      code: "SESSION_REVOKED",
      message: "Your session has ended. Please sign in again.",
    });
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      code: "REFRESH_TOKEN_EXPIRED",
      message: "Your session has expired. Please sign in again.",
    });
  }

  const admin = await Admin.findById(session.adminId);
  if (!admin || admin.isActive === false) {
    await AdminSession.updateMany(
      { adminId: session.adminId, revokedAt: { $exists: false } },
      { revokedAt: new Date(), revokedReason: "logout-all" },
    );
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      code: "ACCOUNT_DISABLED",
      message: "This account is no longer active.",
    });
  }

  // Rotate: mark the presented token used, issue a new one.
  session.revokedAt = new Date();
  session.revokedReason = "rotated";
  session.lastUsedAt = new Date();
  await session.save();

  const next = await buildSession(req, res, admin as any);

  return res.status(200).json({
    success: true,
    message: "Session refreshed",
    data: next,
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const presented = req.cookies?.[REFRESH_COOKIE];

  if (presented && typeof presented === "string") {
    await AdminSession.updateOne(
      { tokenHash: hashRefreshToken(presented), revokedAt: { $exists: false } },
      { revokedAt: new Date(), revokedReason: "logout" },
    );
  }

  clearRefreshCookie(res);

  return res.status(200).json({ success: true, message: "Logged out" });
});

/**
 * Ends every session for the calling admin and invalidates all issued access
 * tokens by bumping tokenVersion. Requires a valid access token.
 */
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.userType !== "Admin") {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const adminId = req.user.userId;

  await Promise.all([
    Admin.updateOne({ _id: adminId }, { $inc: { tokenVersion: 1 } }),
    AdminSession.updateMany(
      { adminId, revokedAt: { $exists: false } },
      { revokedAt: new Date(), revokedReason: "logout-all" },
    ),
  ]);

  clearRefreshCookie(res);

  void recordAuthEvent(req, {
    event: "logout.all",
    statusCode: 200,
    adminId: adminId as any,
    adminEmail: req.adminContext?.email ?? "",
    adminRole: req.adminContext?.roleName ?? "",
  });

  return res.status(200).json({
    success: true,
    message: "Signed out of all devices",
  });
});

/* -------------------------------------------------------------------------- */
/*                              Password reset                                */
/* -------------------------------------------------------------------------- */

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body ?? {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  const normalized = email.toLowerCase().trim();

  // Always the same response, whether or not the account exists, so this
  // endpoint cannot be used to enumerate admin emails.
  const generic = () =>
    res.status(200).json({
      success: true,
      message:
        "If that email belongs to an admin account, a password reset link is on its way.",
    });

  const admin = await Admin.findOne({ email: normalized });

  // Super Admin has no password to reset.
  if (!admin || admin.role === SUPER_ADMIN_ROLE || admin.isActive === false) {
    return generic();
  }

  if (!isEmailConfigured()) {
    console.error(
      "[auth] forgot-password requested but SMTP is not configured; no email sent.",
    );
    return generic();
  }

  const token = crypto.randomBytes(32).toString("hex");
  admin.resetPasswordTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  admin.resetPasswordExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await admin.save({ validateBeforeSave: false });

  await sendAdminPasswordResetEmail({
    to: admin.email,
    firstName: admin.firstName,
    token,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  });

  void recordAuthEvent(req, {
    event: "password.reset-requested",
    statusCode: 200,
    adminId: admin._id,
    adminEmail: admin.email,
    adminRole: admin.role,
  });

  return generic();
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body ?? {};

  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Reset token and new password are required",
    });
  }

  const policyError = validatePasswordStrength(password);
  if (policyError) {
    return res.status(400).json({ success: false, message: policyError });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const admin = await Admin.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
  }).select("+resetPasswordTokenHash +resetPasswordExpiresAt");

  if (!admin) {
    return res.status(400).json({
      success: false,
      code: "INVALID_RESET_TOKEN",
      message: "This reset link is invalid or has expired. Request a new one.",
    });
  }

  admin.password = password;
  admin.resetPasswordTokenHash = undefined;
  admin.resetPasswordExpiresAt = undefined;
  admin.tokenVersion = (admin.tokenVersion ?? 0) + 1; // force re-login everywhere
  await admin.save();

  await AdminSession.updateMany(
    { adminId: admin._id, revokedAt: { $exists: false } },
    { revokedAt: new Date(), revokedReason: "password-change" },
  );

  clearRefreshCookie(res);

  void recordAuthEvent(req, {
    event: "password.reset-completed",
    statusCode: 200,
    adminId: admin._id,
    adminEmail: admin.email,
    adminRole: admin.role,
  });

  return res.status(200).json({
    success: true,
    message: "Password updated. Please sign in with your new password.",
  });
});
