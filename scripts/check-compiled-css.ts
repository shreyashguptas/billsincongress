/**
 * The compiled stylesheet must be valid CSS.
 *
 * In November 2026 one class, `touchable:[@media(min-width:18em)]:inline`,
 * stacked an arbitrary media variant under the custom `touchable:` variant.
 * Tailwind 3 compiled it to `@media\(min-width:18em\)\undefined { … }`. The
 * dev compiler could not parse that line, dropped the stylesheet, and every
 * page fell back to Times New Roman: no fonts, no tokens. Type checks and unit
 * tests all passed, because nothing read the compiled CSS.
 *
 * So this runs app/globals.css through the project's own PostCSS setup
 * (Tailwind, scanning every class in the app) and fails on:
 * - an arbitrary media variant (`[@media(...)]:`) nested inside another
 *   variant's media query, which is the shape the dev compiler breaks on;
 * - an at-rule whose name is not a real CSS at-rule;
 * - the word "undefined" anywhere in the output, which is how Tailwind writes
 *   a variant it could not resolve.
 *
 * Fix the class, do not add an exception here. A media query a variant cannot
 * express goes in app/globals.css as a named class.
 *
 * Run with: `pnpm test` (it is one of the guards in scripts/run-tests.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'app/globals.css');

const KNOWN_AT_RULES = new Set([
  'charset', 'container', 'counter-style', 'font-face', 'font-feature-values',
  'font-palette-values', 'import', 'keyframes', 'layer', 'media', 'namespace',
  'page', 'property', 'scope', 'starting-style', 'supports', 'view-transition',
  '-webkit-keyframes',
]);

async function main() {
  // Tailwind 4: the whole configuration is app/globals.css, and `base` is
  // where it scans for class names.
  const result = await postcss([tailwindcss({ base: root, optimize: false })]).process(
    readFileSync(source, 'utf8'),
    { from: source },
  );
  const css = result.css;
  const problems: string[] = [];

  result.root.walkAtRules((rule) => {
    // Tailwind builds an arbitrary variant's at-rule with its query glued to the
    // name ("media(min-width:18em)"), so split the real name off first.
    const name = rule.name.split('(')[0];
    const glued = name !== rule.name;
    const where = rule.parent?.type === 'atrule' ? `inside "@${(rule.parent as postcss.AtRule).name} ${(rule.parent as postcss.AtRule).params}"` : 'at the top level';
    if (!KNOWN_AT_RULES.has(name)) {
      problems.push(`unknown at-rule "@${rule.name}" ${where}`);
    }
    // At the top level "@media(...)" is fine. Nested inside another variant's
    // media query (`touchable:[@media(...)]:`), the dev compiler turns it into
    // "@media\(...\)\undefined" and drops the whole stylesheet.
    if (name === 'media' && glued && rule.parent?.type === 'atrule') {
      problems.push(`"@${rule.name}" is an arbitrary media variant stacked under another variant, ${where}`);
    }
  });
  for (const match of css.matchAll(/undefined/g)) {
    const line = css.slice(0, match.index).split('\n').length;
    const text = css.split('\n')[line - 1].trim().slice(0, 120);
    problems.push(`"undefined" on line ${line} of the compiled CSS: ${text}`);
  }

  if (problems.length) {
    console.error('✗ check-compiled-css: the compiled stylesheet is broken');
    for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
    console.error('  A class Tailwind cannot compile makes the dev server drop every style. Find the class and');
    console.error('  rewrite it (a stacked arbitrary media variant belongs in app/globals.css as a named class).');
    process.exit(1);
  }
  console.log(`✓ check-compiled-css: ${css.length.toLocaleString('en-US')} characters of compiled CSS, all valid`);
}

main().catch((err) => {
  console.error('✗ check-compiled-css failed to run:', err);
  process.exit(1);
});
