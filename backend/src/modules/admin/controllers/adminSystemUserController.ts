import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Admin, { validatePasswordStrength } from "../../../models/Admin";
import AdminSession from "../../../models/AdminSession";
import Role from "../../../models/Role";
import City from "../../../models/City";
import { SUPER_ADMIN_ROLE } from "../../../config/permissions";

/**
 * Admin ("system user") account management.
 *
 * Privilege-escalation guards here are hard checks, independent of
 * permissions: holding settings.system_user:manage must not be a path to
 * becoming Super Admin.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const serialize = (admin: any) => ({
  id: admin._id,
  firstName: admin.firstName,
  lastName: admin.lastName,
  mobile: admin.mobile,
  email: admin.email,
  role: admin.role,
  isActive: admin.isActive !== false,
  // A missing value (an account from before this field existed) is reported
  // as what it means: selected, with no towns.
  cityScope: {
    mode: admin.cityScope?.mode === "all" ? "all" : "selected",
    cityIds: (admin.cityScope?.cityIds ?? []).map((id: unknown) => String(id)),
  },
  lastLoginAt: admin.lastLoginAt,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

type StoredScope = { mode: "all" | "selected"; cityIds: mongoose.Types.ObjectId[] };

/**
 * Validate a submitted town scope. Returns the value to store, or an error
 * message. Every town id must exist; duplicates are dropped; "all" carries no
 * ids.
 */
async function parseCityScope(
  input: unknown,
): Promise<{ ok: true; value: StoredScope } | { ok: false; error: string }> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "cityScope must be an object like { mode, cityIds }" };
  }

  const { mode, cityIds } = input as { mode?: unknown; cityIds?: unknown };

  if (mode !== "all" && mode !== "selected") {
    return { ok: false, error: 'cityScope.mode must be "all" or "selected"' };
  }

  if (mode === "all") return { ok: true, value: { mode: "all", cityIds: [] } };

  if (cityIds !== undefined && !Array.isArray(cityIds)) {
    return { ok: false, error: "cityScope.cityIds must be an array" };
  }

  const ids = [...new Set(((cityIds as unknown[]) ?? []).map((id) => String(id)))];

  if (ids.some((id) => !mongoose.isValidObjectId(id))) {
    return { ok: false, error: "cityScope.cityIds contains an invalid town id" };
  }

  if (ids.length > 0) {
    const found = await City.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) {
      return { ok: false, error: "cityScope.cityIds refers to a town that does not exist" };
    }
  }

  return { ok: true, value: { mode: "selected", cityIds: ids.map((id) => new mongoose.Types.ObjectId(id)) } };
}

/**
 * Granting town access is itself limited. Without this, anyone holding the
 * System User page could widen their own (or anyone's) scope to every town,
 * which would make the limit meaningless.
 *
 * Super Admin and an admin with access to every town may grant anything.
 * Anyone else may only grant towns they can see themselves, and may only
 * edit an admin whose current towns are all within their own.
 *
 * Returns an error message, or null when the grant is allowed.
 */
function scopeGrantError(
  req: Request,
  requested: StoredScope,
  current?: { mode?: string; cityIds?: unknown[] } | null,
): string | null {
  const ctx = req.adminContext;
  if (!ctx || ctx.scope.all) return null;

  const mine = new Set(ctx.scope.cityIds);

  if (requested.mode === "all") {
    return "Only an admin with access to every town can grant access to every town.";
  }
  if (requested.cityIds.some((id) => !mine.has(String(id)))) {
    return "You can only grant towns that you can access yourself.";
  }
  if (current) {
    if (current.mode === "all") return "You cannot change the towns of an admin who has access to every town.";
    if ((current.cityIds ?? []).some((id) => !mine.has(String(id)))) {
      return "You cannot change the towns of an admin who has towns you cannot access.";
    }
  }
  return null;
}

/** Same mode and same set of towns? Order and duplicates do not matter. */
function sameScope(
  a: StoredScope,
  b?: { mode?: string; cityIds?: unknown[] } | null,
): boolean {
  const bMode = b?.mode === "all" ? "all" : "selected";
  if (a.mode !== bMode) return false;
  if (a.mode === "all") return true;
  const left = new Set(a.cityIds.map((id) => String(id)));
  const right = new Set((b?.cityIds ?? []).map((id) => String(id)));
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Only Super Admin may create or promote to Super Admin. */
function blocksSuperAdminAssignment(req: Request, role?: string): boolean {
  return role === SUPER_ADMIN_ROLE && !req.adminContext?.isSuperAdmin;
}

/**
 * Get all system users (admins) with filters and pagination
 */
export const getAllSystemUsers = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      isActive,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Any existing role name is a valid filter now that roles are dynamic.
    if (role && typeof role === "string") {
      query.role = role;
    }

    if (isActive === "true") query.isActive = { $ne: false };
    if (isActive === "false") query.isActive = false;

    if (search) {
      query.$or = [
        { firstName: { $regex: search as string, $options: "i" } },
        { lastName: { $regex: search as string, $options: "i" } },
        { email: { $regex: search as string, $options: "i" } },
        { mobile: { $regex: search as string, $options: "i" } },
      ];
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [admins, total] = await Promise.all([
      Admin.find(query).select("-password").sort(sort).skip(skip).limit(limitNum).lean(),
      Admin.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "System users fetched successfully",
      data: admins.map(serialize),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Get system user by ID
 */
export const getSystemUserById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const admin = await Admin.findById(id).select("-password").lean();

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "System user fetched successfully",
      data: serialize(admin),
    });
  }
);

/**
 * Create new system user (admin)
 */
export const createSystemUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { firstName, lastName, mobile, email, password, role } = req.body ?? {};

    if (!firstName || !lastName || !mobile || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, mobile, email, password and role are all required",
      });
    }

    if (blocksSuperAdminAssignment(req, role)) {
      return res.status(403).json({
        success: false,
        code: "SUPER_ADMIN_REQUIRED",
        message: "Only a Super Admin can create another Super Admin.",
      });
    }

    // Roles are dynamic, so validate against the collection rather than a
    // hardcoded list. (Admin's pre-save hook checks this too; checking here
    // produces a clearer message.)
    const roleDoc = await Role.findOne({ name: role });
    if (!roleDoc) {
      return res.status(400).json({
        success: false,
        message: `Role "${role}" does not exist`,
      });
    }

    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit mobile number is required",
      });
    }

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const policyError = validatePasswordStrength(password);
    if (policyError) {
      return res.status(400).json({ success: false, message: policyError });
    }

    const existingAdmin = await Admin.findOne({
      $or: [{ mobile }, { email: String(email).toLowerCase().trim() }],
    });

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: "An admin already exists with this mobile or email",
      });
    }

    // Towns. Defaults to none (fail closed). Super Admin is never limited, so
    // its scope is stored as "all" for clarity.
    let cityScope: StoredScope = { mode: "selected", cityIds: [] };
    if (req.body?.cityScope !== undefined) {
      const parsed = await parseCityScope(req.body.cityScope);
      if (!parsed.ok) {
        return res.status(400).json({ success: false, message: parsed.error });
      }
      const denied = scopeGrantError(req, parsed.value);
      if (denied) {
        return res.status(403).json({ success: false, code: "SCOPE_NOT_GRANTABLE", message: denied });
      }
      cityScope = parsed.value;
    }
    if (role === SUPER_ADMIN_ROLE) cityScope = { mode: "all", cityIds: [] };

    const admin = await Admin.create({
      firstName,
      lastName,
      mobile,
      email,
      password,
      role,
      cityScope,
    });

    return res.status(201).json({
      success: true,
      message: "System user created successfully",
      data: serialize(admin),
    });
  }
);

/**
 * Update system user (admin)
 */
export const updateSystemUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { firstName, lastName, mobile, email, password, role, isActive } = req.body ?? {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    const isSelf = String(admin._id) === req.adminContext?.adminId;

    // Promoting anyone (including yourself) to Super Admin is Super Admin only.
    if (role && role !== admin.role && blocksSuperAdminAssignment(req, role)) {
      return res.status(403).json({
        success: false,
        code: "SUPER_ADMIN_REQUIRED",
        message: "Only a Super Admin can grant the Super Admin role.",
      });
    }

    // Demoting or disabling a Super Admin is likewise Super Admin only,
    // otherwise settings.system_user:manage could neutralise them.
    if (
      admin.role === SUPER_ADMIN_ROLE &&
      !req.adminContext?.isSuperAdmin &&
      ((role && role !== SUPER_ADMIN_ROLE) || isActive === false || password)
    ) {
      return res.status(403).json({
        success: false,
        code: "SUPER_ADMIN_REQUIRED",
        message: "Only a Super Admin can modify a Super Admin account.",
      });
    }

    if (role && role !== admin.role) {
      const roleDoc = await Role.findOne({ name: role });
      if (!roleDoc) {
        return res.status(400).json({
          success: false,
          message: `Role "${role}" does not exist`,
        });
      }

      // Protect the last Super Admin from being demoted.
      if (admin.role === SUPER_ADMIN_ROLE) {
        const count = await Admin.countDocuments({ role: SUPER_ADMIN_ROLE });
        if (count === 1) {
          return res.status(400).json({
            success: false,
            message: "Cannot change the role of the last Super Admin",
          });
        }
      }
    }

    if (isActive === false) {
      if (isSelf) {
        return res.status(400).json({
          success: false,
          message: "You cannot deactivate your own account",
        });
      }
      if (admin.role === SUPER_ADMIN_ROLE) {
        const activeSupers = await Admin.countDocuments({
          role: SUPER_ADMIN_ROLE,
          isActive: { $ne: false },
        });
        if (activeSupers <= 1) {
          return res.status(400).json({
            success: false,
            message: "Cannot deactivate the last active Super Admin",
          });
        }
      }
    }

    if (email && email !== admin.email) {
      const clash = await Admin.findOne({
        email: String(email).toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (clash) {
        return res.status(409).json({
          success: false,
          message: "Email already in use by another admin",
        });
      }
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address",
        });
      }
    }

    if (mobile && mobile !== admin.mobile) {
      if (!/^[0-9]{10}$/.test(mobile)) {
        return res.status(400).json({
          success: false,
          message: "Valid 10-digit mobile number is required",
        });
      }
      const clash = await Admin.findOne({ mobile, _id: { $ne: id } });
      if (clash) {
        return res.status(409).json({
          success: false,
          message: "Mobile number already in use by another admin",
        });
      }
    }

    if (password) {
      const policyError = validatePasswordStrength(password);
      if (policyError) {
        return res.status(400).json({ success: false, message: policyError });
      }
    }

    // Towns. Validated up front so a bad value changes nothing.
    let nextScope: StoredScope | undefined;
    if (req.body?.cityScope !== undefined) {
      const parsed = await parseCityScope(req.body.cityScope);
      if (!parsed.ok) {
        return res.status(400).json({ success: false, message: parsed.error });
      }

      // The form always sends the scope. Resending the current value changes
      // nothing, so it must not trip the checks below.
      if (!sameScope(parsed.value, admin.cityScope as any)) {
      // Same rule as for roles: you cannot edit your own reach, or it would not
      // be a limit at all. Super Admin may.
      if (isSelf && !req.adminContext?.isSuperAdmin) {
        return res.status(403).json({
          success: false,
          code: "SELF_SCOPE_EDIT",
          message: "You cannot change your own towns. Ask a Super Admin.",
        });
      }

      const denied = scopeGrantError(req, parsed.value, admin.cityScope as any);
      if (denied) {
        return res.status(403).json({ success: false, code: "SCOPE_NOT_GRANTABLE", message: denied });
      }
      nextScope = parsed.value;
      }
    }

    // Captured before the assignments below, so the comparison is against the
    // stored role rather than the one just written.
    const roleChanged = Boolean(role) && role !== admin.role;
    const previousRole = admin.role;

    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (email) admin.email = email;
    if (mobile) admin.mobile = mobile;
    if (role) admin.role = role;
    if (isActive !== undefined) admin.isActive = Boolean(isActive);
    if (nextScope) admin.cityScope = nextScope as any;

    // Super Admin is stored as "all". Demoting one must NOT leave that behind, or a
    // demoted admin would keep seeing every town: fall back to none unless the
    // same request chose towns. Promoting one to Super Admin stores "all".
    if (roleChanged) {
      if (role === SUPER_ADMIN_ROLE) {
        admin.cityScope = { mode: "all", cityIds: [] } as any;
      } else if (previousRole === SUPER_ADMIN_ROLE && !nextScope) {
        admin.cityScope = { mode: "selected", cityIds: [] } as any;
      }
    }

    // A role change, a password reset or a deactivation must take effect
    // immediately rather than when the target's token happens to expire.
    const invalidateSessions = Boolean(password) || isActive === false || roleChanged;

    if (password) {
      admin.password = password; // hashed by the pre-save hook
    }

    if (invalidateSessions) {
      admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
    }

    await admin.save();

    if (invalidateSessions) {
      await AdminSession.updateMany(
        { adminId: admin._id, revokedAt: { $exists: false } },
        { revokedAt: new Date(), revokedReason: "logout-all" },
      );
    }

    return res.status(200).json({
      success: true,
      message: "System user updated successfully",
      data: serialize(admin),
    });
  }
);

/**
 * Delete system user (admin)
 */
export const deleteSystemUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    if (id === req.user!.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    if (admin.role === SUPER_ADMIN_ROLE) {
      if (!req.adminContext?.isSuperAdmin) {
        return res.status(403).json({
          success: false,
          code: "SUPER_ADMIN_REQUIRED",
          message: "Only a Super Admin can delete a Super Admin account.",
        });
      }

      const superAdminCount = await Admin.countDocuments({ role: SUPER_ADMIN_ROLE });
      if (superAdminCount === 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete the last Super Admin",
        });
      }
    }

    await Promise.all([
      Admin.findByIdAndDelete(id),
      AdminSession.deleteMany({ adminId: id }),
    ]);

    return res.status(200).json({
      success: true,
      message: "System user deleted successfully",
    });
  }
);
