import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Role from "../../../models/Role";
import Admin from "../../../models/Admin";
import { invalidateRoleCache } from "../../../services/adminPermissionService";
import {
  permissionCatalog,
  normalizePermissions,
  ALL_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from "../../../config/permissions";

/**
 * Role management.
 *
 * Role.name is the value stored on Admin.role (a string, not a ref), so a
 * rename has to cascade and a delete has to be refused while the role is in
 * use. Both are handled below.
 */

/** Count of admin accounts per role name. */
async function userCounts(): Promise<Record<string, number>> {
  const rows = await Admin.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});
}

/**
 * Get all roles
 */
export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 50,
    search = "",
    type,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query: any = {};

  if (search) {
    query.name = { $regex: search as string, $options: "i" };
  }

  if (type) {
    query.type = type;
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50));
  const skip = (pageNum - 1) * limitNum;

  const sort: any = {};
  sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

  const [roles, total, counts] = await Promise.all([
    Role.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
    Role.countDocuments(query),
    userCounts(),
  ]);

  return res.status(200).json({
    success: true,
    message: "Roles fetched successfully",
    data: roles.map((role) => ({
      ...role,
      userCount: counts[role.name] ?? 0,
      // Super Admin's wildcard is an implementation detail; report it as the
      // full set so the UI can render it without special-casing.
      permissions: role.permissions?.includes("*")
        ? [...ALL_PERMISSIONS]
        : role.permissions ?? [],
      isWildcard: Boolean(role.permissions?.includes("*")),
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Get role by ID
 */
export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid role id" });
  }

  const role = await Role.findById(id).lean();

  if (!role) {
    return res.status(404).json({
      success: false,
      message: "Role not found",
    });
  }

  const counts = await userCounts();

  return res.status(200).json({
    success: true,
    message: "Role fetched successfully",
    data: {
      ...role,
      userCount: counts[role.name] ?? 0,
      permissions: role.permissions?.includes("*")
        ? [...ALL_PERMISSIONS]
        : role.permissions ?? [],
      isWildcard: Boolean(role.permissions?.includes("*")),
    },
  });
});

/**
 * Create a new role
 */
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const { name, permissions, description } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Role name is required",
    });
  }

  const trimmed = name.trim();

  if (trimmed === SUPER_ADMIN_ROLE) {
    return res.status(403).json({
      success: false,
      message: `"${SUPER_ADMIN_ROLE}" is reserved.`,
    });
  }

  const existingRole = await Role.findOne({ name: trimmed });
  if (existingRole) {
    return res.status(409).json({
      success: false,
      message: "A role with this name already exists",
    });
  }

  // normalizePermissions drops unknown keys and the wildcard, and adds the
  // :view that every :manage implies.
  const role = await Role.create({
    name: trimmed,
    permissions: normalizePermissions(permissions),
    description,
    type: "Custom", // only custom roles can be created via the API
    permissionsUpdatedAt: new Date(),
  });

  invalidateRoleCache(role.name);

  return res.status(201).json({
    success: true,
    message: "Role created successfully",
    data: role,
  });
});

/**
 * Update role.
 *
 * A rename cascades to every Admin.role holding the old name, in a transaction
 * where the deployment supports one.
 */
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, permissions, description, isActive } = req.body ?? {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid role id" });
  }

  const role = await Role.findById(id);

  if (!role) {
    return res.status(404).json({
      success: false,
      message: "Role not found",
    });
  }

  if (role.type === "System") {
    return res.status(403).json({
      success: false,
      message:
        "System roles cannot be modified. Create a custom role instead.",
    });
  }

  // Editing your own role's permissions would be a self-escalation path, so
  // only Super Admin may do it.
  if (
    role.name === req.adminContext?.roleName &&
    !req.adminContext?.isSuperAdmin
  ) {
    return res.status(403).json({
      success: false,
      code: "SELF_ROLE_EDIT",
      message:
        "You cannot edit the permissions of your own role. Ask a Super Admin to make this change.",
    });
  }

  const previousName = role.name;
  let renamed = false;

  if (name && typeof name === "string" && name.trim() && name.trim() !== role.name) {
    const trimmed = name.trim();

    if (trimmed === SUPER_ADMIN_ROLE) {
      return res.status(403).json({
        success: false,
        message: `"${SUPER_ADMIN_ROLE}" is reserved.`,
      });
    }

    const clash = await Role.findOne({ name: trimmed, _id: { $ne: role._id } });
    if (clash) {
      return res.status(409).json({
        success: false,
        message: "A role with this name already exists",
      });
    }

    role.name = trimmed;
    renamed = true;
  }

  if (permissions !== undefined) {
    role.permissions = normalizePermissions(permissions);
    role.permissionsUpdatedAt = new Date();
  }
  if (description !== undefined) role.description = description;
  if (isActive !== undefined) role.isActive = Boolean(isActive);

  if (!renamed) {
    await role.save();
    invalidateRoleCache(role.name);
    return res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: role,
    });
  }

  // --- rename: role document and all holders must move together ---
  const session = await mongoose.startSession().catch(() => null);

  if (session) {
    try {
      await session.withTransaction(async () => {
        await role.save({ session });
        await Admin.updateMany(
          { role: previousName },
          { role: role.name },
          { session },
        );
      });
      await session.endSession();
    } catch (error: any) {
      await session.endSession();

      // Transactions need a replica set. A standalone mongod rejects them, in
      // which case fall through to the sequential path below rather than
      // failing the rename outright.
      const unsupported =
        /Transaction|replica set|not supported/i.test(error?.message || "");
      if (!unsupported) throw error;

      await role.save();
      const result = await Admin.updateMany({ role: previousName }, { role: role.name });
      console.warn(
        `[roles] renamed "${previousName}" -> "${role.name}" without a transaction ` +
          `(standalone MongoDB). ${result.modifiedCount} admin account(s) updated.`,
      );
    }
  } else {
    await role.save();
    const result = await Admin.updateMany({ role: previousName }, { role: role.name });
    console.warn(
      `[roles] renamed "${previousName}" -> "${role.name}" without a transaction. ` +
        `${result.modifiedCount} admin account(s) updated.`,
    );
  }

  invalidateRoleCache(previousName);
  invalidateRoleCache(role.name);

  return res.status(200).json({
    success: true,
    message: "Role updated successfully",
    data: role,
  });
});

/**
 * Delete role. Refused while any admin account holds it.
 */
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid role id" });
  }

  const role = await Role.findById(id);

  if (!role) {
    return res.status(404).json({
      success: false,
      message: "Role not found",
    });
  }

  if (role.type === "System") {
    return res.status(403).json({
      success: false,
      message: "System roles cannot be deleted",
    });
  }

  const inUse = await Admin.countDocuments({ role: role.name });
  if (inUse > 0) {
    return res.status(409).json({
      success: false,
      code: "ROLE_IN_USE",
      message: `Cannot delete: ${inUse} admin account${
        inUse === 1 ? "" : "s"
      } use this role. Reassign them first.`,
      data: { userCount: inUse },
    });
  }

  await Role.findByIdAndDelete(id);
  invalidateRoleCache(role.name);

  return res.status(200).json({
    success: true,
    message: "Role deleted successfully",
  });
});

/**
 * The permission catalog: every page grouped for the role editor.
 */
export const getPermissions = asyncHandler(async (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: "Permissions fetched successfully",
    data: {
      groups: permissionCatalog(),
      all: ALL_PERMISSIONS,
    },
  });
});
