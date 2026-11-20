import assert from "node:assert/strict";
import test from "node:test";
import { getDeliveryEligibility } from "../utils/locationHelper";
import { calculateDeliveryCharge } from "../utils/deliveryPricing";

const distanceSettings = {
  deliveryCharges: 20,
  freeDeliveryThreshold: 999,
  deliveryConfig: {
    isDistanceBased: true,
    baseCharge: 20,
    baseDistance: 2,
    kmRate: 10,
  },
};

// STANDARD DELIVERY DISABLED (temporary): restore together with the original
// getDeliveryEligibility logic in utils/locationHelper.ts.
// test("standard delivery becomes available beyond the instant radius", () => {
//   assert.deepEqual(getDeliveryEligibility(12.01, 12), {
//     instantAllowed: false,
//     standardAllowed: true,
//   });
// });

test("orders beyond the instant radius are not allowed", () => {
  assert.deepEqual(getDeliveryEligibility(12.01, 12), {
    instantAllowed: false,
    standardAllowed: false,
  });
});

test("instant delivery is the only option at the inclusive radius", () => {
  assert.deepEqual(getDeliveryEligibility(12, 12), {
    instantAllowed: true,
    standardAllowed: false,
  });
});

test("cart and order fee formula produces the same distance charge", () => {
  assert.equal(calculateDeliveryCharge({
    subtotal: 555,
    deliveryOption: "Instant",
    distanceKm: 9.8,
    settings: distanceSettings,
  }), 98);
});

test("fixed mode honors the configured flat delivery charge", () => {
  assert.equal(calculateDeliveryCharge({
    subtotal: 555,
    deliveryOption: "Instant",
    distanceKm: 9.8,
    settings: {
      ...distanceSettings,
      deliveryConfig: { ...distanceSettings.deliveryConfig, isDistanceBased: false },
    },
  }), 20);
});

test("free-delivery threshold overrides either delivery option", () => {
  assert.equal(calculateDeliveryCharge({
    subtotal: 999,
    deliveryOption: "Instant",
    distanceKm: 9.8,
    settings: distanceSettings,
  }), 0);
});
