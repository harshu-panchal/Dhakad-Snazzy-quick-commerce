import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import AuditLog from "../models/AuditLog";

/**
 * Audit logging for the admin API.
 *
 * Captures every mutating request automatically - no per-route wiring - plus
 * login successes and failures via recordAuthEvent.
 *
 * Two rules this must never break:
 *   1. A failed audit write must never fail the request it is describing.
 *   2. Secrets must never reach the log. See REDACT_KEYS.
 */

const RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS || 0);

/** Max serialised size of a captured body, in bytes. */
const MAX_BODY_BYTES = Number(process.env.AUDIT_LOG_MAX_BODY_BYTES || 8192);

/**
 * Field names whose values are replaced with "[redacted]", matched
 * case-insensitively anywhere in the key. Covers credentials the admin API
 * legitimately receives (SMS gateway, payment gateways, admin passwords).
 */
const REDACT_KEYS = [
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "refreshtoken",
  "accesstoken",
  "otp",
  "apikey",
  "secret",
  "secretkey",
  "keysecret",
  "keyid",
  "clientsecret",
  "authorization",
  "cookie",
  "pass",
  "pin",
];

const shouldRedact = (key: string): boolean => {
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  return REDACT_KEYS.some((needle) => k.includes(needle));
};

/** Deep-clone with secrets replaced. Depth-capped to avoid pathological input. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    // Long arrays (bulk imports) are summarised rather than stored whole.
    if (value.length > 25) {
      return [...value.slice(0, 25).map((v) => redact(v, depth + 1)), `[+${value.length - 25} more]`];
    }
    return value.map((v) => redact(v, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = shouldRedact(key) ? "[redacted]" : redact(val, depth + 1);
    }
    return out;
  }

  return value;
}

function capBody(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "object" && Object.keys(body as object).length === 0) return undefined;

  const redacted = redact(body);

  try {
    const serialised = JSON.stringify(redacted);
    if (serialised && serialised.length > MAX_BODY_BYTES) {
      return {
        _truncated: true,
        _originalBytes: serialised.length,
        _preview: serialised.slice(0, MAX_BODY_BYTES),
      };
    }
  } catch {
    return "[unserialisable]";
  }

  return redacted;
}

function expiresAt(): Date | undefined {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) return undefined;
  return new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip;
}

/** Fire-and-forget write. Logs and swallows its own failures. */
async function write(doc: Record<string, unknown>): Promise<void> {
  try {
    await AuditLog.create({ ...doc, expiresAt: expiresAt() });
  } catch (error: any) {
    console.error(`[audit] failed to write audit record: ${error?.message}`);
  }
}

/**
 * Admin request auditing. Mount once on the admin router, after
 * `authenticate` so req.adminContext is populated.
 *
 * Only mutating methods are recorded. GETs are excluded deliberately: they
 * would multiply log volume by an order of magnitude for little forensic
 * value, since they change nothing.
 */
export const auditAdminRequests = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  // Snapshot the body now: handlers are free to mutate req.body.
  const body = capBody(req.body);

  res.on("finish", () => {
    const ctx = req.adminContext;

    void write({
      kind: "request",
      adminId: ctx?.adminId ? new Types.ObjectId(ctx.adminId) : undefined,
      adminEmail: ctx?.email ?? "",
      adminRole: ctx?.roleName ?? "",
      method: req.method,
      path: req.originalUrl.split("?")[0],
      routePattern: req.route?.path,
      pageKey: req.grantedPageKey,
      resourceId: typeof req.params?.id === "string" ? req.params.id : undefined,
      statusCode: res.statusCode,
      // Recorded so an entry shows which towns the admin could see at the time,
      // which stays true even after their scope is later changed.
      adminScope: ctx?.scope ? { all: ctx.scope.all, cityIds: ctx.scope.cityIds } : undefined,
      requestBody: body,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"],
    });
  });

  next();
};

export interface AuthEventArgs {
  event: string;
  statusCode: number;
  adminId?: Types.ObjectId | string;
  adminEmail?: string;
  adminRole?: string;
}

/**
 * Records an authentication event. Called from adminAuthController, which runs
 * outside the admin router and so is not covered by auditAdminRequests.
 *
 * Never awaited by callers - a logging failure must not break a login.
 */
export async function recordAuthEvent(req: Request, args: AuthEventArgs): Promise<void> {
  await write({
    kind: "auth",
    adminId:
      args.adminId && Types.ObjectId.isValid(String(args.adminId))
        ? new Types.ObjectId(String(args.adminId))
        : undefined,
    adminEmail: args.adminEmail ?? "",
    adminRole: args.adminRole ?? "",
    event: args.event,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    statusCode: args.statusCode,
    ip: clientIp(req),
    userAgent: req.headers["user-agent"],
  });
}
