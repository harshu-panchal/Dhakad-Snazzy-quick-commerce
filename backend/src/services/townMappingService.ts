import { Types } from "mongoose";
import Seller from "../models/Seller";
import City, { normalizeCityText, pickTown } from "../models/City";

/**
 * Maps sellers to towns by their own free-text `city`.
 *
 * Text is the source of truth for the town, not the geocoded locality: the
 * geocoder returns village names for some Biaora sellers, but those sellers are
 * Biaora's. Coordinates are used only as a sanity check, to catch a seller
 * whose text says one town while its location is somewhere else entirely.
 *
 * Nothing here ever overwrites an existing Seller.cityId, and a seller is only
 * written when its mapping is unambiguous.
 */

/** A matched seller further than this from its town's median location is flagged. */
export const OUTLIER_KM = 25;
/** A median over fewer sellers than this is not meaningful, so no outlier check. */
const MIN_SELLERS_FOR_MEDIAN = 3;

export type MappingStatus =
  | "already-mapped"
  | "matched"
  | "no-city-text"
  | "no-matching-town"
  | "ambiguous"
  | "state-mismatch"
  | "location-outlier";

export interface SellerMappingRow {
  sellerId: string;
  storeName: string;
  cityText: string | null;
  status: MappingStatus;
  townName?: string;
  townId?: string;
  detail?: string;
}

export interface MappingReport {
  applied: boolean;
  rows: SellerMappingRow[];
  counts: Record<MappingStatus, number>;
  written: number;
  /** Distinct unmatched city texts with how many sellers carry each. */
  unmatchedTexts: Array<{ text: string; sellers: number }>;
}

interface TownIndexEntry {
  _id: string;
  name: string;
  state?: string | null;
}

/** normalised text -> the towns it names (more than one means it is ambiguous) */
export function buildTownIndex(
  towns: Array<{ _id: unknown; name: string; aliases?: string[]; state?: string | null }>,
): Map<string, TownIndexEntry[]> {
  const index = new Map<string, TownIndexEntry[]>();

  const add = (text: string, entry: TownIndexEntry) => {
    const key = normalizeCityText(text);
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.some((e) => e._id === entry._id)) list.push(entry);
    index.set(key, list);
  };

  for (const town of towns) {
    const entry = { _id: String(town._id), name: town.name, state: town.state };
    add(town.name, entry);
    (town.aliases ?? []).forEach((alias) => add(alias, entry));
  }

  return index;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

interface SellerLike {
  _id: unknown;
  storeName?: string;
  city?: string | null;
  state?: string | null;
  cityId?: unknown;
  location?: { coordinates?: number[] };
}

/**
 * Pure classification of sellers against towns. No database access, so it can
 * be tested directly. mapSellers() wraps it with the reads and writes.
 */
export function classifySellers(
  sellers: SellerLike[],
  towns: Array<{ _id: unknown; name: string; aliases?: string[]; state?: string | null }>,
): SellerMappingRow[] {
  const index = buildTownIndex(towns);

  const rows: SellerMappingRow[] = sellers.map((seller) => {
    const base = {
      sellerId: String(seller._id),
      storeName: seller.storeName ?? "(unnamed)",
      cityText: typeof seller.city === "string" && seller.city.trim() ? seller.city.trim() : null,
    };

    if (seller.cityId) {
      return { ...base, status: "already-mapped" as const };
    }

    if (!base.cityText) {
      return { ...base, status: "no-city-text" as const };
    }

    const hits = index.get(normalizeCityText(base.cityText)) ?? [];
    const pick = pickTown(hits, seller.state);

    if (pick.kind === "none") {
      return {
        ...base,
        status: "no-matching-town" as const,
        detail: `"${base.cityText}" is not a town name or alias`,
      };
    }

    if (pick.kind === "state-mismatch") {
      return {
        ...base,
        status: "state-mismatch" as const,
        detail: `"${base.cityText}" exists in ${pick.towns.map((t) => t.state || "an unknown state").join(" and ")}, but the seller's state is "${seller.state}"`,
      };
    }

    if (pick.kind === "ambiguous") {
      return {
        ...base,
        status: "ambiguous" as const,
        detail: `"${base.cityText}" matches ${pick.towns.map((t) => `${t.name} (${t.state || "no state"})`).join(" and ")}${seller.state ? "" : "; the seller has no state to tell them apart"}`,
      };
    }

    return {
      ...base,
      status: "matched" as const,
      townId: pick.town._id,
      townName: pick.town.name,
    };
  });

  // --- sanity check: a matched seller far from the rest of its town ---------
  const coordsById = new Map<string, { lat: number; lng: number }>();
  for (const seller of sellers) {
    const c = seller.location?.coordinates;
    if (Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
      coordsById.set(String(seller._id), { lng: c[0], lat: c[1] });
    }
  }

  const byTown = new Map<string, SellerMappingRow[]>();
  rows
    .filter((r) => r.status === "matched" && r.townId)
    .forEach((r) => byTown.set(r.townId!, [...(byTown.get(r.townId!) ?? []), r]));

  for (const [, townRows] of byTown) {
    const located = townRows.filter((r) => coordsById.has(r.sellerId));
    if (located.length < MIN_SELLERS_FOR_MEDIAN) continue;

    const centre = {
      lat: median(located.map((r) => coordsById.get(r.sellerId)!.lat)),
      lng: median(located.map((r) => coordsById.get(r.sellerId)!.lng)),
    };

    for (const row of located) {
      const km = haversineKm(centre, coordsById.get(row.sellerId)!);
      if (km > OUTLIER_KM) {
        row.status = "location-outlier";
        row.detail = `text says ${row.townName} but the store is ${km.toFixed(0)} km from the other ${row.townName} sellers`;
      }
    }
  }

  return rows;
}

export function summarize(rows: SellerMappingRow[]): Pick<MappingReport, "counts" | "unmatchedTexts"> {
  const counts: Record<MappingStatus, number> = {
    "already-mapped": 0,
    matched: 0,
    "no-city-text": 0,
    "no-matching-town": 0,
    ambiguous: 0,
    "state-mismatch": 0,
    "location-outlier": 0,
  };
  const texts = new Map<string, number>();

  for (const row of rows) {
    counts[row.status] += 1;
    if (row.status === "no-matching-town" && row.cityText) {
      texts.set(row.cityText, (texts.get(row.cityText) ?? 0) + 1);
    }
  }

  return {
    counts,
    unmatchedTexts: [...texts.entries()]
      .map(([text, sellers]) => ({ text, sellers }))
      .sort((a, b) => b.sellers - a.sellers),
  };
}

/**
 * Classify every seller and, when `apply` is true, write Seller.cityId for the
 * unambiguous matches. Defaults to a dry run.
 *
 * The write is conditioned on cityId not already being set, so a concurrent
 * edit or a second run cannot overwrite a value, and a re-run is a no-op.
 */
export async function mapSellers({ apply = false }: { apply?: boolean } = {}): Promise<MappingReport> {
  const [towns, sellers] = await Promise.all([
    City.find({ isActive: true }).select("name aliases state").lean(),
    Seller.find({}).select("storeName city state cityId location").lean(),
  ]);

  const rows = classifySellers(sellers as SellerLike[], towns);
  const { counts, unmatchedTexts } = summarize(rows);

  let written = 0;

  if (apply) {
    const ops = rows
      .filter((r) => r.status === "matched" && r.townId)
      .map((r) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(r.sellerId), cityId: { $exists: false } },
          update: { $set: { cityId: new Types.ObjectId(r.townId!) } },
        },
      }));

    if (ops.length > 0) {
      // bulkWrite goes straight to MongoDB and skips Seller's save hooks, which
      // is what we want: this must not touch passwords or sync side effects.
      // timestamps:false so a seller's updatedAt is not changed by bookkeeping.
      const result = await Seller.bulkWrite(ops, { ordered: false, timestamps: false });
      written = result.modifiedCount;
    }
  }

  return { applied: apply, rows, counts, written, unmatchedTexts };
}
