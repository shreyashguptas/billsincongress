/**
 * The ask panel's geometry is stated twice: once in `lib/ask-panel.ts`, where
 * JavaScript can reason about it, and once in `app/globals.css`, where the
 * media queries actually decide the panel's shape.
 *
 * It has to be twice. Deciding the mode in JavaScript would mean reading
 * `window.innerWidth` during render, and the panel is mounted in the root
 * layout — so that would be a hydration mismatch on every page of the site.
 * CSS, in turn, cannot import a TypeScript constant.
 *
 * So the drift is guaranteed rather than merely possible, and this file is the
 * guard: it reads the stylesheet as text and asserts the numbers match. The
 * failure it prevents is quiet — a panel that pushes at one width while the
 * clamp protects a different one, leaving the content column narrower than any
 * `lg:` layout has ever been designed for, with nothing on screen to say so.
 *
 * The header heights are the same problem one layer down: the sheet is sized by
 * subtracting the header, so a stale value is a visible seam or an overlapped
 * navigation. They are checked against `components/navigation.tsx`'s own
 * classes, not against a copy of them.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOCK_MIN_VIEWPORT_PX,
  HEADER_H_PX,
  RAIL_MIN_VIEWPORT_PX,
  RAIL_PANEL_PX,
} from './ask-panel';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const nav = readFileSync(join(root, 'components/navigation.tsx'), 'utf8');

it('pushes the page at exactly the viewport the clamp protects', () => {
  assert.ok(
    css.includes(`@media (min-width: ${DOCK_MIN_VIEWPORT_PX}px)`),
    `globals.css has no @media (min-width: ${DOCK_MIN_VIEWPORT_PX}px) block — the push ` +
      'and the width clamp would be protecting different viewports.',
  );
});

it('switches to the floating rail at the viewport the module says it does', () => {
  assert.ok(
    css.includes(`@media (min-width: ${RAIL_MIN_VIEWPORT_PX}px)`),
    `globals.css has no @media (min-width: ${RAIL_MIN_VIEWPORT_PX}px) block.`,
  );
  assert.ok(
    css.includes(`--ask-rail-w: ${RAIL_PANEL_PX}px`),
    `globals.css does not set --ask-rail-w to ${RAIL_PANEL_PX}px.`,
  );
});

it('locks scrolling below the rail breakpoint and not above it', () => {
  // The .98 is the standard half-open boundary: a max-width query must stop one
  // sub-pixel short of where the min-width query starts, or both match at once.
  assert.ok(
    css.includes(`@media (max-width: ${RAIL_MIN_VIEWPORT_PX - 1}.98px)`),
    `globals.css has no @media (max-width: ${RAIL_MIN_VIEWPORT_PX - 1}.98px) block.`,
  );
});

it('declares a --header-h for every breakpoint the module lists', () => {
  for (const { minWidth, height } of HEADER_H_PX) {
    assert.ok(
      css.includes(`--header-h: ${height}px`),
      `globals.css never sets --header-h to ${height}px (the height at >= ${minWidth}px).`,
    );
    if (minWidth > 0) {
      assert.ok(
        css.includes(`@media (min-width: ${minWidth}px) { :root { --header-h: ${height}px; } }`),
        `globals.css does not set --header-h to ${height}px at min-width ${minWidth}px.`,
      );
    }
  }
});

it('derives the header heights from the navigation the reader actually sees', () => {
  // Read back off the component rather than trusting a copied number: the sheet
  // is positioned by subtracting these, so being wrong is visible immediately.
  assert.ok(nav.includes('flex h-14 sm:h-16'), 'navigation.tsx no longer uses h-14 / sm:h-16');
  assert.ok(nav.includes('hidden md:block'), 'navigation.tsx no longer has an md-only eyebrow');
  assert.ok(nav.includes('flex h-7'), 'the eyebrow strip is no longer h-7');

  const BORDER = 1;
  const byWidth = new Map(HEADER_H_PX.map((h) => [h.minWidth, h.height]));
  assert.equal(byWidth.get(0), 56 + BORDER, 'h-14 (56px) + the header border');
  assert.equal(byWidth.get(640), 64 + BORDER, 'sm:h-16 (64px) + the header border');
  assert.equal(
    byWidth.get(768),
    64 + BORDER + 28 + BORDER,
    'sm:h-16 + border + the h-7 eyebrow + its own border',
  );
});

it('keeps the panel under the portaled dialogs and over the page', () => {
  // Radix dialogs (rate limit, welcome, mobile nav, every Select) portal to the
  // end of <body> at z-50 and must win; the sponsor combobox listbox is z-30
  // and must lose.
  assert.ok(css.includes('z-index: 45'), '.ask-panel no longer sits at z-index 45');
});

console.log(`\nask-css-contract: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
