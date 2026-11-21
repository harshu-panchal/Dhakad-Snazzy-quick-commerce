import { useEffect, useState } from "react";
import { usePermissions } from "../../../hooks/usePermissions";
import { getCities, type City } from "../../../services/api/admin/adminCityService";

/**
 * Tells an admin who is limited to some towns what they are looking at.
 *
 * - Limited to towns:  "Showing data for: Biaora, Khujner".
 * - Limited to none:   a warning, because every list will be empty and that is
 *                      otherwise indistinguishable from "nothing has happened".
 * - Super Admin, or an admin with every town: nothing. No limit, nothing to say.
 */
export default function TownScopeNotice() {
  const { cityScope, isSuperAdmin, permissions, permissionsLoading } = usePermissions();
  const [towns, setTowns] = useState<City[]>([]);

  // Until permissions are known the scope is the fail-closed default (no towns),
  // so showing anything now would flash a wrong "no towns" warning at an admin
  // who has them.
  const limited =
    !isSuperAdmin && !cityScope.all && permissions.length > 0 && !permissionsLoading;
  const hasTowns = cityScope.cityIds.length > 0;

  useEffect(() => {
    if (!limited || !hasTowns) return;
    // The town list is open to every admin.
    getCities(true)
      .then((res) => setTowns(res.data || []))
      .catch(() => {
        // Without names the notice falls back to a count; it must not block the page.
      });
  }, [limited, hasTowns]);

  if (!limited) return null;

  if (!hasTowns) {
    return (
      <div
        role="status"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <strong className="font-semibold">No towns are assigned to your account.</strong> You will not
        see any orders, sellers, products or customers until a Super Admin gives you towns.
      </div>
    );
  }

  const names = cityScope.cityIds
    .map((id) => towns.find((t) => t._id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div
      role="status"
      className="border-b border-teal-100 bg-teal-50 px-4 py-2 text-xs text-teal-900 sm:text-sm">
      <span className="font-medium">Showing data for:</span>{" "}
      {names.length > 0
        ? names.join(", ")
        : `${cityScope.cityIds.length} town${cityScope.cityIds.length === 1 ? "" : "s"}`}
    </div>
  );
}
