/**
 * The Learn page's seat geometry. Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { buildHemicycle, seatsPath } from './hemicycle';

let passed = 0;
const failures: string[] = [];
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

it('builds exactly the seats asked for', () => {
  assert.equal(buildHemicycle(435, 12, 62, 178, 190, 192).length, 435);
  assert.equal(buildHemicycle(100, 5, 52, 122, 130, 134).length, 100);
});

it('draws one circle per seat, centred on the seat', () => {
  const d = seatsPath([{ x: 12.3, y: 40 }, { x: 20, y: 7.5 }], 3.2);
  assert.equal(
    d,
    'M9.1 40a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0' +
      'M16.8 7.5a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0',
  );
});

it('a whole chamber is one subpath per seat, with no float noise', () => {
  const d = seatsPath(buildHemicycle(435, 12, 62, 178, 190, 192), 3.2);
  assert.equal(d.match(/M/g)?.length, 435);
  assert.ok(!/\d\.\d{3,}/.test(d), 'a coordinate printed more than two decimals');
});

it('no seats draws nothing', () => {
  assert.equal(seatsPath([], 4), '');
});

if (failures.length > 0) {
  console.error(`app/learn/components/hemicycle.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`app/learn/components/hemicycle.test.ts — ${passed} passed`);
export {};
