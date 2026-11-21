import { Request, Response } from "express";
import Admin, { validatePasswordStrength } from "../../../models/Admin";
import AdminSession from "../../../models/AdminSession";
import { serializePermissions } from "../../../services/adminPermissionService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Identity and effective permissions for the signed-in admin.
 *
 * This is the frontend's authority on what the current user can do. The copy
 * cached in localStorage is a render-blocking convenience only — tampering
 * with it changes what the menu draws and nothing else, because every endpoint
 * re-checks server-side.
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
    const ctx = req.adminContext;

    if (!ctx) {
        return res.status(401).json({
            success: false,
            message: "Authentication required",
        });
    }

    const admin = await Admin.findById(ctx.adminId)
        .select("firstName lastName mobile email role createdAt")
        .lean();

    if (!admin) {
        return res.status(404).json({
            success: false,
            message: "Admin not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            user: {
                id: admin._id,
                firstName: admin.firstName,
                lastName: admin.lastName,
                mobile: admin.mobile,
                email: admin.email,
                role: admin.role,
                userType: "Admin",
                isSuperAdmin: ctx.isSuperAdmin,
            },
            permissions: serializePermissions(ctx),
            // Which towns this admin may see. {all:true} for Super Admin and for
            // an admin granted every town.
            cityScope: ctx.scope,
        },
    });
});

/**
 * Change your own password.
 *
 * Bumps tokenVersion, which invalidates every access token issued before now,
 * and revokes all other refresh sessions. The calling client is handed a fresh
 * session so the admin is not logged out of the tab they are using.
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: "Current password and new password are required",
        });
    }

    const policyError = validatePasswordStrength(newPassword);
    if (policyError) {
        return res.status(400).json({ success: false, message: policyError });
    }

    const admin = await Admin.findById(userId).select("+password");

    if (!admin) {
        return res.status(404).json({
            success: false,
            message: "Admin not found",
        });
    }

    const ok = await admin.comparePassword(currentPassword);
    if (!ok) {
        return res.status(401).json({
            success: false,
            message: "Your current password is incorrect",
        });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({
            success: false,
            message: "The new password must be different from the current one",
        });
    }

    admin.password = newPassword;
    admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
    await admin.save();

    await AdminSession.updateMany(
        { adminId: admin._id, revokedAt: { $exists: false } },
        { revokedAt: new Date(), revokedReason: "password-change" },
    );

    return res.status(200).json({
        success: true,
        // The client must sign in again: its access token now carries a stale
        // tokenVersion and its refresh session has been revoked.
        message: "Password updated. Please sign in again.",
        data: { reauthRequired: true },
    });
});

/**
 * Get authenticated admin's profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    const admin = await Admin.findById(userId).select("-password");

    if (!admin) {
        return res.status(404).json({
            success: false,
            message: "Admin not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            id: admin._id,
            firstName: admin.firstName,
            lastName: admin.lastName,
            mobile: admin.mobile,
            email: admin.email,
            role: admin.role,
            createdAt: admin.createdAt,
            updatedAt: admin.updatedAt,
        },
    });
});

/**
 * Update authenticated admin's profile
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { firstName, lastName, email, mobile } = req.body;

    // Find the admin
    const admin = await Admin.findById(userId);

    if (!admin) {
        return res.status(404).json({
            success: false,
            message: "Admin not found",
        });
    }

    // Check if email is being changed and if it's already in use
    if (email && email !== admin.email) {
        const existingAdmin = await Admin.findOne({ email, _id: { $ne: userId } });
        if (existingAdmin) {
            return res.status(409).json({
                success: false,
                message: "Email already in use by another admin",
            });
        }
    }

    // Check if mobile is being changed and if it's already in use
    if (mobile && mobile !== admin.mobile) {
        const existingAdmin = await Admin.findOne({ mobile, _id: { $ne: userId } });
        if (existingAdmin) {
            return res.status(409).json({
                success: false,
                message: "Mobile number already in use by another admin",
            });
        }
    }

    // Update fields
    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (email) admin.email = email;
    if (mobile) admin.mobile = mobile;

    await admin.save();

    return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
            id: admin._id,
            firstName: admin.firstName,
            lastName: admin.lastName,
            mobile: admin.mobile,
            email: admin.email,
            role: admin.role,
            updatedAt: admin.updatedAt,
        },
    });
});
