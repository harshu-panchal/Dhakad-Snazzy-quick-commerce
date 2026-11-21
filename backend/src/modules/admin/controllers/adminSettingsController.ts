import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import AppSettings from "../../../models/AppSettings";
import PaymentMethod from "../../../models/PaymentMethod";
import { contextCan } from "../../../services/adminPermissionService";

const REDACTED = "[redacted]";

/**
 * The AppSettings document holds live payment gateway credentials
 * (razorpay.keySecret, cashfree.secretKey) and the SMS gateway API key.
 *
 * GET /admin/settings is reachable by anyone holding either settings page, so
 * the secrets are masked unless the caller holds the specific page that owns
 * them. Values are returned as "[redacted]" rather than omitted, so the UI can
 * still show that a credential is configured.
 */
function redactSettings(req: Request, settings: any) {
  const ctx = req.adminContext;
  const canSeePayment = contextCan(ctx, "settings.billing", "view");
  const canSeeSms = contextCan(ctx, "settings.sms_gateway", "view");

  if (canSeePayment && canSeeSms) return settings;

  const plain = typeof settings?.toObject === "function" ? settings.toObject() : { ...settings };

  if (!canSeePayment && plain.paymentGateways) {
    const gateways = { ...plain.paymentGateways };
    for (const key of Object.keys(gateways)) {
      const gateway = gateways[key];
      if (gateway && typeof gateway === "object") {
        gateways[key] = Object.fromEntries(
          Object.entries(gateway).map(([k, v]) =>
            /secret|key/i.test(k) && v ? [k, REDACTED] : [k, v],
          ),
        );
      }
    }
    plain.paymentGateways = gateways;
  }

  if (!canSeeSms && plain.smsGateway) {
    plain.smsGateway = {
      ...plain.smsGateway,
      ...(plain.smsGateway.apiKey ? { apiKey: REDACTED } : {}),
      ...(plain.smsGateway.password ? { password: REDACTED } : {}),
    };
  }

  return plain;
}

async function loadOrCreateSettings() {
  let settings = await AppSettings.findOne();

  // Create default settings if none exist
  if (!settings) {
    settings = await AppSettings.create({
      appName: "Dhakad Snazzy",
      contactEmail: "contact@dhakadsnazzy.com",
      contactPhone: "1234567890",
    });
  }

  return settings;
}

/**
 * Get app settings
 */
export const getAppSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const settings = await loadOrCreateSettings();

    return res.status(200).json({
      success: true,
      message: "App settings fetched successfully",
      data: redactSettings(req, settings),
    });
  }
);

/**
 * Display settings: the small, credential-free slice of AppSettings that
 * content pages own.
 *
 * Exists because the Header Category page toggles
 * `features.showHeaderCategoryRow` and sets `allCategoryImageUrl`. Without
 * this endpoint those writes would go through PUT /admin/settings and so
 * require the Billing & Charges page — meaning a catalog editor could not flip
 * a display switch without also being handed the payment gateway credentials.
 *
 * The GET is on the lookup allowlist (any admin may read it). The PUT is gated
 * on the page that owns these fields.
 */

/**
 * Top-level AppSettings fields this endpoint may write. Anything outside this
 * list is ignored, so the endpoint cannot become a back door into the full
 * settings document.
 */
const DISPLAY_FIELDS = ["allCategoryImageUrl"] as const;

export const getFeatureSettings = asyncHandler(
  async (_req: Request, res: Response) => {
    const settings = await AppSettings.findOne()
      .select(["features", ...DISPLAY_FIELDS].join(" "))
      .lean();

    return res.status(200).json({
      success: true,
      message: "Display settings fetched successfully",
      data: {
        features: settings?.features ?? {},
        ...Object.fromEntries(
          DISPLAY_FIELDS.map((field) => [field, (settings as any)?.[field] ?? ""]),
        ),
      },
    });
  }
);

export const updateFeatureSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const { features } = body;

    const hasFeatures =
      features && typeof features === "object" && !Array.isArray(features);
    const touchedFields = DISPLAY_FIELDS.filter((field) => field in body);

    if (!hasFeatures && touchedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Provide a \`features\` object or one of: ${DISPLAY_FIELDS.join(", ")}`,
      });
    }

    const settings = await loadOrCreateSettings();

    if (hasFeatures) {
      // Merged, not replaced — a caller sending one flag must not clear the rest.
      settings.features = { ...(settings.features ?? {}), ...features } as any;
    }

    for (const field of touchedFields) {
      (settings as any)[field] = body[field];
    }

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Display settings updated successfully",
      data: {
        features: settings.features,
        ...Object.fromEntries(
          DISPLAY_FIELDS.map((field) => [field, (settings as any)[field] ?? ""]),
        ),
      },
    });
  }
);

/**
 * Update app settings
 */
export const updateAppSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const updateData = req.body;
    updateData.updatedBy = req.user?.userId;

    console.log(`[DEBUG Settings] Incoming update payload:`, JSON.stringify(updateData.deliveryConfig, null, 2));

    let settings = await AppSettings.findOne();

    if (!settings) {
      settings = await AppSettings.create(updateData);
    } else {
      settings = await AppSettings.findOneAndUpdate({}, updateData, {
        new: true,
        runValidators: true,
      });
    }

    console.log(`[DEBUG Settings] Updated settings:`, JSON.stringify(settings?.deliveryConfig, null, 2));

    return res.status(200).json({
      success: true,
      message: "App settings updated successfully",
      data: settings,
    });
  }
);

/**
 * Get payment methods
 */
export const getPaymentMethods = asyncHandler(
  async (_req: Request, res: Response) => {
    const paymentMethods = await PaymentMethod.find().sort({ order: 1 });

    return res.status(200).json({
      success: true,
      message: "Payment methods fetched successfully",
      data: paymentMethods,
    });
  }
);

/**
 * Update payment methods
 */
export const updatePaymentMethods = asyncHandler(
  async (req: Request, res: Response) => {
    const { paymentMethods } = req.body; // Array of payment method objects

    if (!Array.isArray(paymentMethods)) {
      return res.status(400).json({
        success: false,
        message: "Payment methods array is required",
      });
    }

    // Update or create each payment method
    const updatePromises = paymentMethods.map((pm: any) =>
      PaymentMethod.findOneAndUpdate({ name: pm.name }, pm, {
        upsert: true,
        new: true,
        runValidators: true,
      })
    );

    await Promise.all(updatePromises);

    const updatedMethods = await PaymentMethod.find().sort({ order: 1 });

    return res.status(200).json({
      success: true,
      message: "Payment methods updated successfully",
      data: updatedMethods,
    });
  }
);

/**
 * Get SMS gateway settings
 */
export const getSMSGatewaySettings = asyncHandler(
  async (_req: Request, res: Response) => {
    const settings = await AppSettings.findOne().select("smsGateway");

    return res.status(200).json({
      success: true,
      message: "SMS gateway settings fetched successfully",
      data: settings?.smsGateway || null,
    });
  }
);

/**
 * Update SMS gateway settings
 */
export const updateSMSGatewaySettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { smsGateway } = req.body;

    let settings = await AppSettings.findOne();

    if (!settings) {
      settings = await AppSettings.create({
        appName: "Dhakad Snazzy",
        contactEmail: "contact@dhakadsnazzy.com",
        contactPhone: "1234567890",
        smsGateway,
      });
    } else {
      settings.smsGateway = smsGateway;
      settings.updatedBy = req.user?.userId as any;
      await settings.save();
    }

    return res.status(200).json({
      success: true,
      message: "SMS gateway settings updated successfully",
      data: settings.smsGateway,
    });
  }
);
