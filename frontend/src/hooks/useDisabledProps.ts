import { usePermissions } from "./usePermissions";
import type { Tier } from "../modules/admin/permissions/catalog";

/**
 * Props for a control that should be visibly disabled rather than hidden when
 * the user lacks the manage tier.
 *
 *   <button {...useDisabledProps("orders.pending")} onClick={cancel}>Cancel</button>
 */
export function useDisabledProps(page: string, tier: Tier = "manage") {
  const { can } = usePermissions();
  const allowed = can(page, tier);

  return {
    disabled: !allowed,
    title: allowed ? undefined : "You do not have permission to perform this action",
    "aria-disabled": !allowed,
  };
}
