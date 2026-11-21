import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRoles,
  getRolePermissions,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type PermissionCatalogGroup,
} from "../../../services/api/admin/adminRoleService";
import { usePermissions } from "../../../hooks/usePermissions";
import { getApiErrorMessage } from '../../../utils/apiError';

/**
 * Manage Roles.
 *
 * The permission matrix is driven by GET /admin/roles/permissions, so adding a
 * page to the backend catalog makes it appear here with no frontend change.
 */

type Draft = {
  id: string | null;
  name: string;
  description: string;
  permissions: Set<string>;
};

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  description: "",
  permissions: new Set<string>(),
});

export default function AdminRoles() {
  const { canManage, refreshPermissions } = usePermissions();
  const canEdit = canManage("settings.roles");

  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<PermissionCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Role | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        getRoles({ limit: 200 }),
        getRolePermissions(),
      ]);
      setRoles(rolesRes.data || []);
      setGroups(permsRes.data?.groups || []);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Failed to load roles. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(
    () => groups.reduce((sum, g) => sum + g.pages.length, 0),
    [groups]
  );

  /* ------------------------------ draft helpers ----------------------------- */

  const openCreate = () => {
    setDraft(emptyDraft());
    setExpanded(new Set(groups.map((g) => g.group)));
    setNotice(null);
  };

  const openEdit = (role: Role) => {
    setDraft({
      id: role._id,
      name: role.name,
      description: role.description || "",
      permissions: new Set(role.permissions || []),
    });
    setExpanded(new Set(groups.map((g) => g.group)));
    setNotice(null);
  };

  const closeDraft = () => {
    setDraft(null);
    setError(null);
  };

  /**
   * Ticking manage implies view; clearing view clears manage with it. The
   * backend normalises the same way, so the two cannot disagree.
   */
  const toggle = (page: { view: string; manage: string }, tier: "view" | "manage") => {
    if (!draft) return;
    const next = new Set(draft.permissions);

    if (tier === "view") {
      if (next.has(page.view)) {
        next.delete(page.view);
        next.delete(page.manage);
      } else {
        next.add(page.view);
      }
    } else {
      if (next.has(page.manage)) {
        next.delete(page.manage);
      } else {
        next.add(page.manage);
        next.add(page.view);
      }
    }

    setDraft({ ...draft, permissions: next });
  };

  const toggleGroup = (group: PermissionCatalogGroup, tier: "view" | "manage") => {
    if (!draft) return;
    const next = new Set(draft.permissions);
    const allOn = group.pages.every((p) => next.has(tier === "view" ? p.view : p.manage));

    for (const page of group.pages) {
      if (allOn) {
        if (tier === "view") {
          next.delete(page.view);
          next.delete(page.manage);
        } else {
          next.delete(page.manage);
        }
      } else {
        next.add(page.view);
        if (tier === "manage") next.add(page.manage);
      }
    }

    setDraft({ ...draft, permissions: next });
  };

  const selectAll = (on: boolean) => {
    if (!draft) return;
    if (!on) {
      setDraft({ ...draft, permissions: new Set() });
      return;
    }
    const next = new Set<string>();
    for (const group of groups) {
      for (const page of group.pages) {
        next.add(page.view);
        next.add(page.manage);
      }
    }
    setDraft({ ...draft, permissions: next });
  };

  const save = async () => {
    if (!draft) return;

    if (!draft.name.trim()) {
      setError("Role name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        permissions: [...draft.permissions],
      };

      if (draft.id) {
        await updateRole(draft.id, payload);
        setNotice(`Role "${payload.name}" updated.`);
      } else {
        await createRole(payload);
        setNotice(`Role "${payload.name}" created.`);
      }

      setDraft(null);
      await load();
      // The edit may have changed the current user's own permissions.
      await refreshPermissions();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to save role."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await deleteRole(deleting._id);
      setNotice(`Role "${deleting.name}" deleted.`);
      setDeleting(null);
      await load();
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Failed to delete role. It may still be assigned to an admin.")
      );
    } finally {
      setSaving(false);
    }
  };

  const countFor = (role: Role) => {
    if (role.isWildcard) return "All";
    const views = (role.permissions || []).filter((p) => p.endsWith(":view")).length;
    return `${views} / ${totalPages}`;
  };

  /* --------------------------------- render -------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
          role="status"
          aria-label="Loading roles"
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">Manage Roles</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A role is a set of pages, each either viewable or fully manageable.
          </p>
        </div>
        {canEdit ? (
          <button
            onClick={openCreate}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700">
            Add role
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

      {/* ------------------------------ role list ----------------------------- */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Pages</th>
                <th className="px-4 py-3 font-semibold">Accounts</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {roles.map((role) => (
                <tr key={role._id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-800">{role.name}</div>
                    {role.description ? (
                      <div className="mt-0.5 max-w-md text-xs text-neutral-500">
                        {role.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        role.type === "System"
                          ? "bg-neutral-100 text-neutral-600"
                          : "bg-teal-50 text-teal-700"
                      }`}>
                      {role.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{countFor(role)}</td>
                  <td className="px-4 py-3 text-neutral-700">{role.userCount ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(role)}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                        {role.type === "System" || !canEdit ? "View" : "Edit"}
                      </button>
                      {canEdit && role.type === "Custom" ? (
                        <button
                          onClick={() => setDeleting(role)}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                    No roles yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------- editor drawer --------------------------- */}
      {draft ? (
        <RoleEditor
          draft={draft}
          groups={groups}
          readOnly={
            !canEdit ||
            roles.find((r) => r._id === draft.id)?.type === "System"
          }
          saving={saving}
          error={error}
          expanded={expanded}
          totalPages={totalPages}
          onToggleExpand={(group) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(group)) next.delete(group);
              else next.add(group);
              return next;
            })
          }
          onChangeName={(name) => setDraft({ ...draft, name })}
          onChangeDescription={(description) => setDraft({ ...draft, description })}
          onToggle={toggle}
          onToggleGroup={toggleGroup}
          onSelectAll={selectAll}
          onClose={closeDraft}
          onSave={save}
        />
      ) : null}

      {/* ---------------------------- delete confirm -------------------------- */}
      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-neutral-800">
              Delete &quot;{deleting.name}&quot;?
            </h2>
            <p className="mb-1 text-sm text-neutral-600">
              This cannot be undone.
            </p>
            {(deleting.userCount ?? 0) > 0 ? (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {deleting.userCount} admin account
                {deleting.userCount === 1 ? "" : "s"} currently use this role.
                Reassign them first — the server will refuse this delete.
              </p>
            ) : (
              <p className="mb-4 text-sm text-neutral-500">
                No admin accounts use this role.
              </p>
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
                disabled={saving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? "Deleting..." : "Delete role"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ editor drawer ----------------------------- */

interface RoleEditorProps {
  draft: Draft;
  groups: PermissionCatalogGroup[];
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  expanded: Set<string>;
  totalPages: number;
  onToggleExpand: (group: string) => void;
  onChangeName: (name: string) => void;
  onChangeDescription: (description: string) => void;
  onToggle: (page: { view: string; manage: string }, tier: "view" | "manage") => void;
  onToggleGroup: (group: PermissionCatalogGroup, tier: "view" | "manage") => void;
  onSelectAll: (on: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}

function RoleEditor({
  draft,
  groups,
  readOnly,
  saving,
  error,
  expanded,
  totalPages,
  onToggleExpand,
  onChangeName,
  onChangeDescription,
  onToggle,
  onToggleGroup,
  onSelectAll,
  onClose,
  onSave,
}: RoleEditorProps) {
  const selectedViews = [...draft.permissions].filter((p) => p.endsWith(":view")).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
        {/* header */}
        <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">
              {draft.id ? (readOnly ? "Role details" : "Edit role") : "Add role"}
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              {selectedViews} of {totalPages} pages selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {readOnly ? (
            <div className="mb-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              System roles cannot be changed. To grant a different set of pages,
              create a custom role.
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                Role name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => onChangeName(e.target.value)}
                disabled={readOnly}
                placeholder="e.g. Order Manager"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-neutral-50 disabled:text-neutral-500"
              />
              {draft.id && !readOnly ? (
                <p className="mt-1.5 text-xs text-neutral-500">
                  Renaming updates every admin account using this role.
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                Description
              </label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => onChangeDescription(e.target.value)}
                disabled={readOnly}
                placeholder="What is this role for?"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-neutral-50 disabled:text-neutral-500"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-700">Permissions</h3>
            {!readOnly ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onSelectAll(true)}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                  Select all
                </button>
                <button
                  onClick={() => onSelectAll(false)}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                  Clear all
                </button>
              </div>
            ) : null}
          </div>

          <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <strong>View</strong> lets the page open and its data load.{" "}
            <strong>Manage</strong> additionally allows creating, editing and
            deleting on that page.
          </p>

          <div className="space-y-3">
            {groups.map((group) => {
              const isOpen = expanded.has(group.group);
              const viewsOn = group.pages.filter((p) => draft.permissions.has(p.view)).length;
              const allView = viewsOn === group.pages.length;
              const allManage = group.pages.every((p) => draft.permissions.has(p.manage));

              return (
                <div key={group.group} className="overflow-hidden rounded-lg border border-neutral-200">
                  <div className="flex items-center justify-between gap-3 bg-neutral-50 px-4 py-2.5">
                    <button
                      onClick={() => onToggleExpand(group.group)}
                      className="flex flex-1 items-center gap-2 text-left">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`shrink-0 text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <span className="text-sm font-medium text-neutral-800">
                        {group.groupLabel}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {viewsOn}/{group.pages.length}
                      </span>
                    </button>

                    {!readOnly ? (
                      <div className="flex shrink-0 items-center gap-3 text-xs">
                        <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600">
                          <input
                            type="checkbox"
                            checked={allView}
                            onChange={() => onToggleGroup(group, "view")}
                            className="h-3.5 w-3.5 rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                          />
                          All view
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600">
                          <input
                            type="checkbox"
                            checked={allManage}
                            onChange={() => onToggleGroup(group, "manage")}
                            className="h-3.5 w-3.5 rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                          />
                          All manage
                        </label>
                      </div>
                    ) : null}
                  </div>

                  {isOpen ? (
                    <div className="divide-y divide-neutral-100">
                      {group.pages.map((page) => {
                        const hasView = draft.permissions.has(page.view);
                        const hasManage = draft.permissions.has(page.manage);

                        return (
                          <div
                            key={page.key}
                            className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-neutral-800">
                                {page.label}
                              </div>
                              <div className="truncate text-xs text-neutral-400">
                                {page.path}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-4 text-xs">
                              <label className="flex w-16 cursor-pointer items-center gap-1.5 text-neutral-600">
                                <input
                                  type="checkbox"
                                  checked={hasView}
                                  disabled={readOnly}
                                  onChange={() => onToggle(page, "view")}
                                  className="h-4 w-4 rounded border-neutral-300 text-teal-600 focus:ring-teal-500 disabled:opacity-50"
                                />
                                View
                              </label>
                              <label className="flex w-20 cursor-pointer items-center gap-1.5 text-neutral-600">
                                <input
                                  type="checkbox"
                                  checked={hasManage}
                                  disabled={readOnly}
                                  onChange={() => onToggle(page, "manage")}
                                  className="h-4 w-4 rounded border-neutral-300 text-teal-600 focus:ring-teal-500 disabled:opacity-50"
                                />
                                Manage
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button
              onClick={onSave}
              disabled={saving || !draft.name.trim()}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
              {saving ? "Saving..." : draft.id ? "Save changes" : "Create role"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
