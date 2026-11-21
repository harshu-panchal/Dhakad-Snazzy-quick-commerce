import { useCallback, useEffect, useState } from "react";
import {
  getCities,
  createCity,
  updateCity,
  deleteCity,
  getMappingReport,
  applySellerMapping,
  type City,
  type MappingReport,
} from "../../../services/api/admin/adminCityService";
import { usePermissions } from "../../../hooks/usePermissions";
import { getApiErrorMessage } from "../../../utils/apiError";
import { INDIAN_STATES } from "../permissions/indianStates";

/**
 * Towns.
 *
 * A town is the unit an admin can later be limited to. Each seller is mapped
 * to a town from the free-text city they entered; aliases let a spelling that
 * is not the town's own name (a Hindi spelling, a variant) map to it.
 */

interface Draft {
  id: string | null;
  name: string;
  district: string;
  state: string;
  /** One alias per line or comma separated. */
  aliases: string;
  isActive: boolean;
}

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  district: "",
  state: "",
  aliases: "",
  isActive: true,
});

const parseAliases = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((a) => a.trim())
    .filter(Boolean);

const STATUS_LABEL: Record<string, string> = {
  "no-matching-town": "No matching town",
  "no-city-text": "No city entered",
  ambiguous: "Matches two towns",
  "state-mismatch": "Different state",
  "location-outlier": "Location doesn't fit",
};

export default function AdminCities() {
  const { canManage } = usePermissions();
  const canEdit = canManage("settings.cities");

  const [towns, setTowns] = useState<City[]>([]);
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<MappingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<City | null>(null);
  const [mapping, setMapping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const townsRes = await getCities(true);
      setTowns(townsRes.data || []);

      // The mapping report needs the Towns page itself; an admin who can only
      // see the list (via the lookup) simply won't get it.
      try {
        const reportRes = await getMappingReport();
        setReport(reportRes.data);
      } catch {
        setReport(null);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to load towns. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setDraft(emptyDraft());
    setError(null);
    setNotice(null);
  };

  const openEdit = (town: City) => {
    setDraft({
      id: town._id,
      name: town.name,
      district: town.district || "",
      state: town.state || "",
      aliases: (town.aliases || []).join("\n"),
      isActive: town.isActive,
    });
    setError(null);
    setNotice(null);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Town name is required");
      return;
    }
    // A town is its name plus its state: "Aurangabad" alone could be two places.
    if (!draft.state.trim()) {
      setError("State is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        district: draft.district.trim(),
        state: draft.state.trim(),
        aliases: parseAliases(draft.aliases),
        isActive: draft.isActive,
      };

      if (draft.id) {
        await updateCity(draft.id, payload);
        setNotice(`"${payload.name}" updated.`);
      } else {
        await createCity(payload);
        setNotice(`"${payload.name}" added.`);
      }

      setDraft(null);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to save the town."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCity(deleting._id);
      setNotice(`"${deleting.name}" deleted.`);
      setDeleting(null);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to delete the town."));
    } finally {
      setSaving(false);
    }
  };

  const runMapping = async () => {
    setMapping(true);
    setError(null);
    try {
      const res = await applySellerMapping();
      setNotice(res.message);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to assign towns to sellers."));
    } finally {
      setMapping(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
          role="status"
          aria-label="Loading towns"
        />
      </div>
    );
  }

  const toMap = report?.counts.matched ?? 0;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">Towns</h1>
          <p className="mt-1 text-sm text-neutral-500">
            The places you operate in. Each seller belongs to one town, taken from
            the city they entered.
          </p>
        </div>
        {canEdit ? (
          <button
            onClick={openCreate}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700">
            Add town
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      ) : null}

      {error && !draft && !deleting ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* ------------------------------ town list ----------------------------- */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search towns, districts or states"
        aria-label="Search towns"
        className="mb-3 w-full max-w-sm rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
      />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Town</th>
                <th className="px-4 py-3 font-semibold">State</th>
                <th className="px-4 py-3 font-semibold">District</th>
                <th className="px-4 py-3 font-semibold">Also matches</th>
                <th className="px-4 py-3 font-semibold">Sellers</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {towns
                .filter((t) => {
                  const q = search.trim().toLowerCase();
                  return (
                    !q ||
                    [t.name, t.district, t.state, ...t.aliases].some((v) =>
                      (v || "").toLowerCase().includes(q),
                    )
                  );
                })
                .map((town) => (
                <tr key={town._id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-800">{town.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{town.state || "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">{town.district || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {town.aliases.length ? (
                        town.aliases.map((alias) => (
                          <span
                            key={alias}
                            className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                            {alias}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{town.sellerCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        town.isActive
                          ? "bg-green-50 text-green-700"
                          : "bg-neutral-100 text-neutral-500"
                      }`}>
                      {town.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(town)}
                          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setDeleting(town);
                            setError(null);
                          }}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {towns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                    No towns yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* --------------------------- seller mapping --------------------------- */}
      {report ? (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-800">Seller mapping</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {report.counts["already-mapped"]} seller
                {report.counts["already-mapped"] === 1 ? " is" : "s are"} assigned to a town.{" "}
                {toMap > 0
                  ? `${toMap} more can be assigned automatically.`
                  : "Nothing more can be assigned automatically."}
              </p>
            </div>
            {canEdit && toMap > 0 ? (
              <button
                onClick={runMapping}
                disabled={mapping}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60">
                {mapping ? "Assigning..." : `Assign ${toMap} seller${toMap === 1 ? "" : "s"}`}
              </button>
            ) : null}
          </div>

          {report.attention.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Needs a decision
              </p>
              <p className="mb-3 text-xs text-neutral-500">
                These sellers were not assigned. If the city they entered is just another
                spelling of a town, add it under that town&apos;s &quot;Also matches&quot;. Test
                accounts can be left as they are.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <tbody className="divide-y divide-neutral-100">
                    {report.attention.map((row) => (
                      <tr key={row.sellerId}>
                        <td className="py-2 pr-4 text-neutral-800">{row.storeName}</td>
                        <td className="py-2 pr-4 text-neutral-600">
                          {row.cityText ? `"${row.cityText}"` : "—"}
                        </td>
                        <td className="py-2 text-xs text-neutral-500">
                          {STATUS_LABEL[row.status] || row.status}
                          {row.detail ? ` · ${row.detail}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ----------------------------- add / edit ----------------------------- */}
      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-neutral-800">
              {draft.id ? "Edit town" : "Add town"}
            </h2>

            {error ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="town-name"
                  className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="town-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Biaora"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="town-district"
                    className="mb-1.5 block text-sm font-medium text-neutral-700">
                    District
                  </label>
                  <input
                    id="town-district"
                    type="text"
                    value={draft.district}
                    onChange={(e) => setDraft({ ...draft, district: e.target.value })}
                    placeholder="e.g. Rajgarh"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="town-state"
                    className="mb-1.5 block text-sm font-medium text-neutral-700">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="town-state"
                    type="text"
                    list="indian-states"
                    value={draft.state}
                    onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                    placeholder="e.g. Madhya Pradesh"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              </div>

              <datalist id="indian-states">
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state} />
                ))}
              </datalist>

              <div>
                <label
                  htmlFor="town-aliases"
                  className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Also matches
                </label>
                <textarea
                  id="town-aliases"
                  rows={4}
                  value={draft.aliases}
                  onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
                  placeholder={"One per line, e.g.\nBiaora rajgarh\nब्यावरा"}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <p className="mt-1.5 text-xs text-neutral-500">
                  Other spellings a seller might have entered. Capital letters and extra
                  spaces don&apos;t matter. A spelling can belong to only one town.
                </p>
              </div>

              {draft.id ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                  />
                  Active
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !draft.name.trim() || !draft.state.trim()}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
                {saving ? "Saving..." : draft.id ? "Save changes" : "Add town"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ----------------------------- delete confirm ------------------------- */}
      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-neutral-800">
              Delete &quot;{deleting.name}&quot;?
            </h2>
            {deleting.sellerCount > 0 ? (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {deleting.sellerCount} seller{deleting.sellerCount === 1 ? "" : "s"} belong to
                this town, so it can&apos;t be deleted. Mark it inactive instead.
              </p>
            ) : (
              <p className="mb-4 text-sm text-neutral-600">This cannot be undone.</p>
            )}

            {error ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeleting(null);
                  setError(null);
                }}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={saving || deleting.sellerCount > 0}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? "Deleting..." : "Delete town"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
