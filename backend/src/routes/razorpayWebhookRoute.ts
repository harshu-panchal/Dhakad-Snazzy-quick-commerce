import { Request, Response } from "express";
import { acceptRazorpayWebhook, processRazorpayWebhookInbox } from "../services/paymentService";

export const razorpayWebhookHandler = async (req: Request, res: Response) => {
  try {
    const signature = String(req.headers["x-razorpay-signature"] || "");
    const eventId = String(req.headers["x-razorpay-event-id"] || "");
    if (!signature || !eventId || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Raw body, x-razorpay-signature and x-razorpay-event-id are required",
      });
    }
    const result = await acceptRazorpayWebhook({ rawBody: req.body, signature, eventId });
    setImmediate(() => {
      void processRazorpayWebhookInbox(req.app.get("io")).catch((error) =>
        console.error("Razorpay webhook inbox worker failed:", error),
      );
    });
    return res.status(result.duplicate ? 200 : 202).json({ success: true, ...result });
  } catch (error: any) {
    const message = error?.message || "Razorpay webhook intake failed";
    const status = /signature|header|JSON|secret/i.test(message) ? 400 : 503;
    console.error("Razorpay webhook intake failed:", message);
    return res.status(status).json({ success: false, message });
  }
};
