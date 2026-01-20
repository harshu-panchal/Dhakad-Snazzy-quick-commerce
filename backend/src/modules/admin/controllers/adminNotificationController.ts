import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Notification from "../../../models/Notification";

/**
 * Create a new notification
 */
export const createNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      recipientType,
      recipientId,
      title,
      message,
      type,
      link,
      actionLabel,
      priority,
      expiresAt,
    } = req.body;

    if (!recipientType || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "Recipient type, title, and message are required",
      });
    }

    const notification = await Notification.create({
      recipientType,
      recipientId,
      title,
      message,
      type: type || "Info",
      link,
      actionLabel,
      priority: priority || "Medium",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.user?.userId,
      isRead: false,
    });

    return res.status(201).json({
      success: true,
      message: "Notification created successfully",
      data: notification,
    });
  }
);

/**
 * Get all notifications
 */
export const getNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      recipientType,
      recipientId,
      isRead,
      type,
      priority,
    } = req.query;

    const query: any = {};

    if (recipientType) query.recipientType = recipientType;
    if (recipientId) query.recipientId = recipientId;
    if (isRead !== undefined) query.isRead = isRead === "true";
    if (type) query.type = type;
    if (priority) query.priority = priority;

    // Filter expired notifications
    query.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gte: new Date() } },
    ];

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .populate("createdBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Notification.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      data: notifications,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Get notification by ID
 */
export const getNotificationById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await Notification.findById(id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification fetched successfully",
      data: notification,
    });
  }
);

/**
 * Mark notification as read
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const notification = await Notification.findByIdAndUpdate(
    id,
    {
      isRead: true,
      readAt: new Date(),
    },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

/**
 * Update notification
 */
export const updateNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const notification = await Notification.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification updated successfully",
      data: notification,
    });
  }
);

/**
 * Send notification (Push to users)
 * This is a placeholder for actual push notification logic (Firebase/Socket.io)
 * For now, just mark it as sent.
 */
export const sendNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Logic to send push notification would go here
    // e.g. await pushNotificationService.send(notification);

    notification.sentAt = new Date();
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Notification sent successfully",
      data: notification,
    });
  }
);

/**
 * Mark multiple notifications as read
 */
export const markMultipleAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Notification IDs array is required",
      });
    }

    const result = await Notification.updateMany(
      { _id: { $in: notificationIds } },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: {
        modified: result.modifiedCount,
      },
    });
  }
);

/**
 * Delete notification
 */
export const deleteNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  }
);
