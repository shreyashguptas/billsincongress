/**
 * Tests for the profile-photo crop geometry (lib/avatar-image.ts): the photo
 * always covers the circle, zoom keeps the centre, and the crop cut from the
 * image is the square the reader saw.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { clampOffset, coverScale, cropRect, fitWithin, zoomAboutCentre, MAX_ZOOM } from './avatar-image';

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

const V = 280;
const landscape = { w: 4000, h: 3000 };

it('fits the short side to the viewport at zoom 1', () => {
  assert.equal(coverScale(landscape, V), V / 3000);
  assert.equal(coverScale({ w: 1000, h: 2000 }, V), V / 1000);
});

it('at zoom 1 a landscape photo pans sideways only', () => {
  const o = clampOffset({ x: 9999, y: 9999 }, landscape, V, 1);
  assert.equal(o.y, 0);
  assert.ok(Math.abs(o.x - (4000 * (V / 3000) - V) / 2) < 1e-9);
});

it('never lets the photo uncover the circle, whatever the drag', () => {
  for (const zoom of [1, 1.7, MAX_ZOOM]) {
    const o = clampOffset({ x: -1e6, y: 1e6 }, landscape, V, zoom);
    const r = cropRect(landscape, V, zoom, o);
    assert.ok(r.sx >= -1e-6 && r.sy >= -1e-6, `zoom ${zoom}: crop starts inside`);
    assert.ok(r.sx + r.side <= landscape.w + 1e-6 && r.sy + r.side <= landscape.h + 1e-6, `zoom ${zoom}: crop ends inside`);
  }
});

it('crops the centred square at zoom 1 with no drag', () => {
  const r = cropRect(landscape, V, 1, { x: 0, y: 0 });
  assert.deepEqual(r, { sx: 500, sy: 0, side: 3000 });
});

it('zooming keeps the centred point centred', () => {
  const before = cropRect(landscape, V, 1.5, { x: 40, y: -20 });
  const { zoom, offset } = zoomAboutCentre({ x: 40, y: -20 }, landscape, V, 1.5, 2);
  const after = cropRect(landscape, V, zoom, offset);
  assert.ok(Math.abs(before.sx + before.side / 2 - (after.sx + after.side / 2)) < 1e-6);
  assert.ok(Math.abs(before.sy + before.side / 2 - (after.sy + after.side / 2)) < 1e-6);
});

it('clamps zoom to its range', () => {
  assert.equal(zoomAboutCentre({ x: 0, y: 0 }, landscape, V, 1, 99).zoom, MAX_ZOOM);
  assert.equal(zoomAboutCentre({ x: 0, y: 0 }, landscape, V, 2, 0.1).zoom, 1);
});

it('shrinks a huge photo to the working size and never enlarges a small one', () => {
  assert.deepEqual(fitWithin({ w: 8064, h: 6048 }, 2048), { w: 2048, h: 1536 });
  assert.deepEqual(fitWithin({ w: 300, h: 200 }, 2048), { w: 300, h: 200 });
});

if (failures.length) {
  console.error(`avatar-image: ${failures.length} failed, ${passed} passed\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`avatar-image: ${passed} passed`);
