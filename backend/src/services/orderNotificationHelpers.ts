import { calculateDeliveryPartnerEarning } from "./deliveryPartnerEarningService";

/**
 * Calculate estimated delivery boy earning for a new order.
 */
export async function calculateEstimatedDeliveryBoyEarning(order: any): Promise<number> {
  try {
    return (await calculateDeliveryPartnerEarning(order)).amount;
  } catch (error) {
    console.error("Error calculating estimated delivery boy earning:", error);
    return Math.round(((order.subtotal * 5) / 100) * 100) / 100;
  }
}
