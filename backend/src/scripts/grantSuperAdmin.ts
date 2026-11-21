/**
 * Break-glass: promote an admin account to Super Admin from the server.
 *
 * Super Admin signs in with mobile OTP only, so if the SMS gateway is down
 * there is otherwise no way into a Super Admin account. This script is the
 * recovery path. Server access is already the trust boundary, so it adds no
 * new exposure.
 *
 * Usage:
 *   npm run admin:grant-super -- someone@example.com
 *   npm run admin:grant-super -- someone@example.com --mobile 9876543210
 *
 * The optional --mobile sets the number OTPs will be sent to, which matters
 * when the stored mobile is no longer reachable.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db";
import Admin from "../models/Admin";
import Role from "../models/Role";
import AdminSession from "../models/AdminSession";
import { seedRbac } from "./seedRbac";
import { SUPER_ADMIN_ROLE } from "../config/permissions";

dotenv.config();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = process.argv[2];

  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run admin:grant-super -- <email> [--mobile <10 digits>]");
    process.exit(1);
  }

  const mobile = arg("--mobile");
  if (mobile && !/^[0-9]{10}$/.test(mobile)) {
    console.error("--mobile must be exactly 10 digits");
    process.exit(1);
  }

  await connectDB();

  // The Super Admin role must exist before it can be assigned.
  if (!(await Role.exists({ name: SUPER_ADMIN_ROLE }))) {
    console.log("Super Admin role missing; running the RBAC seed first.");
    await seedRbac();
  }

  const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

  if (!admin) {
    console.error(`No admin account found with email ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (mobile) {
    const clash = await Admin.findOne({ mobile, _id: { $ne: admin._id } });
    if (clash) {
      console.error(`Mobile ${mobile} is already used by ${clash.email}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    admin.mobile = mobile;
  }

  const wasRole = admin.role;
  admin.role = SUPER_ADMIN_ROLE;
  admin.isActive = true;
  // Any session issued under the old role must not keep running.
  admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;

  await admin.save({ validateModifiedOnly: true } as any);

  await AdminSession.updateMany(
    { adminId: admin._id, revokedAt: { $exists: false } },
    { revokedAt: new Date(), revokedReason: "logout-all" },
  );

  console.log(
    `Promoted ${admin.email}: "${wasRole}" -> "${SUPER_ADMIN_ROLE}". ` +
      `Sign in at /admin/login using mobile OTP on ${admin.mobile}.`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("grantSuperAdmin failed:", error?.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
