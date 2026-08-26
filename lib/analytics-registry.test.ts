/**
 * Structural tests for ANALYTICS.md.
 *
 * CLAUDE.md makes that file the registry of every event we send and requires it
 * to change in the same commit as any feature change, so it is edited often, by
 * hand, and read by both people and agents. It is now ~50 rows of GFM tables.
 *
 * It broke once in exactly one way: a note was inserted mid-table with a blank
 * line before it. A blank line closes a GFM table, so the nine rows below it
 * stopped rendering as a table and became a paragraph of literal pipes — while
 * still looking perfectly correct in the diff and in any plain-text editor. The
 * failure is invisible precisely where it is edited, which is what makes it
 * worth a test rather than care.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/** A GFM alignment row: `|---|---|`, optionally with colons. */
function isDelimiterRow(line: string): boolean {
  const s = line.trim();
  if (!s.startsWith("|") || !s.includes("-")) return false;
  return [...s.replace(/[|\s]/g, "")].every((c) => c === "-" || c === ":");
}

/**
 * Every line that looks like a table row but is not inside a table — that is,
 * not a header (the line above a delimiter), not the delimiter, and not part of
 * an unbroken run following one. These are the rows a reader never sees as a
 * table.
 */
export function orphanedTableRows(markdown: string): { line: number; text: string }[] {
  const lines = markdown.split("\n");
  const orphans: { line: number; text: string }[] = [];
  let insideTable = false;

  lines.forEach((line, i) => {
    const looksLikeRow = line.trimStart().startsWith("|");
    if (looksLikeRow && isDelimiterRow(lines[i + 1] ?? "")) {
      insideTable = true; // header row
      return;
    }
    if (isDelimiterRow(line)) return;
    if (looksLikeRow) {
      if (!insideTable) orphans.push({ line: i + 1, text: line });
      return;
    }
    // Anything else — a blank line, prose, a blockquote — closes the table.
    insideTable = false;
  });

  return orphans;
}

// ── The checker itself, so a green result below means something ────────────

it("flags rows separated from their header by a blank line", () => {
  const broken = [
    "| Event | Fired when |",
    "|---|---|",
    "| `a_viewed` | thing happened |",
    "",
    "> A note about the above.",
    "| `b_clicked` | other thing |",
    "| `c_failed` | third thing |",
  ].join("\n");
  const orphans = orphanedTableRows(broken);
  assert.equal(orphans.length, 2, "both rows below the note are stranded");
  assert.match(orphans[0].text, /b_clicked/);
  assert.match(orphans[1].text, /c_failed/);
});

it("accepts a note placed after the table it describes", () => {
  const fine = [
    "| Event | Fired when |",
    "|---|---|",
    "| `a_viewed` | thing happened |",
    "| `b_clicked` | other thing |",
    "",
    "> A note about the above.",
  ].join("\n");
  assert.deepEqual(orphanedTableRows(fine), []);
});

it("accepts consecutive tables, each with its own header", () => {
  const fine = [
    "| Event | Fired when |",
    "|---|---|",
    "| `a_viewed` | thing |",
    "",
    "### Another section",
    "",
    "| Event | Fired when |",
    "|---|---|",
    "| `b_clicked` | thing |",
  ].join("\n");
  assert.deepEqual(orphanedTableRows(fine), []);
});

// ── The real file ──────────────────────────────────────────────────────────

it("every table row in ANALYTICS.md renders as part of a table", () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "ANALYTICS.md");
  const orphans = orphanedTableRows(readFileSync(path, "utf8"));
  assert.deepEqual(
    orphans,
    [],
    `ANALYTICS.md has rows that will not render as a table:\n${orphans
      .map((o) => `      line ${o.line}: ${o.text.slice(0, 80)}`)
      .join("\n")}\n    A blank line, blockquote or paragraph between a table's header and its\n    rows closes the table. Move the interrupting block below the table.`,
  );
});

if (failures.length) {
  console.error(`\nanalyticsRegistry: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`analyticsRegistry: all ${passed} tests passed`);
