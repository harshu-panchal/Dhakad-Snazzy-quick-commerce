import mongoose from "mongoose";
import Seller from "../models/Seller";

/**
 * Helper function to calculate distance between two coordinates (Haversine formula)
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find sellers whose service radius covers the user's location
 * @param userLat User's latitude
 * @param userLng User's longitude
 * @returns Array of seller IDs within range
 */
export async function findSellersWithinRange(
  userLat: number,
  userLng: number
): Promise<mongoose.Types.ObjectId[]> {
  if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
    return [];
  }

  // Validate coordinates
  if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return [];
  }

  try {
    // Use the Seller 2dsphere index for normal GeoJSON pickup locations. The
    // per-seller service radius is applied after MongoDB computes distance, so
    // sellers can continue to have different radii without loading every
    // approved seller into the Node process.
    const geoMatches = await Seller.aggregate<{ _id: mongoose.Types.ObjectId }>([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [userLng, userLat] },
          // Seller has more than one geospatial field/index in production;
          // explicitly select the pickup location used for serviceability.
          key: "location",
          distanceField: "distanceMeters",
          spherical: true,
          query: { status: "Approved" },
        },
      },
      {
        $match: {
          $expr: {
            $lte: [
              "$distanceMeters",
              { $multiply: [{ $ifNull: ["$serviceRadiusKm", 10] }, 1000] },
            ],
          },
        },
      },
      { $project: { _id: 1 } },
    ]);

    const nearbySellerIds = geoMatches.map((seller) => seller._id);

    // Preserve support for legacy seller records that have only latitude and
    // longitude string fields. This query is restricted to records without a
    // usable GeoJSON point, so the normal path remains index-backed.
    const legacySellers = await Seller.find({
      status: "Approved",
      $or: [
        { "location.type": { $ne: "Point" } },
        { "location.coordinates.0": { $exists: false } },
        { "location.coordinates.1": { $exists: false } },
      ],
    })
      .select("_id serviceRadiusKm latitude longitude")
      .lean();

    for (const seller of legacySellers) {
      const sellerLat = seller.latitude ? parseFloat(seller.latitude) : NaN;
      const sellerLng = seller.longitude ? parseFloat(seller.longitude) : NaN;
      if (isNaN(sellerLat) || isNaN(sellerLng)) continue;

      const distance = calculateDistance(userLat, userLng, sellerLat, sellerLng);
      if (distance <= (seller.serviceRadiusKm || 10)) {
        nearbySellerIds.push(seller._id as mongoose.Types.ObjectId);
      }
    }

    return nearbySellerIds;
  } catch (error) {
    console.error("Error finding nearby sellers:", error);
    // A database/index failure is not the same as a valid location with no
    // nearby sellers. Let controllers return an error so the customer UI can
    // retain its non-blocking fallback instead of showing a false
    // "Service Not Available" screen.
    throw error;
  }
}

/**
 * Given a customer-to-seller distance and the admin-configured instant delivery
 * radius, determine which delivery options the customer is allowed to pick.
 * A customer can only choose one of the two - never both, never neither
 * (unless the boundary itself is unset, in which case both remain open).
 * @param distanceKm Straight-line distance between customer and seller, or null if unknown
 * @param instantDeliveryRadiusKm Admin-configured boundary (km), or null/undefined if gating is disabled
 */
export function getDeliveryEligibility(
  distanceKm: number | null,
  instantDeliveryRadiusKm: number | null | undefined
): { instantAllowed: boolean; standardAllowed: boolean } {
  if (
    distanceKm === null ||
    instantDeliveryRadiusKm === null ||
    instantDeliveryRadiusKm === undefined ||
    instantDeliveryRadiusKm <= 0
  ) {
    return { instantAllowed: true, standardAllowed: true };
  }

  if (distanceKm <= instantDeliveryRadiusKm) {
    return { instantAllowed: true, standardAllowed: false };
  }

  return { instantAllowed: false, standardAllowed: true };
}
