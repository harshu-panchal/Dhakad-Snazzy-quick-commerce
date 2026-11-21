import { Fragment, useCallback, useEffect, useState } from "react";
import {
  getAuditLogs,
  getAuditLogActors,
  type AuditLogEntry,
  type AuditLogActor,
} from "../../../services/api/admin/adminAuditLogService";
import { getApiErrorMessage } from "../../../utils/apiError";

/**
 * Audit Log.
 *
 * Read-only. Every mutating admin request is recorded automatically, along
 * with login successes and failures. Request bodies arrive already redacted
 * and size-capped from the server.
 */

const METHOD_STYLES: Record<string, string> = {
  POST: "bg-green-50 text-green-700",
  PUT: "bg-blue-50 text-blue-700",
  PATCH: "bg-amber-50 text-amber-700",
  DELETE: "bg-red-50 text-red-700",
  GET: "bg-neutral-100 text-neutral-600",
};

const statusStyle = (code: number) => {
  if (code >= 500) return "bg-red-100 text-red-800";
  if (code === 403 || code === 401) return "bg-amber-100 text-amber-800";
  if (code >= 400) return "bg-orange-50 text-orange-700";
  return "bg-green-50 text-green-700";
};

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actors, setActors] = useState<AuditLogActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [adminId, setAdminId] = useState("");
  const [kind, setKind] = useState<"" | "request" | "auth">("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAuditLogs({
        page,
        limit: 25,
        ...(adminId ? { adminId } : {}),
        ...(kind ? { kind } : {}),
        ...(method ? { method } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      setLogs(response.data || []);
      setTotalPages(response.pagination?.pages || 1);
      setTotal(response.pagination?.total || 0);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Failed to load the audit log. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  }, [page, adminId, kind, method, search, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getAuditLogActors()
      .then((res) => setActors(res.data || []))
      .catch(() => {
        // The filter dropdown is a convenience; failing to populate it must
        // not block the log itself.
      });
  }, []);

  // Any filter change restarts paging, otherwise page 7 of a narrower result
  // set comes back empty.
  const onFilterChange = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const resetFilters = () => {
    setAdminId("");
    setKind("");
    setMethod("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const hasFilters = Boolean(adminId || kind || method || search || from || to);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800">Audit Log</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every change made in the admin panel, plus sign-in activity. Passwords,
          tokens and gateway credentials are never recorded.
        </p>
      </div>

      {/* filters */}
      <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => onFilterChange(() => setSearch(e.target.value))}
              placeholder="Path, email, event..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Admin</label>
            <select
              value={adminId}
              onChange={(e) => onFilterChange(() => setAdminId(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100">
              <option value="">All admins</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.email || actor.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Type</label>
            <select
              value={kind}
              onChange={(e) =>
                onFilterChange(() => setKind(e.target.value as "" | "request" | "auth"))
              }
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100">
              <option value="">All</option>
              <option value="request">Changes</option>
              <option value="auth">Sign-in</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => onFilterChange(() => setFrom(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => onFilterChange(() => setTo(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            {total.toLocaleString()} record{total === 1 ? "" : "s"}
          </p>
          {hasFilters ? (
            <button
              onClick={resetFilters}
              className="text-xs font-medium text-teal-700 hover:underline">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
              role="status"
              aria-label="Loading audit log"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Who</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">IP</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.map((log) => {
                  const isOpen = expanded === log._id;
                  const when = new Date(log.createdAt);

                  return (
                    <Fragment key={log._id}>
                      <tr className="hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                          <div>{when.toLocaleDateString()}</div>
                          <div className="text-xs text-neutral-400">
                            {when.toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-neutral-800">
                            {log.adminEmail || "—"}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {log.adminRole || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold ${
                                METHOD_STYLES[log.method] || "bg-neutral-100 text-neutral-600"
                              }`}>
                              {log.method}
                            </span>
                            <span className="font-mono text-xs text-neutral-700">
                              {log.event || log.path}
                            </span>
                          </div>
                          {log.event && log.path !== log.event ? (
                            <div className="mt-0.5 font-mono text-xs text-neutral-400">
                              {log.path}
                            </div>
                          ) : null}
                          {log.pageKey ? (
                            <div className="mt-0.5 text-xs text-neutral-400">
                              via {log.pageKey}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(
                              log.statusCode
                            )}`}>
                            {log.statusCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                          {log.ip || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {log.requestBody || log.userAgent ? (
                            <button
                              onClick={() => setExpanded(isOpen ? null : log._id)}
                              className="text-xs font-medium text-teal-700 hover:underline">
                              {isOpen ? "Hide" : "Details"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-neutral-50">
                          <td colSpan={6} className="px-4 py-3">
                            {log.userAgent ? (
                              <div className="mb-2 text-xs text-neutral-500">
                                <span className="font-medium">User agent:</span>{" "}
                                {log.userAgent}
                              </div>
                            ) : null}
                            {log.requestBody ? (
                              <pre className="max-h-72 overflow-auto rounded-lg bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-100">
                                {JSON.stringify(log.requestBody, null, 2)}
                              </pre>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                      {hasFilters
                        ? "No records match these filters."
                        : "No activity recorded yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            Previous
          </button>
          <span className="text-sm text-neutral-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
