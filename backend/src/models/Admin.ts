import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

/**
 * Minimum password policy for admin accounts: 8+ characters with at least one
 * uppercase letter, one lowercase letter and one digit.
 *
 * Applied on write only, so existing stored hashes are unaffected. Anything
 * weaker is rejected the next time a password is set.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function describePasswordPolicy(): string {
  return `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a lowercase letter and a number`;
}

export function validatePasswordStrength(value: string): string | null {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN_LENGTH) {
    return describePasswordPolicy();
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return describePasswordPolicy();
  }
  return null;
}

export interface IAdmin extends Document {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  /**
   * Role name. Matches Role.name — not an ObjectId ref. Renames of a role
   * cascade to this field (see adminRoleController.updateRole).
   */
  role: string;
  password: string;
  /** false blocks login and invalidates existing access tokens. */
  isActive: boolean;
  /** Bump to invalidate every issued access token for this admin. */
  tokenVersion: number;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  /** sha256 of the emailed reset token. Never the token itself. */
  resetPasswordTokenHash?: string;
  resetPasswordExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // FCM Push Notification Tokens
  fcmTokens?: string[];        // Web push notification tokens
  fcmTokenMobile?: string[];   // Mobile push notification tokens
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const AdminSchema = new Schema<IAdmin>(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          return /^[0-9]{10}$/.test(v);
        },
        message: 'Mobile number must be 10 digits',
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Please enter a valid email address',
      },
    },
    role: {
      // Free-form string validated against the Role collection in the pre-save
      // hook below. The old ['Super Admin','Admin'] enum is gone so custom
      // roles can be assigned.
      type: String,
      required: [true, 'Role is required'],
      trim: true,
      default: 'Admin',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // Don't return password by default
      validate: {
        // Runs on the plaintext value before the pre-save hook hashes it. A
        // bcrypt hash is 60 chars and would pass length but fail the character
        // classes, so skip values that are already hashed.
        validator: function (this: IAdmin, v: string) {
          if (!this.isModified('password')) return true;
          return validatePasswordStrength(v) === null;
        },
        message: describePasswordPolicy(),
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpiresAt: { type: Date, select: false },
    // FCM Push Notification Tokens
    fcmTokens: {
      type: [String],
      default: []
    },
    fcmTokenMobile: {
      type: [String],
      default: []
    },
  },
  {
    timestamps: true,
  }
);

// Reject a role that has no matching Role document. Without the old enum,
// a typo would otherwise create an admin that resolves to zero permissions
// and is locked out of every page.
AdminSchema.pre('save', async function (next) {
  if (!this.isModified('role')) {
    return next();
  }

  try {
    const Role = mongoose.model('Role');
    const exists = await Role.exists({ name: this.role });
    if (!exists) {
      return next(
        new Error(
          `Role "${this.role}" does not exist. Create the role first, or pick an existing one.`
        )
      );
    }
    next();
  } catch (error: any) {
    next(error);
  }
});

// Hash password before saving
AdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare password
AdminSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const Admin = (mongoose.models.Admin as mongoose.Model<IAdmin>) || mongoose.model<IAdmin>('Admin', AdminSchema);

export default Admin;
