import mongoose, { Schema, model, Document } from "mongoose";
import { isValidPermission, WILDCARD, SUPER_ADMIN_ROLE } from "../config/permissions";

export interface IRole extends Document {
  name: string;
  type: "System" | "Custom";
  permissions: string[];
  description?: string;
  isActive: boolean;
  /**
   * Bumped on every permission change. Drives role cache invalidation in
   * adminPermissionService so an edit applies on the next request.
   */
  permissionsUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      trim: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["System", "Custom"],
      default: "Custom",
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function (this: IRole, values: string[]) {
          if (!Array.isArray(values)) return false;
          // The wildcard belongs to the Super Admin system role only, and is
          // settable solely by the seed script.
          if (values.includes(WILDCARD)) {
            return this.name === SUPER_ADMIN_ROLE && this.type === "System";
          }
          return values.every((v) => isValidPermission(v));
        },
        message:
          "permissions contains an entry that is not a known permission. Expected `<pageKey>:view` or `<pageKey>:manage`.",
      },
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    permissionsUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const Role =
  (mongoose.models.Role as mongoose.Model<IRole>) || model<IRole>("Role", roleSchema);

export default Role;
