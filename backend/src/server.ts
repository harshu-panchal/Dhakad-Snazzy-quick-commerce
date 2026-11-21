import express, { Application, Request, Response } from "express";
import { createServer } from "http";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import connectDB from "./config/db";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { ensureDefaultAdmin } from "./utils/ensureDefaultAdmin";
import { seedHeaderCategories } from "./utils/seedHeaderCategories";
import { initializeSocket } from "./socket/socketService";
import { initializeFirebaseAdmin } from "./services/firebaseAdmin";
import { isShiprocketConfigured, syncPendingSellerPickups } from "./services/shiprocketService";
import { syncActiveShiprocketTracking } from "./services/shippingService";
import { runProductReminderWorker } from "./services/productReminderService";
import { runRazorpayPaymentWorkers } from "./services/paymentService";
import { razorpayWebhookHandler } from "./routes/razorpayWebhookRoute";
import { seedProductReminderTemplates } from "./utils/seedProductReminderTemplates";
import cookieParser from "cookie-parser";
import { seedRbac } from "./scripts/seedRbac";
import { seedCities } from "./scripts/seedCities";
import { verifyEmailTransport } from "./services/emailService";


// Load environment variables
// Server reloaded: Cashfree HTTPS return_url updated
dotenv.config();

const app: Application = express();
const httpServer = createServer(app);

// Simple CORS configuration - Standard and reliable
const allowedOrigins = [
  "https://www.dhakadsnazzy.com",
  "https://dhakadsnazzy.com",
  // Add more origins from environment variable if needed
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",").map(url => url.trim()) : [])
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow localhost
    if (process.env.NODE_ENV !== "production") {
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return callback(null, true);
      }
    }

    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Check if origin is in allowed list (exact match or normalized)
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return origin === allowed || normalizedOrigin === normalizedAllowed || origin === normalizedAllowed || normalizedOrigin === allowed;
    });

    if (isAllowed) {
      return callback(null, true);
    }

    // Reject if not allowed - return false instead of error for better handling
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "x-api-key"],
  exposedHeaders: ["Content-Length", "Content-Type"],
  maxAge: 86400,
};

// Apply compression middleware - Reduces payload size effectively.
// Skip it entirely for /uploads: those are already-compressed binary assets
// (images/videos), so gzip wastes CPU for no benefit, and running a large
// video response through compression can interfere with byte-range (seek)
// support that video playback depends on. express.static's own Range
// handling is left completely untouched for that path.
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith("/uploads")) return false;
      return compression.filter(req, res);
    },
  })
);

// Apply CORS middleware - This handles everything including preflight
app.use(cors(corsOptions));

import path from "path";

// Razorpay signs the exact request bytes. This route must be registered before
// express.json() so webhook authentication never depends on re-serialized JSON.
app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  razorpayWebhookHandler,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin refresh tokens travel in an httpOnly cookie.
app.use(cookieParser());

// Behind the production reverse proxy, req.ip must reflect the real client
// or every rate limiter keys to the proxy and becomes global instead of
// per-client. Adjust the hop count if more than one proxy is in front.
if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
}

// Serve local uploaded files statically.
// Every upload (images, videos, reels) gets a unique timestamp+random
// filename and is never overwritten (see localStorageService), so it's safe
// to cache these responses aggressively and "immutable" — the browser/any CDN
// or reverse proxy in front of this server will stop re-requesting bytes it
// already has, which matters a lot for large reel videos. express.static's
// built-in byte-range (seek) support is unaffected by these headers.
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "365d",
    immutable: true,
    etag: true,
    lastModified: true,
  })
);

// Initialize Socket.io
const io = initializeSocket(httpServer);
app.set("io", io);

// Routes
app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "dhakadsnazzy API Server is running!",
    version: "1.0.0",
    socketIO: "Listening for WebSocket connections",
  });
});

// Keep verbose home diagnostics out of production's hot path. They can still
// be enabled deliberately while investigating a deployment.
if (process.env.LOG_HOME_REQUESTS === "true") {
  app.use((req, _res, next) => {
    if (req.path.includes("/customer/home")) {
      console.log(`[REQUEST] ${req.method} ${req.originalUrl} - query:`, req.query);
    }
    next();
  });
}

// API Routes
app.use("/api/v1", routes);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  // Connect DB then ensure default admin exists
  await connectDB();
  // seedRbac must run BEFORE ensureDefaultAdmin: Admin.role is now validated
  // against the Role collection, so the roles have to exist first.
  await seedRbac();
  await seedCities();
  await ensureDefaultAdmin();
  await seedHeaderCategories();
  await seedProductReminderTemplates();

  // Surfaces SMTP misconfiguration at deploy time rather than when an admin
  // first needs a password reset. Never blocks startup.
  void verifyEmailTransport();

  // Initialize Firebase Admin SDK for push notifications
  initializeFirebaseAdmin();

  // Durable webhook inbox, payment reconciliation and notification outbox.
  // Work is bounded and overlap-protected inside the service for a single instance.
  if (process.env.RAZORPAY_PAYMENT_WORKER_ENABLED !== "false") {
    const runPaymentWorkers = () => runRazorpayPaymentWorkers(io).catch((error) =>
      console.error("Razorpay payment worker failed:", error),
    );
    void runPaymentWorkers();
    const paymentWorkerTimer = setInterval(
      runPaymentWorkers,
      Number(process.env.RAZORPAY_PAYMENT_WORKER_INTERVAL_MS) || 5 * 60 * 1000,
    );
    paymentWorkerTimer.unref();
  }

  // Persistent reminder state lives in MongoDB; this small polling worker is
  // restart-safe and only claims pending recipients/campaigns.
  if (process.env.PRODUCT_REMINDER_WORKER_ENABLED !== "false") {
    const runReminderWorker = () => runProductReminderWorker().catch((error) =>
      console.error("Product reminder worker failed:", error),
    );
    void runReminderWorker();
    const reminderTimer = setInterval(
      runReminderWorker,
      Number(process.env.PRODUCT_REMINDER_WORKER_INTERVAL_MS) || 5 * 60 * 1000,
    );
    reminderTimer.unref();
  }

  // Retry pickup-location synchronization without blocking seller registration/profile updates.
  if (isShiprocketConfigured()) {
    const runPickupSync = () =>
      syncPendingSellerPickups(Number(process.env.SHIPROCKET_PICKUP_SYNC_BATCH_SIZE) || 25).catch((error) =>
        console.error("Shiprocket pickup sync worker failed:", error),
      );
    void runPickupSync();
    const timer = setInterval(
      runPickupSync,
      Number(process.env.SHIPROCKET_PICKUP_SYNC_INTERVAL_MS) || 5 * 60 * 1000,
    );
    timer.unref();

    const runTrackingSync = () =>
      syncActiveShiprocketTracking(
        Number(process.env.SHIPROCKET_TRACKING_SYNC_BATCH_SIZE) || 50,
        io,
      ).catch((error) => console.error("Shiprocket tracking sync worker failed:", error));
    void runTrackingSync();
    const trackingTimer = setInterval(
      runTrackingSync,
      Number(process.env.SHIPROCKET_TRACKING_SYNC_INTERVAL_MS) || 15 * 60 * 1000,
    );
    trackingTimer.unref();
  }

  // Handle server errors gracefully (e.g., port already in use)
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n\x1b[31m✗ Port ${PORT} is already in use!\x1b[0m`);
      console.error(`\x1b[33m  → Another instance of the server may be running.\x1b[0m`);
      console.error(`\x1b[33m  → Run: taskkill /f /im node.exe (Windows) or killall node (Mac/Linux)\x1b[0m`);
      console.error(`\x1b[33m  → Or change PORT in .env file\x1b[0m\n`);
      process.exit(1);
    } else {
      console.error('\n\x1b[31m✗ Server error:\x1b[0m', error);
      process.exit(1);
    }
  });

  httpServer.listen(PORT, () => {
    console.log("\n\x1b[32m✓\x1b[0m \x1b[1mdhakadsnazzy Server Started\x1b[0m");
    console.log(`   \x1b[36mPort:\x1b[0m http://localhost:${PORT}`);
    console.log(
      `   \x1b[36mEnvironment:\x1b[0m ${process.env.NODE_ENV || "development"}`
    );
    console.log(`   \x1b[36mSocket.IO:\x1b[0m ✓ Ready for connections\n`);
  });
}

// Reload trigger for lowest-prices-sections
startServer().catch((err) => {
  console.error("\n\x1b[31m✗ Failed to start server\x1b[0m");
  console.error(err);
  process.exit(1);
});


