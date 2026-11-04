/**
 * A dotted Term goes only in a running sentence, never on a heading
 * (documentation/brand.md, "Term"): a dotted rule on a headline reads as a
 * broken link. The design review found two anyway, both new: the home page's
 * h2 "88.1% of bills and resolutions haven't made it out of committee" and a
 * bill's h2 "1 member cosponsors this bill", each with a dotted word.
 *
 * Reads every component as text (the components pull in React, Next and
 * Radix, which do not load under `tsx`) and fails on a `<Term>` or
 * `<TermText>` inside an `<h1>`–`<h6>` element or a `SectionHeader`'s
 * `title`, which it renders as an h2.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.tsx'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && (f.startsWith('app/') || f.startsWith('components/')));

/** The text of every heading element and every SectionHeader title in a file. */
function headingSpans(source: string): string[] {
  const spans: string[] = [];
  for (const m of source.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)) spans.push(m[2]);
  // A SectionHeader's title={…}: read to its matching brace.
  for (const m of source.matchAll(/<SectionHeader\b/g)) {
    const at = source.indexOf('title={', m.index);
    const next = source.indexOf('<SectionHeader', m.index + 1);
    if (at < 0 || (next >= 0 && at > next)) continue;
    let depth = 0;
    let i = at + 'title='.length;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) break;
    }
    spans.push(source.slice(at, i));
  }
  return spans;
}

const hasTerm = (span: string) => /<Term(?:Text)?\b/.test(span);

let failed = 0;

// The checker itself, on the two headlines the review found.
assert.ok(
  headingSpans('<h2 id="x" className="y">1 member <Term id="cosponsor">cosponsors</Term> this bill</h2>').some(hasTerm),
);
assert.ok(
  headingSpans(
    '<SectionHeader eyebrow="Where" finding title={<>out of <Term id="committee">committee</Term>.</>} action={<A />} />',
  ).some(hasTerm),
);
assert.ok(!headingSpans('<h2>Words to know</h2><p>A <Term id="bill">bill</Term></p>').some(hasTerm));

for (const file of files) {
  const source = readFileSync(join(root, file), 'utf8');
  if (!source.includes('<Term')) continue;
  for (const span of headingSpans(source)) {
    if (hasTerm(span)) {
      failed++;
      console.error(`  ✗ ${file}: a dotted Term inside a heading: ${span.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    }
  }
}

if (failed) {
  console.error(`\nterm-placement: ${failed} heading(s) carry a Term (documentation/brand.md, "Term")`);
  process.exit(1);
}
console.log(`term-placement: no Term in a heading across ${files.length} files`);
