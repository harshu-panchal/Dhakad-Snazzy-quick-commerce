import City, { normalizeCityText, slugifyCity } from "../models/City";

/**
 * Seeds the six live towns. Idempotent and safe to re-run.
 *
 * Re-running never discards manual edits: an existing town keeps its name,
 * district, state and active flag, and only gains any seed aliases it is
 * missing. Aliases an admin added in the Towns page are left alone.
 *
 * Aliases come from the live-data audit (RBAC_CITY_SCOPE_PLAN.md §2 and §12):
 * the spellings actually found on sellers, plus the ones confirmed to be the
 * same town ("Biaora rajgarh", "Narasingarh").
 */

export interface TownSeed {
  name: string;
  aliases: string[];
  district: string;
  state: string;
}

export const TOWN_SEEDS: readonly TownSeed[] = [
  { name: "Biaora", aliases: ["Biaora rajgarh", "Biyaura", "Byavara", "ब्यावरा", "ब्यावरा"], district: "Rajgarh", state: "Madhya Pradesh" },
  { name: "Khujner", aliases: [], district: "Rajgarh", state: "Madhya Pradesh" },
  { name: "Narsinghgarh", aliases: ["Narasingarh", "Narsingarh", "Narsinghgarh Rajgarh"], district: "Rajgarh", state: "Madhya Pradesh" },
  { name: "Sarangpur", aliases: [], district: "Rajgarh", state: "Madhya Pradesh" },
  { name: "Pachore", aliases: [], district: "Rajgarh", state: "Madhya Pradesh" },
  { name: "Bhayana", aliases: [], district: "Rajgarh", state: "Madhya Pradesh" },
];

export interface SeedCitiesResult {
  created: string[];
  aliasesAdded: Record<string, string[]>;
  unchanged: string[];
}

export async function seedCities(): Promise<SeedCitiesResult> {
  const result: SeedCitiesResult = { created: [], aliasesAdded: {}, unchanged: [] };

  for (const seed of TOWN_SEEDS) {
    const slug = slugifyCity(seed.name);
    const wanted = [...new Set(seed.aliases.map(normalizeCityText).filter(Boolean))].filter(
      // The town's own name is always matched, so listing it as an alias is noise.
      (alias) => alias !== normalizeCityText(seed.name),
    );

    const existing = await City.findOne({ slug });

    if (!existing) {
      await City.create({
        name: seed.name,
        slug,
        aliases: wanted,
        district: seed.district,
        state: seed.state,
        isActive: true,
      });
      result.created.push(seed.name);
      continue;
    }

    const have = new Set(existing.aliases);
    const missing = wanted.filter((alias) => !have.has(alias));

    if (missing.length === 0) {
      result.unchanged.push(seed.name);
      continue;
    }

    existing.aliases = [...existing.aliases, ...missing];
    await existing.save();
    result.aliasesAdded[seed.name] = missing;
  }

  return result;
}

export default seedCities;
