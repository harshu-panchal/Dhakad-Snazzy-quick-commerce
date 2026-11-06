import AppSettings from "../models/AppSettings";
import Delivery from "../models/Delivery";

export type DeliveryPartnerEarningMode = "DISTANCE" | "PERCENTAGE";

export interface DeliveryPartnerEarningCalculation {
  amount: number;
  mode: DeliveryPartnerEarningMode;
  rate: number;
  minimumApplied: boolean;
  locked: boolean;
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

const finiteNonNegative = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** Single source of truth for personal delivery-partner earnings. */
export const calculateDeliveryPartnerEarning = async (
  order: any,
  deliveryBoyId?: string,
  providedSettings?: any,
  respectLockedEarning = true,
): Promise<DeliveryPartnerEarningCalculation> => {
  const lockedAmount = finiteNonNegative(order?.deliveryPartnerEarning);
  if (respectLockedEarning && lockedAmount !== undefined) {
    return {
      amount: roundCurrency(lockedAmount),
      mode: order?.deliveryPartnerEarningCalculation === "DISTANCE"
        ? "DISTANCE"
        : "PERCENTAGE",
      rate: finiteNonNegative(order?.deliveryPartnerEarningRate) || 0,
      minimumApplied: false,
      locked: true,
    };
  }

  const settings = providedSettings || (await AppSettings.getSettings());
  const config = settings?.deliveryConfig;
  const distance = finiteNonNegative(order?.deliveryDistanceKm) || 0;
  const distanceRate = finiteNonNegative(config?.deliveryBoyKmRate) || 0;
  const usesInstantDistanceRate =
    order?.deliveryOption === "Instant" &&
    config?.isDistanceBased === true &&
    distance > 0 &&
    distanceRate > 0;

  if (usesInstantDistanceRate) {
    const normalEarning = distance * distanceRate;
    const minimumEarning = finiteNonNegative(config?.minimumDeliveryPartnerEarning) || 0;
    const minimumDistance =
      finiteNonNegative(config?.minimumDeliveryPartnerEarningDistanceKm) || 0;
    const guaranteeIsEligible =
      minimumEarning > 0 && minimumDistance > 0 && distance <= minimumDistance;

    return {
      amount: roundCurrency(
        guaranteeIsEligible ? Math.max(normalEarning, minimumEarning) : normalEarning,
      ),
      mode: "DISTANCE",
      rate: distanceRate,
      minimumApplied: guaranteeIsEligible && minimumEarning > normalEarning,
      locked: false,
    };
  }

  let percentageRate = 5;
  if (deliveryBoyId) {
    const deliveryBoy = await Delivery.findById(deliveryBoyId).select("commissionRate").lean();
    if (
      deliveryBoy?.commissionRate !== undefined &&
      deliveryBoy.commissionRate !== null
    ) {
      percentageRate = deliveryBoy.commissionRate;
    }
  }

  return {
    amount: roundCurrency(((Number(order?.subtotal) || 0) * percentageRate) / 100),
    mode: "PERCENTAGE",
    rate: percentageRate,
    minimumApplied: false,
    locked: false,
  };
};

export const lockDeliveryPartnerEarning = async (
  order: any,
  deliveryBoyId?: string,
  providedSettings?: any,
): Promise<DeliveryPartnerEarningCalculation> => {
  const calculation = await calculateDeliveryPartnerEarning(
    order,
    deliveryBoyId,
    providedSettings,
    true,
  );

  if (finiteNonNegative(order?.deliveryPartnerEarning) === undefined) {
    order.deliveryPartnerEarning = calculation.amount;
    order.deliveryPartnerEarningLockedAt = new Date();
    order.deliveryPartnerEarningCalculation = calculation.mode;
    order.deliveryPartnerEarningRate = calculation.rate;
  }

  return calculation;
};
