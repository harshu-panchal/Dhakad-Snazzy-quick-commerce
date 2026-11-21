import Admin, { validatePasswordStrength } from '../models/Admin';
import { SUPER_ADMIN_ROLE } from '../config/permissions';

const DEFAULT_ADMIN_MOBILE = process.env.DEFAULT_ADMIN_MOBILE || '9876543210';
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@dhakadsnazzy.com';
/**
 * Must satisfy the admin password policy (8+ chars, upper + lower + digit) or
 * the Admin model rejects it. The old default was "Admin@123", which still
 * passes; set DEFAULT_ADMIN_PASSWORD in production regardless.
 */
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
const DEFAULT_ADMIN_FIRST = process.env.DEFAULT_ADMIN_FIRST || 'Default';
const DEFAULT_ADMIN_LAST = process.env.DEFAULT_ADMIN_LAST || 'Admin';
const DEFAULT_ADMIN_ROLE = process.env.DEFAULT_ADMIN_ROLE || SUPER_ADMIN_ROLE;

/**
 * Ensure a default admin exists so the panel is reachable on a fresh install.
 *
 * Runs AFTER seedRbac, because Admin.role is validated against the Role
 * collection.
 *
 * The default admin is a Super Admin, which signs in with mobile OTP - not
 * with the password stored here.
 */
export async function ensureDefaultAdmin() {
  const existing = await Admin.findOne({
    $or: [{ mobile: DEFAULT_ADMIN_MOBILE }, { email: DEFAULT_ADMIN_EMAIL }],
  });

  if (existing) {
    console.log(`Default admin already exists (mobile: ${existing.mobile})`);
    return existing;
  }

  const policyError = validatePasswordStrength(DEFAULT_ADMIN_PASSWORD);
  if (policyError) {
    console.error(
      `Cannot create the default admin: DEFAULT_ADMIN_PASSWORD does not meet the password policy. ${policyError}`,
    );
    return null;
  }

  try {
    const admin = await Admin.create({
      firstName: DEFAULT_ADMIN_FIRST,
      lastName: DEFAULT_ADMIN_LAST,
      mobile: DEFAULT_ADMIN_MOBILE,
      email: DEFAULT_ADMIN_EMAIL,
      role: DEFAULT_ADMIN_ROLE,
      password: DEFAULT_ADMIN_PASSWORD,
    });

    console.log(`Default admin created (mobile: ${admin.mobile}, role: ${admin.role})`);
    return admin;
  } catch (error: any) {
    // Most likely cause: DEFAULT_ADMIN_ROLE names a role that does not exist.
    console.error(`Failed to create the default admin: ${error?.message}`);
    return null;
  }
}

export default ensureDefaultAdmin;
