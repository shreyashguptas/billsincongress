/**
 * Every state code on the home page's map is readable on its shade, in both
 * themes (WCAG 1.4.3, 4.5:1 for 13px text).
 *
 * In Day the two darkest shades set their codes in paper-coloured text, which
 * measured 3.71:1 (IL, MI, NY, OH, PA, NJ, CA…) and 2.64:1 (MA, OR, NV, IA,
 * IN…). This reads the theme tokens from app/globals.css, blends each shade
 * over the paper as the browser does, and checks the code's colour on it.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEAT_ALPHA, NIGHT_ON_INK_FROM_BIN } from './state-map-tiles';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const map = readFileSync(join(root, 'components/dashboard/home/state-map.tsx'), 'utf8');

type RGB = [number, number, number];

/** "28 80% 40%" → sRGB 0–255. */
function hsl(triplet: string): RGB {
  const [h, s, l] = triplet.trim().split(/\s+/).map((v) => parseFloat(v));
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function token(block: string, name: string): RGB {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  assert.ok(m, `--${name} not found`);
  return hsl(m[1]);
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const blend = (fg: RGB, bg: RGB, alpha: number): RGB =>
  [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;

const day = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));
const night = css.slice(css.indexOf('.dark {'));

// The component sets exactly the classes this test assumes.
assert.ok(
  map.includes("bin >= NIGHT_ON_INK_FROM_BIN ? 'text-ink dark:text-on-ink' : 'text-ink'"),
  'state-map.tsx no longer picks its code colour as this test checks it.',
);
assert.ok(map.includes('const ALPHA = HEAT_ALPHA;'), 'state-map.tsx no longer shades from HEAT_ALPHA.');

const rows: string[] = [];
for (const [theme, block] of [
  ['Day', day],
  ['Night', night],
] as const) {
  const paper = token(theme === 'Day' ? day : night, 'paper');
  const heat = token(block, 'heat');
  const ink = token(theme === 'Day' ? day : night, 'ink');
  const onInk = token(theme === 'Day' ? day : night, 'on-ink');
  HEAT_ALPHA.forEach((alpha, bin) => {
    const tile = blend(heat, paper, alpha);
    const text = theme === 'Night' && bin >= NIGHT_ON_INK_FROM_BIN ? onInk : ink;
    const ratio = contrast(text, tile);
    rows.push(`${theme} bin ${bin}: ${ratio.toFixed(2)}:1`);
    assert.ok(ratio >= 4.5, `${theme}, shade ${bin} (${alpha}): the state code is ${ratio.toFixed(2)}:1, under 4.5:1`);
  });
}

console.log(`state-map-tiles: every code readable (${rows.join(', ')})`);
