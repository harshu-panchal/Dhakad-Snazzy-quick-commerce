import { useMemo, useState } from "react";
import type { City } from "../../../services/api/admin/adminCityService";
import type { CityScope as StoredScope } from "../../../services/api/admin/adminSystemUserService";

/**
 * Chooses which towns an admin may see.
 *
 * "All towns" or "Only selected towns"; with the second and nothing ticked the
 * admin sees no town-specific data, which is the safe default for a new
 * account. A town's district is a grouping label, so each district gets a
 * "select all" shortcut for giving someone a whole area at once.
 *
 * `grantable` is what the person filling in the form may hand out. The server
 * enforces the same rule; here it only greys out what would be refused.
 */

interface TownScopePickerProps {
  value: StoredScope;
  onChange: (next: StoredScope) => void;
  towns: City[];
  disabled?: boolean;
  /** Super Admin is never limited, so the choice does not apply. */
  roleIsSuperAdmin?: boolean;
  /** What the person using this form may grant. */
  grantable: { all: boolean; cityIds: string[] };
}

export default function TownScopePicker({
  value,
  onChange,
  towns,
  disabled = false,
  roleIsSuperAdmin = false,
  grantable,
}: TownScopePickerProps) {
  const [search, setSearch] = useState("");

  // Group by state AND district (two districts can share a name across states),
  // narrowed by the search. A town that is inactive is kept only if already chosen,
  // so an existing grant is never silently hidden.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byKey = new Map<string, { state: string; district: string; towns: City[] }>();

    for (const town of towns) {
      if (!town.isActive && !value.cityIds.includes(town._id)) continue;
      if (q && ![town.name, town.district, town.state].some((v) => (v || "").toLowerCase().includes(q))) continue;

      const state = town.state?.trim() || "";
      const district = town.district?.trim() || "Other";
      const key = `${state}|${district}`;
      const group = byKey.get(key) ?? { state, district, towns: [] };
      group.towns.push(town);
      byKey.set(key, group);
    }

    return [...byKey.entries()]
      .map(([key, g]) => ({
        key,
        district: g.district,
        label: g.state ? `${g.district} · ${g.state}` : g.district,
        state: g.state,
        towns: [...g.towns].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.state.localeCompare(b.state) || a.district.localeCompare(b.district));
  }, [towns, value.cityIds, search]);

  const canGrant = (id: string) => grantable.all || grantable.cityIds.includes(id);

  const setMode = (mode: "all" | "selected") =>
    onChange({ mode, cityIds: mode === "all" ? [] : value.cityIds });

  const toggleTown = (id: string) => {
    const next = value.cityIds.includes(id)
      ? value.cityIds.filter((x) => x !== id)
      : [...value.cityIds, id];
    onChange({ mode: "selected", cityIds: next });
  };

  const toggleDistrict = (list: City[]) => {
    const ids = list.map((t) => t._id).filter(canGrant);
    const allOn = ids.every((id) => value.cityIds.includes(id));
    const next = allOn
      ? value.cityIds.filter((id) => !ids.includes(id))
      : [...new Set([...value.cityIds, ...ids])];
    onChange({ mode: "selected", cityIds: next });
  };

  if (roleIsSuperAdmin) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
        <span className="font-medium text-neutral-700">Towns:</span> Super Admin can see every
        town, so this does not apply.
      </div>
    );
  }

  const none = value.mode === "selected" && value.cityIds.length === 0;

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-1 block text-sm font-medium text-neutral-700">Towns</legend>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label
          className={`flex items-center gap-2 text-sm ${
            grantable.all ? "cursor-pointer text-neutral-700" : "cursor-not-allowed text-neutral-400"
          }`}>
          <input
            type="radio"
            name="town-scope-mode"
            checked={value.mode === "all"}
            disabled={!grantable.all}
            onChange={() => setMode("all")}
            className="h-4 w-4 border-neutral-300 text-teal-600 focus:ring-teal-500"
          />
          All towns
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input
            type="radio"
            name="town-scope-mode"
            checked={value.mode === "selected"}
            onChange={() => setMode("selected")}
            className="h-4 w-4 border-neutral-300 text-teal-600 focus:ring-teal-500"
          />
          Only selected towns
        </label>
      </div>

      {value.mode === "selected" ? (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search towns, districts or states"
              aria-label="Search towns"
              className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            <span className="text-xs text-neutral-500">{value.cityIds.length} selected</span>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {search.trim() ? "No towns match your search." : "No towns have been added yet."}
            </p>
          ) : null}

          {groups.map((group) => {
            const grantableIds = group.towns.map((t) => t._id).filter(canGrant);
            const allOn =
              grantableIds.length > 0 && grantableIds.every((id) => value.cityIds.includes(id));

            return (
              <div key={group.key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {group.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDistrict(group.towns)}
                    disabled={grantableIds.length === 0}
                    className="text-xs font-medium text-teal-700 hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline">
                    {allOn ? `Clear ${group.district}` : `Select all in ${group.district}`}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {group.towns.map((town) => {
                    const allowed = canGrant(town._id);
                    return (
                      <label
                        key={town._id}
                        className={`flex items-center gap-2 text-sm ${
                          allowed ? "cursor-pointer text-neutral-700" : "cursor-not-allowed text-neutral-400"
                        }`}
                        title={allowed ? undefined : "You can only grant towns you can access yourself"}>
                        <input
                          type="checkbox"
                          checked={value.cityIds.includes(town._id)}
                          disabled={!allowed}
                          onChange={() => toggleTown(town._id)}
                          className="h-4 w-4 rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="truncate">
                          {town.name}
                          {!town.isActive ? " (inactive)" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {none ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No towns selected: this admin will see no town-specific data.
        </p>
      ) : null}
    </fieldset>
  );
}
