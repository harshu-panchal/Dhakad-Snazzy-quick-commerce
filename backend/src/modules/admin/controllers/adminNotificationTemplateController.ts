import { Request, Response } from "express";
import mongoose from "mongoose";
import NotificationTemplate from "../../../models/NotificationTemplate";
import { validateTemplatePlaceholders } from "../../../services/productReminderService";
import { asyncHandler } from "../../../utils/asyncHandler";

const ALLOWED = ["customerName", "productName", "storeName", "price", "mrp", "discount"];
const CATEGORIES = ["RecentProductInterest", "BackInStock"];

function validate(body: any): string | null {
  if (!body.name?.trim() || !body.key?.trim() || !CATEGORIES.includes(body.category)) return "Name, key and valid category are required";
  if (!body.titleTemplate?.trim() || !body.bodyTemplate?.trim()) return "Title and body templates are required";
  if (body.titleTemplate.length > 80 || body.bodyTemplate.length > 240) return "Template title or body is too long";
  const invalid = validateTemplatePlaceholders(body.titleTemplate, body.bodyTemplate, ALLOWED);
  return invalid.length ? `Unsupported placeholders: ${invalid.join(", ")}` : null;
}

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error });
  const key = String(req.body.key).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const latest = await NotificationTemplate.findOne({ key }).sort({ version: -1 }).select("version").lean();
  if (req.body.status === "Active") await NotificationTemplate.updateMany({ key, status: "Active" }, { status: "Archived" });
  const template = await NotificationTemplate.create({
    name: req.body.name.trim(), key, category: req.body.category,
    titleTemplate: req.body.titleTemplate.trim(), bodyTemplate: req.body.bodyTemplate.trim(),
    allowedPlaceholders: ALLOWED, status: req.body.status === "Active" ? "Active" : "Draft",
    version: (latest?.version || 0) + 1, createdBy: req.user!.userId, updatedBy: req.user!.userId,
  });
  return res.status(201).json({ success: true, data: template });
});

export const getTemplates = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.status ? { status: req.query.status } : {};
  const templates = await NotificationTemplate.find(query).sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: templates });
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid template ID" });
  const existing = await NotificationTemplate.findById(req.params.id).lean();
  if (!existing) return res.status(404).json({ success: false, message: "Template not found" });
  const merged = { ...existing, ...req.body, key: existing.key };
  const error = validate(merged);
  if (error) return res.status(400).json({ success: false, message: error });
  const latest = await NotificationTemplate.findOne({ key: existing.key }).sort({ version: -1 }).select("version").lean();
  if (req.body.status === "Active") await NotificationTemplate.updateMany({ key: existing.key, status: "Active" }, { status: "Archived" });
  const template = await NotificationTemplate.create({
    name: merged.name.trim(), key: existing.key, category: merged.category,
    titleTemplate: merged.titleTemplate.trim(), bodyTemplate: merged.bodyTemplate.trim(),
    allowedPlaceholders: ALLOWED, status: req.body.status === "Active" ? "Active" : "Draft",
    version: (latest?.version || existing.version) + 1, createdBy: req.user!.userId, updatedBy: req.user!.userId,
  });
  return res.json({ success: true, data: template });
});

export const updateTemplateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!["Draft", "Active", "Archived"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Invalid status" });
  const existing = await NotificationTemplate.findById(req.params.id).select("key").lean();
  if (!existing) return res.status(404).json({ success: false, message: "Template not found" });
  if (req.body.status === "Active") await NotificationTemplate.updateMany({ key: existing.key, status: "Active" }, { status: "Archived" });
  const template = await NotificationTemplate.findByIdAndUpdate(req.params.id, { status: req.body.status, updatedBy: req.user!.userId }, { new: true });
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.json({ success: true, data: template });
});
