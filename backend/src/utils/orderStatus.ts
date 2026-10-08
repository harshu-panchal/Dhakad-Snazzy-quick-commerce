/**
 * Canonical order status utilities.
 *
 * The codebase historically used inconsistent status strings
 * ("Picked up" vs "Picked Up", "Out for Delivery" vs "Out For Delivery",
 * "On the way", etc.). These helpers normalize any variant to the
 * canonical values defined in the Order model so status checks never
 * fail due to string drift.
 */

export const CANONICAL_DELIVERY_STATUSES = [
  "Picked up",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Returned",
  "Rejected",
] as const;

/** Map of lowercase variant -> canonical status */
const STATUS_ALIASES: Record<string, string> = {
  "picked up": "Picked up",
  "pickedup": "Picked up",
  "picked-up": "Picked up",
  "out for delivery": "Out for Delivery",
  "outfordelivery": "Out for Delivery",
  "out-for-delivery": "Out for Delivery",
  "out for delivery.": "Out for Delivery",
  "on the way": "Out for Delivery",
  "ontheway": "Out for Delivery",
  "on-the-way": "Out for Delivery",
  "in transit": "Out for Delivery",
  "delivered": "Delivered",
  "cancelled": "Cancelled",
  "canceled": "Cancelled",
  "returned": "Returned",
  "rejected": "Rejected",
};

/**
 * Normalize a status string to its canonical form.
 * Returns the input unchanged (trimmed) if no alias matches,
 * so non-delivery statuses (Pending, Accepted, etc.) pass through.
 */
export function normalizeOrderStatus(status?: string | null): string {
  if (!status) return "";
  const trimmed = status.trim();
  const canonical = STATUS_ALIASES[trimmed.toLowerCase()];
  return canonical || trimmed;
}

/**
 * Check whether an order status allows sending a delivery OTP.
 * Accepts any variant of "Picked up" or "Out for Delivery".
 */
export function canSendDeliveryOtp(status?: string | null): boolean {
  const normalized = normalizeOrderStatus(status);
  return normalized === "Picked up" || normalized === "Out for Delivery";
}
