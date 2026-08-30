/**
 * Unit tests for the /bills filter registry and its URL round trip.
 *
 * Almost every assertion here corresponds to a bug that actually shipped:
 *
 *  - `chamber` was plumbed through the service and Convex but never parsed from
 *    the URL, so the filter silently did not exist. Test 1 makes a filter that
 *    is not wired end to end fail the suite.
 *  - A non-numeric `?congress=abc` rendered the chip "NaNth Congress".
 *  - A whitespace-only title counted as an active filter, producing a "Clear
 *    all" strip with nothing to clear.
 *  - A bookmarked value the picker no longer offered was dropped from its own
 *    option list, so opening the picker wiped the filter.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import {
  FILTERS,
  FILTER_BY_FIELD,
  activeFilterCount,
  activeFilters,
  isSet,
  scanLimitedActive,
  type FilterOptionContext,
} from "./filter-registry";
import { buildFilterQuery, filtersFromQuery } from "./filter-url";
import {
  DEFAULT_FILTER_VALUES,
  filterSignature,
  type BillsFilterValues,
} from "../../app/bills/filter-signature";
import { ALL_HUBS, policyAreaFromSlug, topicSlug } from "../hubs";
import { POLICY_AREAS, STATE_NAMES, STATE_OPTIONS } from "../constants/filters";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

const ctx = (over: Partial<FilterOptionContext> = {}): FilterOptionContext => ({
  congressNumbers: [117, 118, 119],
  sponsors: [],
  currentValue: "all",
  chamber: "all",
  ...over,
});

/** A representative non-default value for each filter. */
const SAMPLE: Record<string, string | string[]> = {
  policyArea: "Health",
  status: "100",
  chamber: "senate",
  sponsor: ["Maria Salazar", "Smith, John"],
  state: "CA",
  billType: "hjres",
  introducedDate: "month",
  lastActionDate: "week",
  congress: "118",
  title: "clean water & air = good",
  billNumber: "7540",
};

// --- 1. end-to-end wiring -------------------------------------------------

it("has exactly one registry entry per BillsFilterValues key, and vice versa", () => {
  const fields = FILTERS.map((f) => f.field).sort();
  const keys = Object.keys(DEFAULT_FILTER_VALUES).sort();
  assert.deepEqual(
    fields,
    keys,
    "a filter wired into state but not the registry is invisible to the UI, the URL and analytics — this is exactly how `chamber` went missing",
  );
  assert.equal(new Set(fields).size, fields.length, "duplicate registry field");
});

it("gives every filter a unique kind and a unique URL param", () => {
  const kinds = FILTERS.map((f) => f.kind);
  const params = FILTERS.map((f) => f.param);
  assert.equal(new Set(kinds).size, kinds.length, "duplicate filter_kind");
  assert.equal(new Set(params).size, params.length, "duplicate URL param");
});

it("changes the signature when any single filter changes", () => {
  const base = filterSignature(DEFAULT_FILTER_VALUES);
  for (const definition of FILTERS) {
    const next = {
      ...DEFAULT_FILTER_VALUES,
      [definition.field]: SAMPLE[definition.field],
    } as BillsFilterValues;
    assert.notEqual(
      filterSignature(next),
      base,
      `${definition.field} is missing from filterSignature — the client would think the server already applied it and skip the refetch`,
    );
  }
});

it("distinguishes a comma-containing sponsor name from two sponsors", () => {
  const one = { ...DEFAULT_FILTER_VALUES, sponsor: ["Smith, John"] };
  const two = { ...DEFAULT_FILTER_VALUES, sponsor: ["Smith", "John"] };
  assert.notEqual(filterSignature(one), filterSignature(two));
});

// --- 2. URL round trip ----------------------------------------------------

it("round-trips every filter through the URL, one at a time", () => {
  for (const definition of FILTERS) {
    const values = {
      ...DEFAULT_FILTER_VALUES,
      [definition.field]: SAMPLE[definition.field],
    } as BillsFilterValues;
    const back = filtersFromQuery(buildFilterQuery(values));
    assert.deepEqual(
      back,
      values,
      `${definition.field} does not survive the URL round trip`,
    );
  }
});

it("round-trips every filter set at once", () => {
  const values = { ...DEFAULT_FILTER_VALUES } as BillsFilterValues;
  for (const definition of FILTERS) {
    (values[definition.field] as string | string[]) = SAMPLE[definition.field];
  }
  assert.deepEqual(filtersFromQuery(buildFilterQuery(values)), values);
});

it("survives titles containing URL metacharacters", () => {
  for (const title of ["a & b", "a=b", "a#b", "a+b", "a%20b", "50% of it", "a b"]) {
    const values = { ...DEFAULT_FILTER_VALUES, title };
    assert.equal(filtersFromQuery(buildFilterQuery(values)).title, title, title);
  }
});

it("emits nothing at all for the default filter set", () => {
  assert.equal(buildFilterQuery(DEFAULT_FILTER_VALUES), "");
});

it("never emits a page parameter", () => {
  const values = { ...DEFAULT_FILTER_VALUES, policyArea: "Health" };
  assert.equal(buildFilterQuery(values).includes("page="), false);
});

it("de-duplicates repeated sponsor params", () => {
  const back = filtersFromQuery("?sponsor=A&sponsor=A&sponsor=B");
  assert.deepEqual(back.sponsor, ["A", "B"]);
});

it("ignores empty parameter values rather than treating them as set", () => {
  const back = filtersFromQuery("?policyArea=&title=&sponsor=");
  assert.deepEqual(back, DEFAULT_FILTER_VALUES);
  assert.equal(activeFilterCount(back), 0);
});

// --- 3. active-filter accounting -----------------------------------------

it("counts nothing as active for the default set", () => {
  assert.equal(activeFilterCount(DEFAULT_FILTER_VALUES), 0);
  assert.deepEqual(activeFilters(DEFAULT_FILTER_VALUES), []);
});

it("does not treat an empty sponsor array as active", () => {
  assert.equal(isSet([]), false);
  assert.equal(activeFilterCount({ ...DEFAULT_FILTER_VALUES, sponsor: [] }), 0);
});

it("counts each set filter exactly once", () => {
  const values = {
    ...DEFAULT_FILTER_VALUES,
    policyArea: "Health",
    status: "100",
    sponsor: ["A", "B", "C"],
  };
  assert.equal(activeFilterCount(values), 3, "three sponsors are one filter");
});

// --- 4. describe() --------------------------------------------------------

it("describes every non-default value as non-empty text", () => {
  for (const definition of FILTERS) {
    const label = definition.describe(SAMPLE[definition.field]);
    assert.ok(
      typeof label === "string" && label.trim().length > 0,
      `${definition.field} produced an empty chip label`,
    );
  }
});

it("never renders NaN for a non-numeric congress", () => {
  const congress = FILTER_BY_FIELD.congress;
  for (const bad of ["abc", "", "12x", "-"]) {
    const label = congress.describe(bad);
    assert.equal(
      label.includes("NaN"),
      false,
      `congress "${bad}" produced "${label}" — bills-client.tsx used to render "NaNth Congress" here`,
    );
  }
});

it("describes multiple sponsors as a count, one sponsor by name", () => {
  const sponsor = FILTER_BY_FIELD.sponsor;
  assert.equal(sponsor.describe(["Jane Doe"]), "Jane Doe");
  assert.equal(sponsor.describe(["A", "B"]), "2 sponsors");
});

// --- 5. options() never hides the current value ---------------------------

it("always offers the currently applied value in its own option list", () => {
  const cases: Array<[string, string]> = [
    ["status", "90"], // a stage that holds no bills and is not offered
    ["policyArea", "Some Retired Area"],
    ["state", "ZZ"],
    ["billType", "hres"],
    ["congress", "42"],
    ["chamber", "house"],
  ];
  for (const [field, currentValue] of cases) {
    const definition = FILTER_BY_FIELD[field];
    const options = definition.options(ctx({ currentValue }));
    assert.ok(
      options.some((o) => o.value === currentValue),
      `${field}=${currentValue} is missing from its own option list — opening the picker would silently wipe the filter`,
    );
  }
});

it("does not duplicate a current value that is already offered", () => {
  const options = FILTER_BY_FIELD.status.options(ctx({ currentValue: "100" }));
  assert.equal(options.filter((o) => o.value === "100").length, 1);
});

it("opens every single-select picker with a clearing row", () => {
  for (const definition of FILTERS) {
    if (definition.multi) continue;
    const options = definition.options(ctx());
    if (options.length === 0) continue; // free-text filters have no list
    assert.equal(
      options[0].value,
      "all",
      `${definition.field}'s picker does not start with a clear row`,
    );
  }
});

it("narrows the kind list to the chosen chamber", () => {
  const kinds = FILTER_BY_FIELD.billType;
  const house = kinds.options(ctx({ chamber: "house" })).map((o) => o.value);
  assert.equal(house.includes("hr"), true);
  assert.equal(house.includes("s"), false, "Senate kinds cannot match House bills");
  const senate = kinds.options(ctx({ chamber: "senate" })).map((o) => o.value);
  assert.equal(senate.includes("s"), true);
  assert.equal(senate.includes("hr"), false);
});

// --- 6. hub paths ---------------------------------------------------------

it("resolves every hubPath to a hub that actually exists", () => {
  const known = new Set(ALL_HUBS.map((h) => h.path));
  for (const definition of FILTERS) {
    if (!definition.hubPath) continue;
    for (const option of definition.options(ctx())) {
      const path = definition.hubPath(option.value);
      if (path === null) continue;
      assert.ok(
        known.has(path),
        `${definition.field}=${option.value} points at ${path}, which is not a hub`,
      );
    }
  }
});

it("keeps every policy area round-tripping through its topic slug", () => {
  for (const area of POLICY_AREAS) {
    assert.equal(
      policyAreaFromSlug(topicSlug(area)),
      area,
      `${area} does not survive slugification — its filter value and its hub page have drifted apart`,
    );
  }
});

// --- 7. option-list hygiene ----------------------------------------------

it("offers every state jurisdiction, sorted by name", () => {
  assert.equal(STATE_OPTIONS.length, Object.keys(STATE_NAMES).length);
  const labels = STATE_OPTIONS.map((o) => o.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  for (const option of STATE_OPTIONS) {
    assert.ok(STATE_NAMES[option.value], `${option.value} is not a known state`);
  }
});

it("offers no permanently-empty outcome in the picker", () => {
  // Stages 80, 90 and 95 hold zero bills in every Congress we carry; lib/hubs.ts
  // documents the same measurement and builds no hub pages for them.
  const offered = FILTER_BY_FIELD.status.options(ctx()).map((o) => o.value);
  for (const dead of ["80", "90", "95"]) {
    assert.equal(offered.includes(dead), false, `stage ${dead} is always empty`);
  }
});

it("still labels a retired outcome that arrives from a bookmark", () => {
  assert.equal(FILTER_BY_FIELD.status.describe("90"), "To President");
});

// --- 8. truncation accounting --------------------------------------------

it("marks exactly the filters Convex applies over a capped scan", () => {
  // narrowestIndexFor() in convex/bills.ts knows only policyArea, progressStage
  // and congress; everything else is filtered in memory over MAX_LIST_SCAN.
  const limited = FILTERS.filter((f) => f.scanLimited).map((f) => f.kind).sort();
  assert.deepEqual(limited, [
    "bill_type",
    "chamber",
    "introduced_date",
    "last_action_date",
    "sponsor",
    "state",
  ]);
});

it("reports which active filters are scan-limited", () => {
  const values = {
    ...DEFAULT_FILTER_VALUES,
    policyArea: "Health",
    state: "WY",
    chamber: "senate",
  };
  assert.deepEqual(scanLimitedActive(values).sort(), ["chamber", "state"]);
  assert.deepEqual(scanLimitedActive(DEFAULT_FILTER_VALUES), []);
});

if (failures.length > 0) {
  console.error(
    `\nfilter-registry: ${passed} passed, ${failures.length} FAILED\n`,
  );
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`filter-registry: all ${passed} tests passed`);
