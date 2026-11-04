/**
 * Nothing a reader needs is set under 13px, and every size follows the
 * reader's font setting.
 *
 * An audit in November 2026 found that on the phone home page nearly half of
 * all text was 9–12px: 9px state codes on the map, 10px month totals, 11px
 * eyebrows, 12px grey mono dates and source lines. The words that teach a
 * newcomer how to read a chart were the smallest on the page. They were also
 * in px, so a reader who raised the browser's default font got bigger
 * paragraphs and the same 9px labels.
 *
 * The rule (documentation/brand.md, "Type floor"):
 * - Sizes are rem. `text-xs` is 0.8125rem (13px at the default size) and it is
 *   the smallest size there is.
 * - `.label-eyebrow` is the one exception, at 0.75rem: its capitals stand as
 *   tall as 15px lowercase. It is defined once, in app/globals.css.
 *
 * So, in `app/`, `components/` and `lib/`, this fails on:
 * - a font size or line height in px: `text-[13px]`, `leading-[28px]`,
 *   `text-[length:min(128px,…)]`. Use a token (`text-caption`, `text-ui`,
 *   `text-meta`) or a rem value;
 * - a rem size under the floor: `text-[0.7rem]`;
 * - a numeric `fontSize` (`style={{ fontSize: 10 }}`, `fontSize={11}`), which
 *   is px by another name, under the floor; and any numeric or px `fontSize`
 *   in a style object outside the share cards.
 *
 * - 13px text in `ink-3` (`text-xs` or `text-caption` with `text-ink-3` in one
 *   class list): the faintest grey is 14px and up.
 *
 * The share cards in `lib/og/` are images drawn at a fixed size, so px is
 * right there; they are still held to the floor. Do not add an exception
 * here to make a size fit; make the room instead.
 *
 * Run with: `pnpm test`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FLOOR_REM = 0.8125; // 13px at the browser's default
const SOURCE = /^(app|components|lib)\/.+\.(tsx?|css)$/;
// Drawn images at a fixed pixel size, not text in a page.
const FIXED_PX = /^lib\/og\//;
// The eyebrow's own definition is the one sanctioned size under the floor.
const ALLOWED = [{ file: "app/globals.css", text: "text-[0.75rem] font-sans font-semibold uppercase" }];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => SOURCE.test(f));

if (files.length === 0) {
  console.error("check-type-floor: git listed no source files; refusing to pass on nothing");
  process.exit(1);
}

type Rule = { re: RegExp; pxOnly?: boolean; why: (m: RegExpMatchArray) => string | null };
const RULES: Rule[] = [
  {
    // text-[13px], sm:leading-[30px], text-[length:min(128px,…)]
    re: /\b(?:text|leading)-\[[^\]\s]*?\d(?:\.\d+)?px[^\]\s]*\]/g,
    pxOnly: true,
    why: (m) => `${m[0]} is in px, which ignores the reader's font setting; use a token or rem`,
  },
  {
    // text-[0.7rem]. An `em` size is relative to its parent, so it is not checked.
    re: /\btext-\[(?:length:)?(\d*\.?\d+)rem\]/g,
    why: (m) => (Number(m[1]) < FLOOR_REM ? `${m[0]} is under the ${FLOOR_REM}rem floor` : null),
  },
  {
    // style={{ fontSize: 10 }} / fontSize="11" / fontSize={11}
    re: /fontSize[:=]\s*["'{]?\s*(\d+(?:\.\d+)?)\b/g,
    why: (m) => (Number(m[1]) < FLOOR_REM * 16 ? `${m[0]} is ${m[1]}px, under the floor` : null),
  },
  {
    // style={{ fontSize: 15 }} or fontSize: '15px' in a page: px by another name.
    re: /fontSize:\s*(?:\d+(?:\.\d+)?|["'`]\d+(?:\.\d+)?px["'`])/g,
    pxOnly: true,
    why: (m) => `${m[0]} is a px size in a style object; use a text-* class`,
  },
];

/**
 * `ink-3` is 14px and up (brand.md, "ink-3 is 14px and up"): one class list
 * that sets 13px (`text-xs`, `text-caption`) and `text-ink-3` unprefixed is
 * faint text under that size. Found in review: the composer's "/ opens Ask"
 * line, the footer's "to ask" and its On/Off, "Press /" in the home box. A
 * variant (`hover:`, `data-[state=on]:`) is a different state and not read.
 */
const SMALL = /(?:^|\s)(?:text-xs|text-caption)(?=\s|$)/;
const FAINT = /(?:^|\s)text-ink-3(?=\s|$)/;
function faintSmall(line: string): string[] {
  const hits: string[] = [];
  for (const m of line.matchAll(/(["'`])([^"'`]*)\1/g)) {
    if (SMALL.test(m[2]) && FAINT.test(m[2])) hits.push(m[2].trim().slice(0, 80));
  }
  return hits;
}

const offenders: string[] = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!file.startsWith("components/ui/")) {
      for (const hit of faintSmall(line)) {
        offenders.push(`${file}:${i + 1}: "${hit}" is 13px in ink-3; under 14px use ink-2`);
      }
    }
    if (ALLOWED.some((a) => a.file === file && line.includes(a.text))) return;
    for (const { re, pxOnly, why } of RULES) {
      if (pxOnly && FIXED_PX.test(file)) continue;
      for (const m of line.matchAll(re)) {
        const reason = why(m);
        if (reason) offenders.push(`${file}:${i + 1}: ${reason}`);
      }
    }
  });
}

if (offenders.length > 0) {
  console.error("\ncheck-type-floor: FAILED\n");
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error(
    `\nSizes are rem, and nothing a reader needs is under text-xs (${FLOOR_REM}rem, 13px at the\n` +
      'default) (documentation/brand.md, "Type floor"). Use text-xs or text-caption for the\n' +
      "smallest text, text-meta (14px) for dates, counts, chart keys and source lines.\n",
  );
  process.exit(1);
}
console.log(`check-type-floor: ${files.length} files, every size in rem and none under ${FLOOR_REM}rem`);
