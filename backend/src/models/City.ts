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
