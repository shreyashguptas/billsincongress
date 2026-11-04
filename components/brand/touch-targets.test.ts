/**
 * Every small stand-alone control the shared pieces render answers a click
 * like a 24px target under a mouse and a tap like a 44px one under a finger
 * (documentation/brand.md, "Input, not width"; WCAG 2.2, 2.5.8).
 *
 * A review on phones and a touchscreen laptop measured "Ask about this →" at
 * 111x20, the footer's "Pro" at 22px wide, the source link at 16px tall, the
 * sponsor's name at 26px and the theme switch at 40px. The fix lives in the
 * primitives, so every page that uses them gets it: real controls grow to 44px
 * through `touchable:`, and text links get `.touch-hit` (app/globals.css), an
 * invisible box centred on the link. Nothing else in the suite would notice if
 * a later edit, or a re-run of `shadcn add`, dropped one of them, so this reads
 * the files as text: the components pull in React, Next and Radix, which do
 * not load under `tsx`. `pnpm check:touch` measures the real page; this keeps
 * the pieces it relies on in place.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

it('the helper gives 24px under a mouse and 44px under a finger', () => {
  const css = read('app/globals.css');
  assert.match(css, /\.touch-hit,\s*\.touch-hit-links a \{ --hit-min: 24px; \}/, 'the mouse minimum is 24px');
  assert.match(css, /width: max\(100%, var\(--hit-min\)\)/);
  assert.match(css, /height: max\(100%, var\(--hit-min\)\)/);
  assert.match(
    css,
    /@media \(any-pointer: coarse\) \{\s*\.touch-hit,\s*\.touch-hit-links a \{ --hit-min: 44px; \}/,
    'the touch minimum is 44px, on any coarse pointer (touchscreen laptops too)',
  );
  // Zero specificity: a control that is itself `absolute` keeps its position.
  assert.match(css, /:where\(\.touch-hit, \.touch-hit-links a\) \{ position: relative; \}/);
});

/** [file, a fragment that must stay, what it covers] */
const PIECES: Array<[string, RegExp, string]> = [
  ['components/ui/button.tsx', /variant: 'link', class: 'touch-hit /, 'every Button variant="link"'],
  ['components/ui/toggle.tsx', /default: "[^"]*touchable:h-11 touchable:min-w-11"/, 'Toggle and ToggleGroup, default size'],
  ['components/ui/toggle.tsx', /sm: "[^"]*touchable:h-11 touchable:min-w-11"/, 'Toggle and ToggleGroup, small size'],
  ['components/ui/select.tsx', /flex h-10 w-full[^']*touchable:h-11/, 'the Select trigger'],
  ['components/brand/section.tsx', /cn\('meta touch-hit-links'/, 'every link in a SourceLine'],
  ['components/answers/ask-about.tsx', /'touch-hit text-ink-2/, '"Ask about this →" (every section header action)'],
  ['components/dashboard/home/shared.tsx', /'link touch-hit focus-ring/, '"Browse bills →"'],
  ['components/footer.tsx', /const linkClass =\s*'touch-hit [^']*touchable:min-h-11'/, 'every footer link'],
  ['components/footer.tsx', /className="touch-hit focus-ring[^"]*"\s*>\s*Congress\.gov/, 'the footer source link'],
  ['components/bills/bill-details.tsx', /className="touch-hit focus-ring inline-flex items-center gap-1\.5[^"]*"\s*>\s*<ArrowLeft/, 'the bill page "All bills" link'],
  ['components/bills/bill-details.tsx', /className="touch-hit focus-ring rounded-sm hover:underline"/, 'the sponsor link'],
  ['components/bills/bill-related.tsx', /className="touch-hit focus-ring inline-block[^"]*touchable:py-3"/, 'the bill page hub links (44px rows)'],
  ['components/bills/bill-cosponsors.tsx', /className="touch-hit focus-ring inline-flex max-w-full/, 'each cosponsor name'],
  ['components/bills/bill-cosponsors.tsx', /className="touch-hit focus-ring inline-flex min-h-8[^"]*touchable:min-h-11"/, 'each cosponsor account (the one-letter "X")'],
  ['components/podcast-promo.tsx', /className="link touch-hit/, 'the podcast links'],
  ['app/bills/_hub/hub-view.tsx', /className="touch-hit[^"]*">Home</, 'the hub breadcrumb'],
  ['components/theme/mode-toggle.tsx', /touchable:h-11 touchable:w-auto touchable:min-w-11/, 'the theme switch'],
];

for (const [file, pattern, what] of PIECES) {
  it(`${what} keeps its target (${file})`, () => {
    assert.match(read(file), pattern);
  });
}

it('a wrapped row of touch-hit links keeps its lines apart on touch', () => {
  // Without it, two 44px boxes overlap and the lower link steals the upper's taps.
  assert.match(read('components/bills/bill-related.tsx'), /gap-y-3 text-sm touchable:gap-y-0/);
  assert.match(read('components/podcast-promo.tsx'), /gap-y-1\.5 text-sm touchable:gap-y-6/);
  assert.match(read('components/dashboard/home/topic-wheel.tsx'), /gap-y-2 touchable:gap-y-6/);
});

it('the theme switch names each theme on touch', () => {
  assert.match(read('components/theme/mode-toggle.tsx'), /<span className="hidden text-caption touchable:\[@media\(min-width:18em\)\]:inline">\{opt\.label\}<\/span>/);
});

it('a dotted Term answers over its own line, never the next one', () => {
  // A 44px .touch-hit box on a 26px line covered the line below: a tap on
  // "119th Congress" in the home hero opened "Sponsor", and on a member page
  // "Representative" opened "district".
  const term = read('components/brand/term.tsx');
  assert.ok(!/['" ]touch-hit['" ]/.test(term), 'components/brand/term.tsx gives the trigger .touch-hit again');
  assert.match(term, /standalone \? 'term-hit-solo' : 'term-hit'/);
  const css = read('app/globals.css');
  assert.match(css, /\.term-hit \{ padding-block: max\(0px, calc\(\(1lh - 1\.3em\) \/ 2\)\); \}/);
  assert.match(css, /@media \(any-pointer: coarse\) \{\s*\.term-hit-solo \{ --hit-min: 44px; \}/);
});

it('the logo answers a tap over 44px each way, even as the mark alone', () => {
  // The mark alone is 25px wide; a box that only grew up and down was 25x42.
  assert.match(read('components/brand/logo.tsx'), /touchable:before:-inset-y-\[13px\] touchable:before:-left-2 touchable:before:-right-3/);
});

it('a link\'s arrow is hidden from screen readers', () => {
  assert.match(read('components/brand/arrow.tsx'), /<span aria-hidden="true">→<\/span>/);
  for (const file of ['components/answers/ask-about.tsx', 'components/dashboard/home/shared.tsx', 'components/bills/bill-related.tsx']) {
    const source = read(file);
    assert.match(source, /<Arrow \/>/, `${file} draws its arrow with <Arrow />`);
  }
});

if (failures.length > 0) {
  console.error(`touch-targets: ${failures.length} failed\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`touch-targets: ${passed} passed`);
