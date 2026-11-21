import mongoose, { Schema, model, Document } from "mongoose";

/**
 * A town: the unit an admin can be scoped to (see RBAC_CITY_SCOPE_PLAN.md).
 *
 * "City" is the name used throughout the code and API, matching the
 * vocabulary already in the codebase (Seller.city, Order.deliveryAddress.city),
 * but every record here is a town such as Biaora or Khujner. The district is
 * stored as a grouping label only, so an admin can later be given a whole
 * district at once; it is not the scope boundary.
 */
export interface ICity extends Document {
  name: string;
  slug: string;
  /**
   * Normalised spellings that map to this town (see normalizeCityText). The
   * town's own name is always matched too, so it need not be listed.
   */
  aliases: string[];
  district?: string;
  state?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Canonical form for comparing free-text city values: trimmed, lower-cased and
 * with runs of whitespace collapsed. "SARANGPUR", " Sarangpur " and
 * "sarangpur" all become "sarangpur".
 *
 * Deliberately does NOT strip punctuation or transliterate. Matching stays
 * predictable; anything that needs more than this (a Hindi spelling, a
 * misspelling) is added explicitly as an alias.
 */
export function normalizeCityText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function slugifyCity(value: string): string {
  return normalizeCityText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The 28 states and 8 union territories, each with the short forms people
 * actually type. Seller sign-up takes state as free text, so "MP", "M.P." and
 * "madhya pradesh" must all mean Madhya Pradesh or a real seller is quietly left
 * without a town. Keep in step with frontend/src/modules/admin/permissions/
 * indianStates.ts (catalogParity.test.ts checks it).
 */
const STATE_ROWS: Array<[string, ...string[]]> = [
  ["Andaman and Nicobar Islands", "an", "andaman nicobar islands"],
  ["Andhra Pradesh", "ap"],
  ["Arunachal Pradesh", "ar"],
  ["Assam", "as"],
  ["Bihar", "br"],
  ["Chandigarh", "ch"],
  ["Chhattisgarh", "cg", "ct", "chattisgarh"],
  ["Dadra and Nagar Haveli and Daman and Diu", "dn", "dd", "daman and diu", "dadra and nagar haveli"],
  ["Delhi", "dl", "nct of delhi", "new delhi"],
  ["Goa", "ga"],
  ["Gujarat", "gj"],
  ["Haryana", "hr"],
  ["Himachal Pradesh", "hp"],
  ["Jammu and Kashmir", "jk", "j and k"],
  ["Jharkhand", "jh"],
  ["Karnataka", "ka"],
  ["Kerala", "kl"],
  ["Ladakh", "la"],
  ["Lakshadweep", "ld"],
  ["Madhya Pradesh", "mp"],
  ["Maharashtra", "mh"],
  ["Manipur", "mn"],
  ["Meghalaya", "ml"],
  ["Mizoram", "mz"],
  ["Nagaland", "nl"],
  ["Odisha", "od", "or", "orissa"],
  ["Puducherry", "py", "pondicherry"],
  ["Punjab", "pb"],
  ["Rajasthan", "rj"],
  ["Sikkim", "sk"],
  ["Tamil Nadu", "tn"],
  ["Telangana", "ts", "tg"],
  ["Tripura", "tr"],
  ["Uttar Pradesh", "up"],
  ["Uttarakhand", "uk", "ut", "uttaranchal"],
  ["West Bengal", "wb"],
];

export const INDIAN_STATES: readonly string[] = STATE_ROWS.map((row) => row[0]);

/** Lower-case, dots and apostrophes dropped, "&" read as "and". */
const stateText = (value: unknown): string =>
  normalizeCityText(value).replace(/[.']/g, "").replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ");

const STATE_LOOKUP = new Map<string, string>();
for (const [name, ...forms] of STATE_ROWS) {
  for (const form of [name, ...forms]) STATE_LOOKUP.set(stateText(form), name);
}

/** The official name if the text is a recognised state or short form, else the text as typed. */
export function canonicalState(value: unknown): string {
  if (typeof value !== "string") return "";
  return STATE_LOOKUP.get(stateText(value)) ?? value.trim();
}

/** Comparison key: two spellings of one state give the same key. */
export const stateKey = (value: unknown): string => stateText(canonicalState(value));

/**
 * A town's slug is its name plus its state, so Aurangabad in Maharashtra and
 * Aurangabad in Bihar are different towns. Older towns keep the slug they were
 * created with (name only); the slug is an opaque identifier, nothing parses it.
 */
export const townSlug = (name: string, state?: string | null): string =>
  slugifyCity(state ? `${name} ${canonicalState(state)}` : name);

export interface TownHit {
  _id: unknown;
  name: string;
  state?: string | null;
}

export type TownPick<T extends TownHit> =
  | { kind: "none" }
  | { kind: "matched"; town: T }
  | { kind: "ambiguous"; towns: T[] }
  | { kind: "state-mismatch"; towns: T[] };

/**
 * Choose the town for a seller, from the towns whose name or alias matches the
 * seller's city text. The ONE rule shared by the sign-up hook and the mapping
 * script, so they cannot disagree.
 *
 *  - no seller state: a single match is used; several are ambiguous.
 *  - seller state given: only towns in that state (or with no state recorded)
 *    count. None left means the city exists, but elsewhere: state-mismatch, and
 *    the seller is reported instead of being put in the wrong state's town.
 */
export function pickTown<T extends TownHit>(hits: T[], sellerState?: unknown): TownPick<T> {
  if (hits.length === 0) return { kind: "none" };

  const want = sellerState ? stateKey(sellerState) : "";
  const pool = want ? hits.filter((t) => !t.state || stateKey(t.state) === want) : hits;

  if (pool.length === 0) return { kind: "state-mismatch", towns: hits };
  if (pool.length === 1) return { kind: "matched", town: pool[0] };
  return { kind: "ambiguous", towns: pool };
}

const citySchema = new Schema<ICity>(
  {
    name: {
      type: String,
      required: [true, "Town name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    aliases: {
      type: [String],
      default: [],
      // Stored already normalised so matching is a plain equality test.
      set: (values: string[]) =>
        Array.isArray(values)
          ? [...new Set(values.map(normalizeCityText).filter(Boolean))]
          : [],
    },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

citySchema.index({ aliases: 1 });
citySchema.index({ isActive: 1, name: 1 });

const City =
  (mongoose.models.City as mongoose.Model<ICity>) || model<ICity>("City", citySchema);

export default City;
