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
const panel = readFileSync(join(root, 'components/answers/answer-panel.tsx'), 'utf8');

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
  assert.ok(nav.includes('h-14 sm:h-16'), 'navigation.tsx no longer uses h-14 / sm:h-16');
  assert.ok(!nav.includes('hidden md:block'), 'navigation.tsx has grown an md-only strip the heights do not count');

  const BORDER = 1;
  const byWidth = new Map(HEADER_H_PX.map((h) => [h.minWidth, h.height]));
  assert.equal(byWidth.get(0), 56 + BORDER, 'h-14 (56px) + the header border');
  assert.equal(byWidth.get(640), 64 + BORDER, 'sm:h-16 (64px) + the header border');
  assert.equal(byWidth.size, 2, 'one header row: a height per breakpoint where h-14 / sm:h-16 changes');
});

it("lays the header out by its own width, so the docked panel never covers it", () => {
  // Docked, the header is the window minus the panel: 1024px on a 1440px
  // screen. `xl:` still saw 1440, drew the 288px search field, and pushed
  // "Sign up" under the panel. The header's md/lg/xl are container queries.
  assert.ok(
    nav.includes('@container/site-header'),
    'the <header> in navigation.tsx is no longer the site-header container.',
  );
  const viewport = nav.match(/(?<![\w-])(md|lg|xl|2xl):[\w[-]/g);
  assert.equal(
    viewport,
    null,
    `navigation.tsx uses window breakpoints (${viewport?.join(', ')}); use header-md: / header-lg: / ` +
      'header-xl:, or the docked panel covers whatever they lay out.',
  );
  // `sm:` is a window breakpoint in px, and the header's container variants are
  // in em. At a 20px browser font a 640px window is a 512px-at-16px header, and
  // `sm:` there showed "Sign in" and the 21px wordmark, which ran the logo
  // under Ask. In the header row it may only set the height (which
  // lib/ask-panel.ts mirrors) and the menu sheet's padding (the sheet is
  // portaled outside the container, and copies the row's media-query padding).
  const rowFiles = {
    'components/navigation.tsx': nav,
    'components/auth/user-menu.tsx': readFileSync(join(root, 'components/auth/user-menu.tsx'), 'utf8'),
    'components/answers/header-ask.tsx': readFileSync(join(root, 'components/answers/header-ask.tsx'), 'utf8'),
  };
  for (const [file, source] of Object.entries(rowFiles)) {
    const widths = (source.match(/(?<![\w-])sm:[\w[\]().:-]+/g) ?? []).filter((c) => c !== 'sm:h-16' && c !== 'sm:px-6');
    assert.deepEqual(widths, [], `${file} lays out the header row with sm: (${widths.join(', ')}); use header-sm:.`);
  }
  // In em (px ÷ 16), so the header goes compact sooner when the reader has a
  // larger browser font; at the default size these are Tailwind's widths.
  for (const [name, px] of [['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280]] as const) {
    assert.ok(
      css.includes(`@custom-variant header-${name} {\n  @container site-header (min-width: ${px / 16}em) {`),
      `app/globals.css does not define header-${name} at ${px / 16}em (${px}px at the default font size), the width of Tailwind's ${name}.`,
    );
  }
});

it("makes the panel's title bar as tall as the site header from lg up", () => {
  // Docked, the panel runs full height beside the header, so the two bottom
  // rules must meet in one line. A bar sized by its own padding sat ~10px
  // higher than the header's rule — the seam this assertion exists to stop.
  assert.ok(
    panel.includes('lg:h-(--header-h)'),
    'answer-panel.tsx no longer sizes its title bar to --header-h; docked, its bottom rule ' +
      "will not line up with the site header's.",
  );
});

it('keeps the panel under the portaled dialogs and over the page', () => {
  // Radix dialogs (rate limit, welcome, mobile nav, every Select) portal to the
  // end of <body> at z-50 and must win; the sponsor combobox listbox is z-30
  // and must lose.
  assert.ok(css.includes('z-index: 45'), '.ask-panel no longer sits at z-index 45');
});

// The page wrapper (app/template.tsx) holds every page's content — not the
// navigation or the ask panel, which live in the layout outside {children}. A
// fill mode that keeps the last keyframe leaves `matrix(1, 0, 0, 1, 0, 0)` on
// it, not `none`, which turns it into the containing block for every
// `position: fixed` descendant (see the page-in note in globals.css). Only a
// comment stood between `backwards` and a revert to the usual `both`, and
// nothing on screen says anything is wrong until something fixed scrolls away
// with the page.
it('lets the page-enter animation leave no transform behind', () => {
  const rule = css.match(/\.animate-page-in\s*\{([^}]*)\}/);
  assert.ok(rule, 'globals.css has no .animate-page-in rule to check.');
  const decl = rule[1];
  assert.ok(
    /animation\s*:[^;]*\bpage-in\b/.test(decl),
    '.animate-page-in no longer runs the page-in animation; update this test with it.',
  );
  assert.ok(
    !/\b(both|forwards)\b/.test(decl),
    '.animate-page-in fills forwards (`both` or `forwards`). The finished animation then ' +
      'keeps an identity transform on the page wrapper, and every position: fixed element ' +
      'inside a page is pinned to the page instead of the viewport. Use `backwards`.',
  );
});

it('puts Ask in the header exactly where the corner pill is not drawn', () => {
  // The pill is pinned over the page, so on a phone it sat on the Republicans'
  // counts in the home hero, a bill's "Sep 2026" and the end of every title.
  // Below the rail breakpoint and under 500px tall, Ask is in the header
  // instead. The two must be complementary: a gap leaves a width with no way
  // in at all, an overlap brings the covering pill back.
  const where = `@media (max-width: ${RAIL_MIN_VIEWPORT_PX - 1}.98px), (max-height: 499.98px) {`;
  const at = css.indexOf(where);
  assert.ok(at >= 0, `globals.css has no "${where}" block deciding where Ask lives.`);
  const block = css.slice(at, css.indexOf('\n}', at));
  assert.ok(
    block.includes('.ask-header-button { display: inline-flex !important; }'),
    'the header Ask button is not shown below the rail breakpoint and under 500px tall.',
  );
  assert.ok(
    block.includes(".ask-launcher { display: none; }"),
    'the corner pill is still drawn where Ask is in the header.',
  );
  assert.ok(
    css.includes('.ask-header-button { display: none !important; }'),
    'the header Ask button is not hidden by default, so a computer would show it beside the pill.',
  );
  assert.ok(nav.includes('<HeaderAsk '), 'navigation.tsx no longer mounts <HeaderAsk />.');
  // Under 500px tall the header scrolls away, so the sheet must not start under it.
  assert.ok(nav.includes('short:relative'), 'the header no longer scrolls away under 500px tall.');
  assert.ok(
    css.includes('@media (max-height: 499.98px) {\n  .ask-panel { top: 0; }'),
    'the panel still starts under a header that has scrolled away in a short window.',
  );
});

it('scrolls focused items clear of the sticky header and the reserved Ask room', () => {
  assert.ok(
    css.includes('scroll-padding-top: calc(var(--header-h) + 0.75rem);'),
    'html has no scroll-padding-top for the sticky header: Shift+Tab leaves cards under it.',
  );
  assert.ok(
    css.includes('scroll-padding-bottom: calc(var(--ask-reserve) + 0.75rem);'),
    'html has no scroll-padding-bottom for the Ask pill or bar.',
  );
  const footer = readFileSync(join(root, 'components/footer.tsx'), 'utf8');
  assert.ok(footer.includes('var(--ask-reserve)'), 'the footer no longer pads by --ask-reserve.');
});

it('reserves room for Ask only where something floats at the foot of the page', () => {
  // One number, --ask-reserve, pays for the pill twice: the footer's bottom
  // padding and the scroll padding that keeps a control reached with Tab clear
  // of it. Zero where Ask is in the header; the pill's height plus a gap on a
  // computer; the bar's height while a phone conversation is set aside.
  assert.ok(css.includes(':root { --ask-reserve: 0px; }'), '--ask-reserve no longer defaults to 0.');
  const pill = `@media (min-width: ${RAIL_MIN_VIEWPORT_PX}px) and (min-height: 500px) {\n  :root { --ask-reserve: calc(`;
  assert.ok(css.includes(pill), 'the page no longer reserves room for the corner pill where it is drawn.');
  assert.ok(
    css.includes("html[data-ask='minimized'] { --ask-reserve: calc(3.25rem"),
    'the page no longer reserves the height of the phone\'s "Back to your questions" bar.',
  );
});

it('tucks the corner pill on scroll only where it is drawn, never under reduced motion', () => {
  const launcher = readFileSync(join(root, 'components/answers/ask-launcher.tsx'), 'utf8');
  const where = `@media (min-width: ${RAIL_MIN_VIEWPORT_PX}px) and (min-height: 500px) and (prefers-reduced-motion: no-preference) {`;
  const at = css.indexOf(where);
  assert.ok(at >= 0, `globals.css has no "${where}" block: the pill would move for readers who asked for no motion.`);
  const block = css.slice(at, css.indexOf('\n}', at));
  assert.ok(
    block.includes(".ask-launcher[data-tucked='true']:not(:focus-visible)"),
    'the tucked pill must come back when it takes keyboard focus.',
  );
  assert.ok(block.includes('pointer-events: none'), 'a tucked pill can still be clicked where it is invisible.');
  assert.equal(
    (css.match(/data-tucked='true'/g) ?? []).length,
    1,
    'the pill is tucked somewhere outside the computer, motion-allowed block.',
  );
  assert.ok(launcher.includes('data-tucked='), 'ask-launcher.tsx no longer sets data-tucked.');
  assert.ok(
    launcher.includes(`'(min-width: ${RAIL_MIN_VIEWPORT_PX}px) and (min-height: 500px)'`),
    'ask-launcher.tsx tucks at a different size than the CSS draws the pill.',
  );
  assert.ok(
    launcher.includes("matchMedia('(prefers-reduced-motion: reduce)')"),
    'ask-launcher.tsx no longer checks reduced motion before tucking.',
  );
});

// At 1024x768 and 1440x900 every bill page loaded with the pill faded out over
// its status card and no Ask in the header: a laptop reader's first screen of a
// bill had nothing to click to ask.
it('keeps Ask in the header at every width on a bill page, from the server render', () => {
  assert.ok(
    css.includes(".ask-header-button[data-everywhere='true'] { display: inline-flex !important; }"),
    'globals.css no longer shows the header Ask at every width where data-everywhere is set.',
  );
  assert.ok(
    nav.includes('const askHere = askInHeaderOnly(pathname);') && nav.includes('<HeaderAsk everywhere={askHere} />'),
    'navigation.tsx no longer decides from the path that a bill page keeps Ask in the header.',
  );
  const header = readFileSync(join(root, 'components/answers/header-ask.tsx'), 'utf8');
  assert.ok(header.includes("data-everywhere={everywhere ? 'true' : undefined}"), 'header-ask.tsx no longer sets data-everywhere.');
  assert.ok(
    panel.includes('launcherVisible(phase, askInHeaderOnly(pathname))'),
    'answer-panel.tsx still draws the closed pill on a page whose Ask is in the header.',
  );
  assert.ok(!css.includes('data-covering'), 'the faded-out pill over the status card is back.');
  // From 1024px to 1279px the row only fits with the search as its icon.
  assert.ok(nav.includes('<HeaderSearch compact={askHere} />'), 'the header search no longer makes room for Ask on a bill page.');
});

// 844x390, /bills/131hr119: Ask opened from the header, Shift+Tab out of the
// panel landed on "Sign up", hidden under the full-height panel (WCAG 2.4.11).
it('makes the header inert while the panel covers it in a short window', () => {
  assert.ok(
    css.includes('@media (max-height: 499.98px) {\n  .ask-panel { top: 0; }'),
    'the panel no longer starts at the very top in a short window; revisit the inert header.',
  );
  assert.ok(
    panel.includes('`(max-height: 499.98px) and (max-width: ${DOCK_MIN_VIEWPORT_PX - 0.02}px)`'),
    'answer-panel.tsx no longer watches for a short window where the panel covers the header.',
  );
  assert.ok(
    panel.includes("document.querySelector<HTMLElement>('.ask-shell > header')") && panel.includes('h.inert = short.matches'),
    'answer-panel.tsx no longer makes the header inert while the panel covers it.',
  );
  assert.ok(panel.includes('h.inert = false'), 'answer-panel.tsx leaves the header inert after the panel closes.');
});

console.log(`\nask-css-contract: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

// The four sections jumped up to 170px between the home page, /bills and a bill
// page, because the right-hand cluster differs per page and pushed them in a
// 1fr | auto | 1fr row. Each header width now reserves the widest cluster.
it('holds the header sections in one place on every page', () => {
  for (const cls of ['header-md:min-w-[15.25rem]', 'header-lg:min-w-[29rem]', 'header-xl:min-w-[34rem]']) {
    assert.ok(nav.includes(cls), `navigation.tsx no longer reserves the right cluster's width (${cls}).`);
  }
  assert.ok(nav.includes("!compact && 'header-lg:block'"), 'a bill page draws the search field again, which no longer fits the reserved width.');
});

// The feedback card stacks above the closed pill; a bill page draws no closed pill.
it('drops the feedback card to the corner where no pill is drawn', () => {
  assert.ok(
    css.includes(".found-it-prompt { bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); }") &&
      css.includes("html:not([data-ask='minimized']):has(.ask-header-button[data-everywhere='true']) .found-it-prompt"),
    'globals.css no longer moves the feedback card down on a page with no closed pill.',
  );
});

