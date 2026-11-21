import { ReactNode } from "react";
import { usePermissions } from "../../../hooks/usePermissions";
import type { Tier } from "../permissions/catalog";

interface CanProps {
  /** Page key from the permission catalog, e.g. "orders.pending". */
  page: string;
  /** Defaults to "manage", since this mostly guards action controls. */
  tier?: Tier;
  children: ReactNode;
  /** Rendered instead when permission is absent. Nothing by default. */
  fallback?: ReactNode;
}

/**
 * Renders children only if the signed-in admin holds `page:tier`.
 *
 *   <Can page="orders.pending">
 *     <button onClick={cancelOrder}>Cancel order</button>
 *   </Can>
 *
 * Prefer disabling a control over hiding it where its absence would make the
 * page look broken — see hooks/useDisabledProps.
 */
export default function Can({ page, tier = "manage", children, fallback = null }: CanProps) {
  const { can } = usePermissions();
  return <>{can(page, tier) ? children : fallback}</>;
}
