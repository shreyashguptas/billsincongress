/**
 * Refresh .truth-cache/ — a local, READ-ONLY copy of the production tables the
 * answer-accuracy harness scores against.
 *
 * WHY A DUMP AT ALL. The harness has to compute ground truth from code that
 * shares nothing with the answer engine. A checker built on fetchDataset would
 * agree with every bug in fetchDataset, so it would have blessed all 41 defects
 * in the 2026-08-30 audit. Raw rows on disk, counted by hand-written loops in
 * questions.ts, are the only independent oracle available.
 *
 * PRIVACY — READ BEFORE EDITING. A Convex snapshot is the WHOLE deployment. It
 * contains users, chats, chatMessages, authSessions, authAccounts and every
 * other table, i.e. readers' identities and everything they have ever asked.
 * None of that belongs in a scratch directory on a laptop, so:
 *   - only the eight tables in TABLES are ever taken out of the zip, one at a
 *     time with `unzip -p`, so the personal tables are never written to disk at
 *     all;
 *   - the zip itself is deleted in a `finally`, including when the export or an
 *     extraction throws, and on Ctrl-C (see shredOnSignal);
 *   - any stale *.jsonl left in .truth-cache/ by an older revision of this
 *     script (which may have extracted more) is deleted too.
 * .truth-cache/ is gitignored. Keep it that way.
 *
 * READ ONLY. `convex export` reads; nothing here writes to production. Do not
 * add a deploy, a mutation or an import to this file.
 *
 * Run:
 *   export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)
 *   ./node_modules/.bin/tsx scripts/truth/dump.ts
 *
 * NOT part of `pnpm test`: it needs production credentials and downloads ~170MB.
 * Named dump.ts, not dump.test.ts, so the suite's *.test.ts discovery cannot
 * pick it up.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const CACHE_DIR = ".truth-cache";
const ZIP_PATH = join(CACHE_DIR, "snapshot.zip");

/**
 * The only tables that leave the snapshot. Every one of them is public record —
 * bills and what Congress did to them. Adding a table here is a privacy
 * decision, not a convenience: check it holds nothing about a reader first.
 */
const TABLES = [
  "bills",
  "billActions",
  "congressSponsors",
  "congressStats",
  "congressPolicyAreas",
  "congressChamberBreakdowns",
  "billSummaries",
  "billSubjects",
] as const;

const KEY_HELP =
  "CONVEX_DEPLOY_KEY is not set, so there is no deployment to export from.\n\n" +
  "  export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)\n" +
  "  ./node_modules/.bin/tsx scripts/truth/dump.ts\n\n" +
  "The key selects the deployment on its own — do NOT also pass --prod, and do\n" +
  "not point this at a dev deployment: the harness scores what readers actually\n" +
  "get, which is production.";

/** Delete the snapshot. Called from `finally`, so it must never throw. */
function shredZip(): void {
  try {
    if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH, { force: true });
  } catch (error) {
    console.error(
      `COULD NOT DELETE ${ZIP_PATH}: ${error instanceof Error ? error.message : String(error)}\n` +
        "It contains users, chats and auth sessions. Delete it by hand, now.",
    );
  }
}

/**
 * Make the zip's deletion survive an interrupt.
 *
 * Ctrl-C is the likeliest way this script ends early: `convex export` takes
 * minutes and people stop it. With no listener registered, node's default SIGINT
 * handling terminates the process WITHOUT running the `finally` in main(), so
 * the snapshot — users, chats, chatMessages, authSessions — is left sitting in
 * .truth-cache/. Verified against node directly: a try/finally around a blocking
 * child deletes nothing when the process is SIGINT'd, and does delete once a
 * listener exists. Registering the listener is most of the fix; the handler
 * shreds the zip itself for the case where the interrupt lands between the
 * export and the extraction.
 */
function shredOnSignal(): void {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      shredZip();
      console.error(`\nInterrupted (${signal}). ${ZIP_PATH} has been deleted.`);
      process.exit(130);
    });
  }
}

/** `<table>/documents.jsonl` for each table in the zip, keyed by table name. */
function entriesByTable(): Map<string, string> {
  const listing = execFileSync("unzip", ["-Z1", ZIP_PATH], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const byTable = new Map<string, string>();
  for (const entry of listing.split("\n")) {
    const name = entry.trim();
    if (!name.endsWith("/documents.jsonl")) continue;
    // Tolerate a wrapping directory: the table is the last path segment before
    // documents.jsonl, wherever the export chooses to root itself.
    const parts = name.split("/");
    byTable.set(parts[parts.length - 2], name);
  }
  return byTable;
}

/**
 * Stream one table out of the zip. Written to `<table>.jsonl.tmp` and renamed,
 * because other agents' tests read this directory while a dump is running and a
 * half-written bills.jsonl would fail them with a JSON parse error that looks
 * like a bug in their own code.
 */
function extractTable(table: string, entry: string): number {
  const finalPath = join(CACHE_DIR, `${table}.jsonl`);
  const tmpPath = `${finalPath}.tmp`;
  const fd = openSync(tmpPath, "w");
  try {
    const result = spawnSync("unzip", ["-p", ZIP_PATH, entry], {
      stdio: ["ignore", fd, "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`unzip -p exited ${result.status} for '${entry}'`);
    }
  } finally {
    closeSync(fd);
  }
  const bytes = statSync(tmpPath).size;
  if (bytes === 0) {
    rmSync(tmpPath, { force: true });
    throw new Error(
      `'${entry}' came out empty. A zero-row table would silently turn every ` +
        `question about it into a confident wrong answer, so this is fatal.`,
    );
  }
  renameSync(tmpPath, finalPath);
  return bytes;
}

/** Anything in .truth-cache/ that is not one of TABLES has no business there. */
function removeStrays(): void {
  const keep = new Set<string>(TABLES.map((t) => `${t}.jsonl`));
  for (const name of readdirSync(CACHE_DIR)) {
    if (keep.has(name)) continue;
    rmSync(join(CACHE_DIR, name), { force: true, recursive: true });
    console.log(`  removed stray ${name}`);
  }
}

function main(): void {
  if (!process.env.CONVEX_DEPLOY_KEY) {
    console.error(KEY_HELP);
    process.exit(1);
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  // Registered before anything can create the zip, so there is no window in
  // which an interrupt leaves one behind.
  shredOnSignal();
  // `convex export` refuses an occupied path, and a leftover zip is a privacy
  // problem in its own right.
  shredZip();

  try {
    console.log(`Exporting production tables to ${ZIP_PATH} ...`);
    // No --include-file-storage: that flag only ADDS stored files, and we want
    // strictly less than the default, not more.
    execFileSync("npx", ["convex", "export", "--path", ZIP_PATH], { stdio: "inherit" });

    const byTable = entriesByTable();
    const missing = TABLES.filter((t) => !byTable.has(t));
    if (missing.length > 0) {
      throw new Error(
        `The snapshot has no rows for: ${missing.join(", ")}.\n` +
          `Found: [${[...byTable.keys()].sort().join(", ")}]\n` +
          `Refusing to write a partial cache — ground truth computed from a ` +
          `missing table is not "unknown", it is zero, and a confident zero is ` +
          `exactly the defect this harness exists to catch.`,
      );
    }

    for (const table of TABLES) {
      const bytes = extractTable(table, byTable.get(table) as string);
      console.log(`  ${table}.jsonl — ${(bytes / 1_000_000).toFixed(1)} MB`);
    }
  } finally {
    // The snapshot holds users, chats, chatMessages and authSessions. It does
    // not survive this script, whatever happened above.
    shredZip();
  }

  removeStrays();
  console.log(
    `\nDone. ${TABLES.length} public tables in ${CACHE_DIR}/; the snapshot and every ` +
      `table it held about readers are gone.`,
  );
}

main();
