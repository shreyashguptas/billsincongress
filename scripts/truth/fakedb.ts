/**
 * A local stand-in for Convex's `ctx.db`, so the REAL fetch handlers can be run
 * against REAL production rows without deploying anything.
 *
 * WHY THIS EXISTS. Every accuracy defect found in the 2026-08-30 audit lived in
 * the interaction between a handler, an index, and a scan cap — which is exactly
 * the part that unit tests over pure modules cannot reach and that a fixture with
 * three invented rows will never reproduce. "Health bills that became law returns
 * 0" only happens when there are 2,121 Health bills and the 200 newest are all in
 * committee. So the tests that matter need the real distribution.
 *
 * WHAT IT GUARANTEES. Index ordering here mirrors Convex: rows are ordered by the
 * index fields in turn, then by `_creationTime`, ascending; `.order("desc")`
 * reverses that; `.take(n)` reads a prefix. Index DEFINITIONS are parsed out of
 * convex/schema.ts at load time rather than restated here, so this file cannot
 * drift from the schema — if a handler asks for an index the schema does not
 * define, it throws instead of silently returning everything, which is the failure
 * mode that would make a green test meaningless.
 *
 * WHAT IT DOES NOT GUARANTEE. `withSearchIndex` is an approximation: real Convex
 * full-text search has its own tokenizer and relevance ranking, and this returns
 * term-overlap matches ordered by overlap count. Tests must therefore assert set
 * membership and filter behaviour for search, never exact ranking or exact row
 * order. Everything else — the eq/range index reads that all the accuracy defects
 * actually involve — is faithful.
 *
 * Not part of `pnpm test`'s hermetic unit suite by itself; the handler tests that
 * use it skip cleanly when .truth-cache is absent.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = ".truth-cache";
const SCHEMA_PATH = "convex/schema.ts";

export type Row = Record<string, any>;

/** Index name -> the fields it is ordered by, in order. */
export type TableIndexes = Record<string, string[]>;
export interface SearchIndexDef {
  searchField: string;
  filterFields: string[];
}

// ---------------------------------------------------------------------------
// Schema parsing — the fake's indexes ARE the schema's indexes.
// ---------------------------------------------------------------------------

export interface ParsedSchema {
  indexes: Record<string, TableIndexes>;
  searchIndexes: Record<string, Record<string, SearchIndexDef>>;
}

export function parseSchema(source: string): ParsedSchema {
  const indexes: Record<string, TableIndexes> = {};
  const searchIndexes: Record<string, Record<string, SearchIndexDef>> = {};

  // Table blocks start at column 2, e.g. `  bills: defineTable({`.
  const tableStart = /^ {2}(\w+): defineTable\(/gm;
  const starts: Array<{ name: string; at: number }> = [];
  for (const m of source.matchAll(tableStart)) {
    starts.push({ name: m[1], at: m.index ?? 0 });
  }

  for (let i = 0; i < starts.length; i++) {
    const name = starts[i].name;
    const block = source.slice(starts[i].at, starts[i + 1]?.at ?? source.length);
    indexes[name] = {};
    searchIndexes[name] = {};

    for (const m of block.matchAll(/\.index\(\s*"([^"]+)"\s*,\s*\[([^\]]*)\]/g)) {
      const fields = [...m[2].matchAll(/"([^"]+)"/g)].map((f) => f[1]);
      indexes[name][m[1]] = fields;
    }
    for (const m of block.matchAll(
      /\.searchIndex\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    )) {
      const body = m[2];
      const searchField = /searchField:\s*"([^"]+)"/.exec(body)?.[1] ?? "";
      const filterBlock = /filterFields:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? "";
      searchIndexes[name][m[1]] = {
        searchField,
        filterFields: [...filterBlock.matchAll(/"([^"]+)"/g)].map((f) => f[1]),
      };
    }
  }
  return { indexes, searchIndexes };
}

// ---------------------------------------------------------------------------
// Ordering — Convex's comparator.
// ---------------------------------------------------------------------------

/**
 * Convex orders values by type first: undefined < null < number < string. Within
 * a type, natural order. Getting this wrong matters: `progressStage` is optional,
 * so rows missing it sort before every numbered stage, and a range read that
 * assumed otherwise would quietly return the wrong window.
 */
function typeRank(v: unknown): number {
  if (v === undefined) return 0;
  if (v === null) return 1;
  if (typeof v === "boolean") return 2;
  if (typeof v === "number") return 3;
  if (typeof v === "string") return 4;
  return 5;
}

export function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return 0;
}

function compareByFields(fields: string[]) {
  return (x: Row, y: Row): number => {
    for (const f of fields) {
      const c = compareValues(x[f], y[f]);
      if (c !== 0) return c;
    }
    // Convex breaks ties on _creationTime. This is the ordering that made
    // "the 200 newest bills in a topic" mean "the 200 most recently SYNCED".
    return compareValues(x._creationTime, y._creationTime);
  };
}

// ---------------------------------------------------------------------------
// Index range builder — the `q` passed to withIndex.
// ---------------------------------------------------------------------------

type Bound = { op: "eq" | "gt" | "gte" | "lt" | "lte"; field: string; value: unknown };

class IndexRangeBuilder {
  readonly bounds: Bound[] = [];
  constructor(private readonly fields: string[], private readonly indexName: string) {}

  private assertField(field: string, op: string) {
    const used = this.bounds.length;
    const expected = this.fields[used];
    if (expected !== field) {
      throw new Error(
        `Index '${this.indexName}' is ordered by [${this.fields.join(", ")}]; ` +
          `position ${used} must constrain '${expected}', not '${field}' (.${op}). ` +
          `Convex rejects out-of-order index constraints — so does this.`,
      );
    }
  }
  eq(field: string, value: unknown) {
    this.assertField(field, "eq");
    this.bounds.push({ op: "eq", field, value });
    return this;
  }
  gt(field: string, value: unknown) {
    this.assertField(field, "gt");
    this.bounds.push({ op: "gt", field, value });
    return this;
  }
  gte(field: string, value: unknown) {
    this.assertField(field, "gte");
    this.bounds.push({ op: "gte", field, value });
    return this;
  }
  lt(field: string, value: unknown) {
    this.assertField(field, "lt");
    this.bounds.push({ op: "lt", field, value });
    return this;
  }
  lte(field: string, value: unknown) {
    this.assertField(field, "lte");
    this.bounds.push({ op: "lte", field, value });
    return this;
  }
}

function matchesBounds(row: Row, bounds: Bound[]): boolean {
  for (const b of bounds) {
    const c = compareValues(row[b.field], b.value);
    if (b.op === "eq" && c !== 0) return false;
    if (b.op === "gt" && c <= 0) return false;
    if (b.op === "gte" && c < 0) return false;
    if (b.op === "lt" && c >= 0) return false;
    if (b.op === "lte" && c > 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Search index builder — approximate, deliberately.
// ---------------------------------------------------------------------------

class SearchFilterBuilder {
  term = "";
  readonly eqs: Array<{ field: string; value: unknown }> = [];
  constructor(private readonly def: SearchIndexDef, private readonly indexName: string) {}
  search(field: string, term: string) {
    if (field !== this.def.searchField) {
      throw new Error(
        `Search index '${this.indexName}' searches '${this.def.searchField}', not '${field}'.`,
      );
    }
    this.term = term;
    return this;
  }
  eq(field: string, value: unknown) {
    if (!this.def.filterFields.includes(field)) {
      throw new Error(
        `Search index '${this.indexName}' has no filterField '${field}'. ` +
          `Declared: [${this.def.filterFields.join(", ")}].`,
      );
    }
    this.eqs.push({ field, value });
    return this;
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

class FakeQuery {
  private rows: Row[];
  private direction: "asc" | "desc" = "asc";
  private ordered = false;

  constructor(
    private readonly table: string,
    private readonly all: Row[],
    private readonly schema: ParsedSchema,
  ) {
    this.rows = all;
  }

  withIndex(name: string, fn?: (q: IndexRangeBuilder) => IndexRangeBuilder): FakeQuery {
    const fields = this.schema.indexes[this.table]?.[name];
    if (!fields) {
      throw new Error(
        `No index '${name}' on table '${this.table}' in convex/schema.ts. ` +
          `Available: [${Object.keys(this.schema.indexes[this.table] ?? {}).join(", ")}]. ` +
          `A handler reading an index that does not exist would fail in production too.`,
      );
    }
    const builder = new IndexRangeBuilder(fields, name);
    if (fn) fn(builder);
    this.rows = this.all
      .filter((r) => matchesBounds(r, builder.bounds))
      .sort(compareByFields(fields));
    this.ordered = true;
    return this;
  }

  withSearchIndex(name: string, fn: (q: SearchFilterBuilder) => SearchFilterBuilder): FakeQuery {
    const def = this.schema.searchIndexes[this.table]?.[name];
    if (!def) throw new Error(`No search index '${name}' on table '${this.table}'.`);
    const builder = new SearchFilterBuilder(def, name);
    fn(builder);
    const terms = builder.term
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const scored: Array<{ row: Row; score: number }> = [];
    for (const row of this.all) {
      if (!builder.eqs.every((e) => compareValues(row[e.field], e.value) === 0)) continue;
      const hay = String(row[def.searchField] ?? "").toLowerCase();
      const score = terms.filter((t) => hay.includes(t)).length;
      if (score > 0) scored.push({ row, score });
    }
    // Approximate relevance: more matched terms first. Real Convex ranks
    // differently, so tests using this must not assert exact order.
    scored.sort((a, b) => b.score - a.score || compareValues(a.row._creationTime, b.row._creationTime));
    this.rows = scored.map((s) => s.row);
    this.ordered = true;
    return this;
  }

  order(direction: "asc" | "desc"): FakeQuery {
    this.direction = direction;
    return this;
  }

  private materialise(): Row[] {
    let out = this.rows;
    if (!this.ordered) out = [...out].sort(compareByFields([]));
    return this.direction === "desc" ? [...out].reverse() : out;
  }

  async take(n: number): Promise<Row[]> {
    return this.materialise().slice(0, n);
  }
  async collect(): Promise<Row[]> {
    return this.materialise();
  }
  async first(): Promise<Row | null> {
    return this.materialise()[0] ?? null;
  }
  async unique(): Promise<Row | null> {
    const rows = this.materialise();
    if (rows.length > 1) throw new Error(`unique() matched ${rows.length} rows`);
    return rows[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// The db and ctx
// ---------------------------------------------------------------------------

export class FakeDb {
  constructor(
    private readonly tables: Record<string, Row[]>,
    private readonly schema: ParsedSchema,
  ) {}

  query(table: string): FakeQuery {
    const rows = this.tables[table];
    if (!rows) {
      throw new Error(
        `Table '${table}' was not loaded into the fake db. ` +
          `Loaded: [${Object.keys(this.tables).join(", ")}]. ` +
          `Add it to scripts/truth/dump.ts and re-run the dump.`,
      );
    }
    return new FakeQuery(table, rows, this.schema);
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of Object.values(this.tables)) {
      const hit = rows.find((r) => r._id === id);
      if (hit) return hit;
    }
    return null;
  }

  rowsOf(table: string): Row[] {
    return this.tables[table] ?? [];
  }
}

export interface FakeCtx {
  db: FakeDb;
}

export function cacheAvailable(): boolean {
  return existsSync(join(CACHE_DIR, "bills.jsonl"));
}

/**
 * Exit code a test uses when it cannot run for want of the production copy.
 *
 * A distinct code, not 0, because the runner has to be able to tell "passed"
 * from "did not run". `pnpm test` printed "0 failed" while every one of the
 * accuracy assertions silently skipped in CI — a green result that had proved
 * nothing about the thing it exists to prove.
 */
export const TRUTH_CACHE_SKIP_EXIT = 3;

/**
 * Set REQUIRE_TRUTH_CACHE=1 to turn that skip into a failure. Used by the
 * pre-merge gate for anything touching convex/catalog.
 */
export function truthCacheRequired(): boolean {
  return process.env.REQUIRE_TRUTH_CACHE === "1";
}

/** Message printed by tests that need the cache and cannot find it. */
export const CACHE_MISSING_MESSAGE =
  `SKIPPED — no ${CACHE_DIR}/ found. These tests run the real fetch handlers against a local ` +
  `copy of production. Create it with:\n` +
  `  export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)\n` +
  `  ./node_modules/.bin/tsx scripts/truth/dump.ts`;

function readTable(name: string): Row[] {
  const path = join(CACHE_DIR, `${name}.jsonl`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

let cached: FakeCtx | null = null;

/**
 * Load the fake context. Cached across calls in one process: the bills table is
 * 55,000 rows and several test files use it.
 */
export function loadFakeCtx(
  tables: string[] = [
    "bills",
    "billActions",
    "billSummaries",
    "congressSponsors",
    "congressStats",
    "congressPolicyAreas",
    "congressChamberBreakdowns",
  ],
): FakeCtx {
  if (cached) return cached;
  const schema = parseSchema(readFileSync(SCHEMA_PATH, "utf8"));
  const loaded: Record<string, Row[]> = {};
  for (const t of tables) loaded[t] = readTable(t);
  cached = { db: new FakeDb(loaded, schema) };
  return cached;
}
