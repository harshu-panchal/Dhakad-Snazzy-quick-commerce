import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import AuditLog from "../../../models/AuditLog";

/**
 * Read-only access to the audit trail. Writes happen in middleware/auditLog.ts;
 * there is deliberately no endpoint that creates, edits or deletes a record.
 */
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 25,
    adminId,
    kind,
    method,
    search,
    from,
    to,
  } = req.query;

  const query: any = {};

  if (adminId && mongoose.isValidObjectId(adminId as string)) {
    query.adminId = new mongoose.Types.ObjectId(adminId as string);
  }

  if (kind === "request" || kind === "auth") {
    query.kind = kind;
  }

  if (method && typeof method === "string") {
    query.method = method.toUpperCase();
  }

  if (search && typeof search === "string" && search.trim()) {
    const rx = { $regex: search.trim(), $options: "i" };
    query.$or = [{ path: rx }, { adminEmail: rx }, { event: rx }, { adminRole: rx }];
  }

  if (from || to) {
    query.createdAt = {};
    if (from) {
      const d = new Date(from as string);
      if (!Number.isNaN(d.getTime())) query.createdAt.$gte = d;
    }
    if (to) {
      const d = new Date(to as string);
      // Inclusive end-of-day when a bare date is supplied.
      if (!Number.isNaN(d.getTime())) {
        query.createdAt.$lte =
          (to as string).length <= 10 ? new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1) : d;
      }
    }
    if (!Object.keys(query.createdAt).length) delete query.createdAt;
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 25));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    AuditLog.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    message: "Audit logs fetched successfully",
    data: logs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Distinct admins appearing in the log, for the filter dropdown.
 */
export const getAuditLogActors = asyncHandler(async (_req: Request, res: Response) => {
  const actors = await AuditLog.aggregate([
    { $match: { adminId: { $ne: null } } },
    {
      $group: {
        _id: "$adminId",
        email: { $last: "$adminEmail" },
        role: { $last: "$adminRole" },
        lastSeen: { $max: "$createdAt" },
      },
    },
    { $sort: { lastSeen: -1 } },
    { $limit: 200 },
  ]);

  return res.status(200).json({
    success: true,
    message: "Audit log actors fetched successfully",
    data: actors.map((a) => ({
      id: a._id,
      email: a.email,
      role: a.role,
      lastSeen: a.lastSeen,
    })),
  });
});
