import Admin from "../models/Admin";
import Role from "../models/Role";
import { invalidateRoleCache } from "../services/adminPermissionService";
import {
  ALL_PERMISSIONS,
  ELEVATED_PAGES,
  SUPER_ADMIN_ROLE,
  DEFAULT_ADMIN_ROLE,
  WILDCARD,
  TIERS,
  perm,
  groupPages,
} from "../config/permissions";

/**
 * Seeds the role collection. Idempotent and safe to re-run; called from
 * server.ts on startup BEFORE ensureDefaultAdmin, because Admin.role is now
 * validated against this collection.
 *
 * Existing admin accounts need no data migration: Admin.role stays a name
 * string and the values already in the database ("Super Admin", "Admin") are
 * exactly the two system roles seeded here.
 */

const permsFor = (pageKeys: readonly string[], tiers: readonly ("view" | "manage")[] = TIERS) =>
  pageKeys.flatMap((key) => tiers.map((tier) => perm(key, tier))).sort();

/** Everything except the two self-escalation pages. */
const defaultAdminPermissions = ALL_PERMISSIONS.filter(
  (p) => !ELEVATED_PAGES.some((page) => p.startsWith(`${page}:`)),
).sort();

interface RoleSeed {
  name: string;
  type: "System" | "Custom";
  description: string;
  permissions: string[];
}

const systemRoles: RoleSeed[] = [
  {
    name: SUPER_ADMIN_ROLE,
    type: "System",
    description:
      "Full, unrestricted access. Signs in with mobile OTP only. Cannot be edited or deleted.",
    permissions: [WILDCARD],
  },
  {
    name: DEFAULT_ADMIN_ROLE,
    type: "System",
    description:
      "Every page except Manage Roles and System User. These two are withheld because each is equivalent to near-total access; grant them through a custom role if an account genuinely needs them.",
    permissions: defaultAdminPermissions,
  },
];

/**
 * Starting points, created as Custom so they are freely editable and
 * deletable. Adjust to match how your team is actually organised.
 */
const presetRoles: RoleSeed[] = [
  {
    name: "Order Manager",
    type: "Custom",
    description: "Works the order queue end to end, including returns and settlement.",
    permissions: [
      ...permsFor(groupPages("orders")),
      ...permsFor(groupPages("delivery")),
      ...permsFor(["customers.list"], ["view"]),
      ...permsFor(["dashboard"], ["view"]),
    ],
  },
  {
    name: "Catalog Manager",
    type: "Custom",
    description: "Maintains categories, brands, products and taxes.",
    permissions: [
      ...permsFor(groupPages("catalog")),
      ...permsFor(["sellers.list"], ["view"]),
      ...permsFor(["dashboard"], ["view"]),
    ],
  },
  {
    name: "Finance Manager",
    type: "Custom",
    description: "Wallet, withdrawals, payments and seller settlement.",
    permissions: [
      ...permsFor(groupPages("finance")),
      ...permsFor(["orders.settlement", "sellers.transaction"]),
      ...permsFor(["orders.all", "orders.detail"], ["view"]),
      ...permsFor(["dashboard"], ["view"]),
    ],
  },
  {
    name: "Content Manager",
    type: "Custom",
    description: "Promotions, banners, home sections, reels and policy pages.",
    permissions: [
      ...permsFor(groupPages("marketing")),
      ...permsFor(groupPages("content")),
      ...permsFor(["dashboard"], ["view"]),
    ],
  },
  {
    name: "Support (read-only)",
    type: "Custom",
    description:
      "Can read orders, customers and sellers to answer queries, but cannot change anything. Only possible because view and manage are separate tiers.",
    permissions: [
      ...permsFor(groupPages("orders"), ["view"]),
      ...permsFor(groupPages("customers"), ["view"]),
      ...permsFor(["sellers.list", "delivery.tracking", "dashboard"], ["view"]),
    ],
  },
];

async function upsertRole(seed: RoleSeed): Promise<"created" | "updated" | "unchanged"> {
  const existing = await Role.findOne({ name: seed.name });

  if (!existing) {
    await Role.create({
      name: seed.name,
      type: seed.type,
      description: seed.description,
      permissions: [...new Set(seed.permissions)].sort(),
      isActive: true,
      permissionsUpdatedAt: new Date(),
    });
    return "created";
  }

  // Custom presets are only ever created, never overwritten — they exist to be
  // edited, and re-running the seed must not discard those edits.
  if (seed.type === "Custom") {
    return "unchanged";
  }

  // System roles are kept in step with the code, so a newly added page is
  // picked up by the "Admin" role on the next deploy rather than silently
  // staying ungranted.
  const next = [...new Set(seed.permissions)].sort();
  const current = [...(existing.permissions || [])].sort();
  const same =
    next.length === current.length && next.every((p, i) => p === current[i]);

  if (same && existing.type === seed.type) {
    return "unchanged";
  }

  existing.permissions = next;
  existing.type = seed.type;
  existing.description = seed.description;
  existing.permissionsUpdatedAt = new Date();
  await existing.save();
  return "updated";
}

/**
 * Any Admin.role value with no matching Role document would resolve to zero
 * permissions and lock that account out of every page. Create a placeholder
 * Custom role instead and warn, so the account is recoverable from the UI.
 */
async function reconcileOrphanRoles(): Promise<string[]> {
  const used: string[] = await Admin.distinct("role");
  const known = new Set((await Role.find().select("name").lean()).map((r) => r.name));
  const orphans = used.filter((name) => name && !known.has(name));

  for (const name of orphans) {
    await Role.create({
      name,
      type: "Custom",
      description:
        "Created automatically during RBAC seeding because admin accounts referenced this role name but no role existed. Review its permissions.",
      permissions: [],
      isActive: true,
    });
  }

  return orphans;
}

export async function seedRbac(): Promise<void> {
  const results: Record<string, string> = {};

  for (const seed of [...systemRoles, ...presetRoles]) {
    results[seed.name] = await upsertRole(seed);
  }

  const orphans = await reconcileOrphanRoles();

  invalidateRoleCache();

  const created = Object.entries(results).filter(([, v]) => v === "created").map(([k]) => k);
  const updated = Object.entries(results).filter(([, v]) => v === "updated").map(([k]) => k);

  console.log(
    `RBAC seed complete. ${ALL_PERMISSIONS.length} permissions across ${
      ALL_PERMISSIONS.length / 2
    } pages.`,
  );
  if (created.length) console.log(`  roles created: ${created.join(", ")}`);
  if (updated.length) console.log(`  roles updated: ${updated.join(", ")}`);
  if (orphans.length) {
    console.warn(
      `  WARNING: admin accounts referenced ${orphans.length} unknown role(s): ${orphans.join(
        ", ",
      )}. Placeholder roles with no permissions were created - review them in Manage Roles.`,
    );
  }
}

export default seedRbac;
