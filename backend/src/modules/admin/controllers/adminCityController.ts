import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import City, { normalizeCityText, slugifyCity, canonicalState, stateKey, townSlug } from "../../../models/City";
import Seller from "../../../models/Seller";
import Admin from "../../../models/Admin";
import { mapSellers } from "../../../services/townMappingService";

/**
 * Town management.
 *
 * Reads are open to every admin (the list is non-sensitive and pickers on
 * other pages need it); writes require settings.cities:manage. See the guard
 * block in routes/adminRoutes.ts.
 */

/** Aliases in, normalised and de-duplicated, with the town's own name removed. */
function cleanAliases(input: unknown, ownName: string): string[] {
  if (!Array.isArray(input)) return [];
  const own = normalizeCityText(ownName);
  return [...new Set(input.map(normalizeCityText).filter((a) => a && a !== own))];
}

/**
 * Every normalised text that would match this town: its name and aliases.
 * Two towns IN THE SAME STATE must never share one, or a seller's text would map to
 * both. The same name in different states is fine (Aurangabad in Bihar and in
 * Maharashtra): the seller's state tells them apart (see pickTown).
 */
async function findClash(
  names: string[],
  state: string,
  excludeId?: string,
): Promise<{ text: string; town: string } | null> {
  const wanted = new Set(names);
  const here = stateKey(state);
  const others = await City.find(excludeId ? { _id: { $ne: excludeId } } : {})
    .select("name aliases state")
    .lean();

  for (const other of others) {
    if (stateKey(other.state) !== here) continue;
    const theirs = [normalizeCityText(other.name), ...(other.aliases ?? [])];
    const hit = theirs.find((t) => wanted.has(t));
    if (hit) return { text: hit, town: other.name };
  }
  return null;
}

const serialize = (town: any, sellerCount = 0) => ({
  _id: town._id,
  name: town.name,
  slug: town.slug,
  aliases: town.aliases ?? [],
  district: town.district ?? "",
  state: town.state ?? "",
  isActive: town.isActive !== false,
  sellerCount,
  createdAt: town.createdAt,
  updatedAt: town.updatedAt,
});

export const getCities = asyncHandler(async (req: Request, res: Response) => {
  const { includeInactive } = req.query;

  const query: Record<string, unknown> = {};
  if (includeInactive !== "true") query.isActive = { $ne: false };

  const [towns, counts] = await Promise.all([
    // Every town, no cap: the picker needs the whole list. shortcut: fine to a few
    // thousand towns; past that, search and page on the server.
    City.find(query).sort({ state: 1, name: 1 }).lean(),
    Seller.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { cityId: { $exists: true, $ne: null } } },
      { $group: { _id: "$cityId", n: { $sum: 1 } } },
    ]),
  ]);

  const byId = new Map(counts.map((c) => [String(c._id), c.n]));

  return res.status(200).json({
    success: true,
    message: "Towns fetched successfully",
    data: towns.map((t) => serialize(t, byId.get(String(t._id)) ?? 0)),
  });
});

export const createCity = asyncHandler(async (req: Request, res: Response) => {
  const { name, aliases, district, state } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ success: false, message: "Town name is required" });
  }

  // A town is its name plus its state: without a state, "Aurangabad" could be two places.
  if (typeof state !== "string" || !state.trim()) {
    return res.status(400).json({ success: false, message: "State is required" });
  }

  const trimmed = name.trim();
  const cleanState = canonicalState(state);
  const slug = townSlug(trimmed, cleanState);

  if (!slugifyCity(trimmed)) {
    return res.status(400).json({
      success: false,
      message: "Town name must contain Latin letters or digits so a slug can be made. Add the local spelling as an alias.",
    });
  }

  const cleaned = cleanAliases(aliases, trimmed);

  const clash = await findClash([normalizeCityText(trimmed), ...cleaned], cleanState);
  if (clash) {
    return res.status(409).json({
      success: false,
      code: "TOWN_NAME_CLASH",
      message: `"${clash.text}" already belongs to ${clash.town}. A name or alias can only point to one town.`,
    });
  }

  if (await City.exists({ slug })) {
    return res.status(409).json({
      success: false,
      message: `${trimmed} in ${cleanState} already exists`,
    });
  }

  const town = await City.create({
    name: trimmed,
    slug,
    aliases: cleaned,
    district: typeof district === "string" ? district.trim() : undefined,
    state: cleanState,
    isActive: true,
  });

  return res.status(201).json({
    success: true,
    message: "Town created successfully",
    data: serialize(town, 0),
  });
});

export const updateCity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, aliases, district, state, isActive } = req.body ?? {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid town id" });
  }

  const town = await City.findById(id);
  if (!town) {
    return res.status(404).json({ success: false, message: "Town not found" });
  }

  const nextName = typeof name === "string" && name.trim() ? name.trim() : town.name;
  const nextAliases = aliases !== undefined ? cleanAliases(aliases, nextName) : town.aliases;

  // A town always has a state; it can be corrected but not blanked.
  if (state !== undefined && (typeof state !== "string" || !state.trim())) {
    return res.status(400).json({ success: false, message: "State cannot be empty" });
  }
  const nextState = state !== undefined ? canonicalState(state) : (town.state ?? "");

  // Re-check clashes whenever what matches this town, or the state it is in, changes.
  if (nextName !== town.name || aliases !== undefined || nextState !== (town.state ?? "")) {
    const clash = await findClash([normalizeCityText(nextName), ...nextAliases], nextState, id);
    if (clash) {
      return res.status(409).json({
        success: false,
        code: "TOWN_NAME_CLASH",
        message: `"${clash.text}" already belongs to ${clash.town}. A name or alias can only point to one town.`,
      });
    }
  }

  // The slug is left alone on rename: it is a stable identifier, and nothing
  // should break because someone corrected a spelling.
  town.name = nextName;
  town.aliases = nextAliases;
  if (district !== undefined) town.district = typeof district === "string" ? district.trim() : undefined;
  if (state !== undefined) town.state = nextState;
  if (isActive !== undefined) town.isActive = Boolean(isActive);

  await town.save();

  const sellerCount = await Seller.countDocuments({ cityId: town._id });

  return res.status(200).json({
    success: true,
    message: "Town updated successfully",
    data: serialize(town, sellerCount),
  });
});

export const deleteCity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid town id" });
  }

  const town = await City.findById(id);
  if (!town) {
    return res.status(404).json({ success: false, message: "Town not found" });
  }

  const inUse = await Seller.countDocuments({ cityId: town._id });
  if (inUse > 0) {
    return res.status(409).json({
      success: false,
      code: "TOWN_IN_USE",
      message: `Cannot delete: ${inUse} seller${inUse === 1 ? "" : "s"} belong${
        inUse === 1 ? "s" : ""
      } to this town. Deactivate it instead, or move the sellers first.`,
      data: { sellerCount: inUse },
    });
  }

  // An admin limited to this town would be left pointing at nothing, silently
  // losing access. Make someone reassign them first.
  const scopedAdmins = await Admin.countDocuments({ "cityScope.cityIds": town._id });
  if (scopedAdmins > 0) {
    return res.status(409).json({
      success: false,
      code: "TOWN_IN_USE",
      message: `Cannot delete: ${scopedAdmins} admin${scopedAdmins === 1 ? "" : "s"} ${
        scopedAdmins === 1 ? "is" : "are"
      } limited to this town. Change their towns first, or deactivate the town instead.`,
      data: { adminCount: scopedAdmins },
    });
  }

  await City.findByIdAndDelete(id);

  return res.status(200).json({ success: true, message: "Town deleted successfully" });
});

/**
 * Dry run of the seller mapping: what would be assigned, and what needs a
 * decision. Writes nothing.
 */
export const getMappingReport = asyncHandler(async (_req: Request, res: Response) => {
  const report = await mapSellers({ apply: false });

  return res.status(200).json({
    success: true,
    message: "Mapping report generated",
    data: {
      counts: report.counts,
      unmatchedTexts: report.unmatchedTexts,
      // Only the rows that need attention; the clean ones are in `counts`.
      attention: report.rows.filter((r) =>
        ["location-outlier", "ambiguous", "state-mismatch", "no-matching-town", "no-city-text"].includes(r.status),
      ),
    },
  });
});

/**
 * Write Seller.cityId for every unambiguous match. Idempotent: never
 * overwrites an existing value and a second call changes nothing.
 */
export const applySellerMapping = asyncHandler(async (_req: Request, res: Response) => {
  const report = await mapSellers({ apply: true });

  return res.status(200).json({
    success: true,
    message: `Mapped ${report.written} seller${report.written === 1 ? "" : "s"} to towns`,
    data: { written: report.written, counts: report.counts },
  });
});
