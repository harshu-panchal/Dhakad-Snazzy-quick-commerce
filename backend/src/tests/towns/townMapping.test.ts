import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCityText, slugifyCity } from "../../models/City";
import {
  buildTownIndex,
  classifySellers,
  summarize,
  haversineKm,
  OUTLIER_KM,
} from "../../services/townMappingService";
import { TOWN_SEEDS } from "../../scripts/seedCities";

/**
 * Pure logic: no database. The towns here are built from the real seed list so
 * these tests exercise the same aliases that will run against live data.
 */

const towns = TOWN_SEEDS.map((seed, i) => ({
  _id: `town-${i}`,
  name: seed.name,
  aliases: seed.aliases.map(normalizeCityText),
}));

const seller = (
  id: string,
  city: string | null,
  extra: Record<string, unknown> = {},
) => ({ _id: id, storeName: `Store ${id}`, city, ...extra });

/* ------------------------------ normalisation ----------------------------- */

test("normalizeCityText trims, lower-cases and collapses whitespace", () => {
  assert.equal(normalizeCityText("  SARANGPUR "), "sarangpur");
  assert.equal(normalizeCityText("Biaora   rajgarh"), "biaora rajgarh");
  assert.equal(normalizeCityText("Khujner"), "khujner");
});

test("normalizeCityText tolerates non-strings", () => {
  assert.equal(normalizeCityText(undefined), "");
  assert.equal(normalizeCityText(null), "");
  assert.equal(normalizeCityText(42), "");
});

test("slugifyCity makes a stable url-safe slug", () => {
  assert.equal(slugifyCity("Narsinghgarh"), "narsinghgarh");
  assert.equal(slugifyCity("Biaora Rajgarh"), "biaora-rajgarh");
});

test("slugifyCity returns empty for a name with no latin characters", () => {
  // The API refuses such a name and asks for an alias instead.
  assert.equal(slugifyCity("ब्यावरा"), "");
});

/* ------------------------------ seed integrity ---------------------------- */

test("the seed has the six live towns, all in Rajgarh", () => {
  assert.deepEqual(
    TOWN_SEEDS.map((t) => t.name).sort(),
    ["Bhayana", "Biaora", "Khujner", "Narsinghgarh", "Pachore", "Sarangpur"],
  );
  assert.ok(TOWN_SEEDS.every((t) => t.district === "Rajgarh"));
});

test("no text maps to two seeded towns", () => {
  const index = buildTownIndex(towns);
  const clashes = [...index.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);
  assert.deepEqual(clashes, [], `seed aliases clash: ${clashes.join(", ")}`);
});

/* ------------------------------- classification --------------------------- */

test("the spellings found in live data map to the right towns", () => {
  const rows = classifySellers(
    [
      seller("1", "Biaora"),
      seller("2", "Biaora rajgarh"), // confirmed: same town as Biaora
      seller("3", "SARANGPUR"),
      seller("4", "Narasingarh"), // confirmed: same town as Narsinghgarh
      seller("5", "Narsinghgarh"),
      seller("6", "Khujner"),
      seller("7", "Pachore"),
      seller("8", "Bhayana"),
    ],
    towns,
  );

  const byId = Object.fromEntries(rows.map((r) => [r.sellerId, r]));
  assert.ok(rows.every((r) => r.status === "matched"), JSON.stringify(rows.map((r) => r.status)));
  assert.equal(byId["1"].townName, "Biaora");
  assert.equal(byId["2"].townName, "Biaora");
  assert.equal(byId["3"].townName, "Sarangpur");
  assert.equal(byId["4"].townName, "Narsinghgarh");
  assert.equal(byId["5"].townName, "Narsinghgarh");
  assert.equal(byId["6"].townName, "Khujner");
});

test("a Hindi spelling maps through its alias", () => {
  const [row] = classifySellers([seller("1", "ब्यावरा")], towns);
  assert.equal(row.status, "matched");
  assert.equal(row.townName, "Biaora");
});

test("the test data stays unmapped", () => {
  const rows = classifySellers(
    [seller("1", "Indore"), seller("2", "indore"), seller("3", "Khallikot")],
    towns,
  );
  assert.ok(rows.every((r) => r.status === "no-matching-town"));
  assert.ok(rows.every((r) => !r.townId), "an unmatched seller must not get a town");
});

test("a seller with no city text is reported, not guessed", () => {
  const rows = classifySellers([seller("1", null), seller("2", ""), seller("3", "   ")], towns);
  assert.ok(rows.every((r) => r.status === "no-city-text"));
});

test("an existing cityId is never reclassified", () => {
  const [row] = classifySellers(
    [seller("1", "Khujner", { cityId: "already-set" })],
    towns,
  );
  assert.equal(row.status, "already-mapped");
  assert.equal(row.townId, undefined);
});

test("text matching two towns is ambiguous and not mapped", () => {
  const clashing = [
    { _id: "a", name: "Alpha", aliases: ["shared"] },
    { _id: "b", name: "Beta", aliases: ["shared"] },
  ];
  const [row] = classifySellers([seller("1", "Shared")], clashing);
  assert.equal(row.status, "ambiguous");
  assert.match(row.detail!, /Alpha and Beta/);
});

/* --------------------------------- outliers ------------------------------- */

// Roughly the real Khujner coordinates, [lng, lat].
const KHUJNER: [number, number] = [76.612, 23.787];
const near = (dLng: number): { location: { coordinates: number[] } } => ({
  location: { coordinates: [KHUJNER[0] + dLng, KHUJNER[1]] },
});

test("a matched seller far from its town's other sellers is flagged", () => {
  const rows = classifySellers(
    [
      seller("1", "Khujner", near(0)),
      seller("2", "Khujner", near(0.01)),
      seller("3", "Khujner", near(0.02)),
      seller("4", "Khujner", near(0.9)), // ~90 km away
    ],
    towns,
  );

  const far = rows.find((r) => r.sellerId === "4")!;
  assert.equal(far.status, "location-outlier");
  assert.match(far.detail!, /km from the other Khujner sellers/);
  assert.equal(rows.filter((r) => r.status === "matched").length, 3);
});

test("sellers close together are not flagged", () => {
  const rows = classifySellers(
    [seller("1", "Khujner", near(0)), seller("2", "Khujner", near(0.02)), seller("3", "Khujner", near(0.04))],
    towns,
  );
  assert.ok(rows.every((r) => r.status === "matched"));
});

test("with fewer than three located sellers there is no outlier check", () => {
  // A median over two points would be meaningless.
  const rows = classifySellers(
    [seller("1", "Pachore", near(0)), seller("2", "Pachore", near(2))],
    towns,
  );
  assert.ok(rows.every((r) => r.status === "matched"));
});

test("a seller with no coordinates is matched by text alone", () => {
  const rows = classifySellers(
    [
      seller("1", "Khujner", near(0)),
      seller("2", "Khujner", near(0.01)),
      seller("3", "Khujner", near(0.02)),
      seller("4", "Khujner"),
    ],
    towns,
  );
  assert.equal(rows.find((r) => r.sellerId === "4")!.status, "matched");
});

test("haversine is roughly right", () => {
  // Khujner to Bhayana-area is single-digit km; Khujner to Biaora is ~33 km.
  const biaora = { lat: 23.926, lng: 76.914 };
  const khujner = { lat: 23.787, lng: 76.612 };
  const km = haversineKm(khujner, biaora);
  assert.ok(km > 28 && km < 38, `expected ~33 km, got ${km}`);
  assert.ok(OUTLIER_KM >= 20, "outlier threshold should exceed normal in-town spread");
});

/* ---------------------------------- summary ------------------------------- */

test("summarize counts every status and groups unmatched texts", () => {
  const rows = classifySellers(
    [
      seller("1", "Biaora"),
      seller("2", "Indore"),
      seller("3", "indore"),
      seller("4", "Khallikot"),
      seller("5", null),
      seller("6", "Khujner", { cityId: "x" }),
    ],
    towns,
  );

  const { counts, unmatchedTexts } = summarize(rows);
  assert.equal(counts.matched, 1);
  assert.equal(counts["no-matching-town"], 3);
  assert.equal(counts["no-city-text"], 1);
  assert.equal(counts["already-mapped"], 1);
  // "Indore" and "indore" are reported as the distinct texts they are.
  assert.deepEqual(
    unmatchedTexts.map((t) => t.text).sort(),
    ["Indore", "Khallikot", "indore"],
  );
});
