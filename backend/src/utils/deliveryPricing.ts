type DeliveryPricingSettings = {
  deliveryCharges?: number | null;
  freeDeliveryThreshold?: number | null;
  deliveryConfig?: {
    isDistanceBased?: boolean;
    baseCharge?: number | null;
    baseDistance?: number | null;
    kmRate?: number | null;
  } | null;
};

export const calculateDeliveryCharge = ({
  subtotal,
  deliveryOption,
  distanceKm,
  settings,
}: {
  subtotal: number;
  deliveryOption: string;
  distanceKm: number | null;
  settings: DeliveryPricingSettings;
}): number => {
  const freeDeliveryThreshold = Number(settings.freeDeliveryThreshold ?? 199);
  if (freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold) return 0;

  const config = settings.deliveryConfig;
  if (
    deliveryOption === "Instant" &&
    config?.isDistanceBased === true &&
    distanceKm !== null &&
    Number.isFinite(distanceKm)
  ) {
    const baseCharge = Number(config.baseCharge ?? 0);
    const baseDistance = Number(config.baseDistance ?? 0);
    const kmRate = Number(config.kmRate ?? 0);
    const extraKm = Math.max(0, distanceKm - baseDistance);
    return Math.ceil(baseCharge + extraKm * kmRate);
  }

  return Number(settings.deliveryCharges ?? 0);
};
