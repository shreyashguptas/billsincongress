/**
 * The Select must never leave bare text where React will later remove it.
 *
 * Radix copies the chosen item's text into the trigger through a React portal
 * and shows the placeholder as bare text in the same span. Chrome's "Translate
 * this page" replaces every bare text node with its own <font> elements, so
 * when the value changes or the page navigates away, React asks a parent to
 * remove a text node that is no longer its child and the page falls over:
 * "NotFoundError: Failed to execute 'removeChild' on 'Node'". Readers hit
 * exactly that on 28-30 Sep 2026 (PostHog: /learn's state picker, and every
 * navigation away from the home page, which carries the Congress picker).
 *
 * The fix is one wrapping element in each place (components/ui/select.tsx).
 * Re-adding the file with `pnpm dlx shadcn@2.3.0 add select` would silently drop it, and
 * nothing else in the suite would notice, so this reads the file as text: the
 * component pulls in React and Radix, which do not load under `tsx`.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'select.tsx'), 'utf8');

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

it('an item hands Radix an element, not bare text, to copy into the trigger', () => {
  const itemText = source.match(/<SelectPrimitive\.ItemText>([\s\S]*?)<\/SelectPrimitive\.ItemText>/);
  assert.ok(itemText, 'SelectItem no longer renders SelectPrimitive.ItemText');
  assert.match(
    itemText[1].trim(),
    /^<span>\{children\}<\/span>$/,
    'ItemText children must be wrapped in a <span> so a page translator cannot orphan them',
  );
});

it('SelectValue wraps its placeholder in an element', () => {
  assert.doesNotMatch(
    source,
    /const SelectValue = SelectPrimitive\.Value;/,
    'SelectValue is the bare Radix part again; its placeholder would be bare text',
  );
  assert.match(source, /placeholder=\{placeholder == null \? placeholder : <span>\{placeholder\}<\/span>\}/);
});

if (failures.length > 0) {
  console.error(`select: ${failures.length} failed, ${passed} passed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`select: ${passed} passed`);
