import mongoose, { Schema, model, Document, Types } from "mongoose";

/**
 * One record per mutating admin request, plus login successes and failures.
 *
 * Written by middleware/auditLog.ts. Actor identity is denormalised so the log
 * stays readable after an admin account is deleted.
 *
 * Retention: unbounded by default. Set AUDIT_LOG_RETENTION_DAYS to a positive
 * number to have Mongo expire records via the TTL index on `expiresAt`.
 * Records written while that variable is unset have no expiresAt and are kept
 * forever, so turning retention on later only affects new records.
 */
export interface IAuditLog extends Document {
  adminId?: Types.ObjectId;
  adminEmail: string;
  adminRole: string;
  /** "request" for an admin API call, "auth" for login/logout events. */
  kind: "request" | "auth";
  method: string;
  /** Concrete request path, e.g. "/admin/orders/68f2.../status". */
  path: string;
  /** Express route pattern, e.g. "/orders/:id/status". Groups identical actions. */
  routePattern?: string;
  /** Permission key that authorised the call, when one applied. */
  pageKey?: string;
  /** req.params.id when present, for filtering by affected record. */
  resourceId?: string;
  statusCode: number;
  /** Short machine-readable outcome for auth events, e.g. "login.success". */
  event?: string;
  /** Redacted, size-capped request body. */
  requestBody?: unknown;
  ip?: string;
  userAgent?: string;
  expiresAt?: Date;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "Admin", index: true },
    adminEmail: { type: String, default: "" },
    adminRole: { type: String, default: "" },
    kind: { type: String, enum: ["request", "auth"], default: "request", index: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    routePattern: { type: String },
    pageKey: { type: String },
    resourceId: { type: String },
    statusCode: { type: Number, required: true },
    event: { type: String },
    requestBody: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date },
  },
  {
    // Only createdAt is meaningful; an audit record is never updated.
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ routePattern: 1, createdAt: -1 });
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuditLog =
  (mongoose.models.AuditLog as mongoose.Model<IAuditLog>) ||
  model<IAuditLog>("AuditLog", auditLogSchema);

export default AuditLog;
