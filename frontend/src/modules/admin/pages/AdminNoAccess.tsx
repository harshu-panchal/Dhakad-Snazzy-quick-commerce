import { useNavigate } from "react-router-dom";
import { usePermissions } from "../../../hooks/usePermissions";
import { pageByKey } from "../permissions/catalog";

interface AdminNoAccessProps {
  /** Page key the route required, when the guard knows it. */
  requiredPermission?: string;
}

/**
 * Shown when an admin opens a page their role does not include — by typing
 * the URL, following a stale bookmark, or after their role changed.
 */
export default function AdminNoAccess({ requiredPermission }: AdminNoAccessProps) {
  const navigate = useNavigate();
  const { firstVisiblePath, permissions } = usePermissions();

  const page = requiredPermission ? pageByKey(requiredPermission) : undefined;
  const hasAnyAccess = permissions.length > 0 && firstVisiblePath;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-amber-600"
          aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h1 className="mb-2 text-xl font-semibold text-neutral-800">
        You don&apos;t have access to this page
      </h1>

      <p className="mb-1 max-w-md text-sm text-neutral-600">
        {page
          ? `"${page.label}" isn't included in your role.`
          : "This page isn't included in your role."}
      </p>
      <p className="mb-6 max-w-md text-sm text-neutral-500">
        If you need it, ask a Super Admin to add it to your role.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {hasAnyAccess ? (
          <button
            onClick={() => navigate(firstVisiblePath!, { replace: true })}
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700">
            Go to my first available page
          </button>
        ) : null}
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50">
          Go back
        </button>
      </div>

      {!hasAnyAccess ? (
        <p className="mt-6 max-w-md text-sm text-neutral-500">
          Your role currently has no pages assigned. Contact a Super Admin to
          have your access set up.
        </p>
      ) : null}
    </div>
  );
}
