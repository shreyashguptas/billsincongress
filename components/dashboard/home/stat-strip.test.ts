/**
 * The home stat strip's figures fit their cells at any browser font size.
 *
 * At a 24px browser font on a 390px phone, "12,946" was set at 2.5rem (60px)
 * in a 122px cell: it ran over the column rule and pushed the page sideways
 * (documentation/brand.md, "A row of facts must also fit the screen at a 24px
 * font"). `.stat-figure` in app/globals.css now caps the size at a share of the
 * narrowest cell. This reads that rule as text and works the phone layout
 * through: the component pulls in React, which does not load under `tsx`.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const strip = readFileSync(join(root, 'components/dashboard/home/stat-strip.tsx'), 'utf8');

// The widest figure the strip shows: five digits and a comma in Newsreader's
// tabular figures, measured at 2.965em ("19,832", and "88,888" the same).
const FIGURE_EM = 2.97;

const phone = /@utility stat-figure \{\n\s+--cell: calc\(50cqi - (\d+(?:\.\d+)?)rem\);\n\s+font-size: min\((\d+(?:\.\d+)?)rem, calc\(var\(--cell\) \* (\d*\.\d+)\)\);/.exec(css);
assert.ok(phone, 'app/globals.css no longer sizes .stat-figure from the narrowest phone cell.');
const [, padRem, maxRem, share] = phone.map(Number) as unknown as [never, number, number, number];
assert.ok(/@utility stat-strip \{[^}]*?container-type: inline-size;/.test(css), '.stat-strip is no longer a size container.');
assert.ok(strip.includes('stat-strip grid'), 'stat-strip.tsx no longer marks its grid as the size container.');
assert.ok(strip.includes("'stat-figure "), 'stat-strip.tsx no longer sets its figures with .stat-figure.');
assert.ok(!/text-\[(?:length:)?\d/.test(strip), 'stat-strip.tsx sets a fixed size on its figures again.');

let checked = 0;
for (const viewport of [320, 360, 390, 430, 639]) {
  for (const font of [16, 20, 24, 32]) {
    const gutter = font; // container-editorial's px-4 (1rem) below sm
    const stripW = viewport - 2 * gutter;
    const cell = stripW / 2 - padRem * font;
    const size = Math.min(maxRem * font, cell * share);
    assert.ok(
      FIGURE_EM * size <= cell,
      `${viewport}px at a ${font}px font: a ${size.toFixed(1)}px figure is ${(FIGURE_EM * size).toFixed(0)}px in a ${cell.toFixed(0)}px cell`,
    );
    checked++;
  }
}
// At the default font on a common phone the figure keeps its full 40px.
assert.equal(Math.min(maxRem * 16, ((390 - 32) / 2 - padRem * 16) * share), 40);

console.log(`stat-strip: figures fit their cells in ${checked} phone layouts`);
