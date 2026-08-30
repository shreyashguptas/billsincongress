/**
 * Tests for lib/ask-panel.ts — the ask panel's geometry.
 *
 * The assertion that earns this file is the swept invariant at the bottom: for
 * every viewport at which the panel docks, and every width a reader could ask
 * for, the content column left over is never narrower than the site's own `lg`
 * rendering. Tailwind's media queries cannot see a squeezed content box, so if
 * that invariant ever breaks, every `lg:` grid on the site quietly renders in
 * less room than it was designed for and nothing tells us. It is one loop here
 * instead of a per-component audit there.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_PANEL_PX,
  DOCK_MIN_VIEWPORT_PX,
  MAX_PANEL_PX,
  MIN_CONTENT_PX,
  MIN_PANEL_PX,
  RAIL_MIN_VIEWPORT_PX,
  clampPanelWidth,
  isResizable,
  layoutModeFor,
  maxPanelWidth,
  normalizePanelPrefs,
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

it('derives the dock threshold from the content floor and the minimum panel', () => {
  assert.equal(DOCK_MIN_VIEWPORT_PX, MIN_CONTENT_PX + MIN_PANEL_PX);
});

it('picks the sheet on phones and small tablets', () => {
  assert.equal(layoutModeFor(360), 'sheet');
  assert.equal(layoutModeFor(768), 'sheet');
  assert.equal(layoutModeFor(RAIL_MIN_VIEWPORT_PX - 1), 'sheet');
});

it('floats a rail where there is room beside the page but not room to push', () => {
  assert.equal(layoutModeFor(RAIL_MIN_VIEWPORT_PX), 'rail');
  assert.equal(layoutModeFor(1280), 'rail');
  assert.equal(layoutModeFor(DOCK_MIN_VIEWPORT_PX - 1), 'rail');
});

it('docks once the page can keep a full-width content column beside it', () => {
  assert.equal(layoutModeFor(DOCK_MIN_VIEWPORT_PX), 'dock');
  assert.equal(layoutModeFor(1440), 'dock');
  assert.equal(layoutModeFor(3840), 'dock');
});

it('falls back to the sheet for a viewport it cannot read', () => {
  // Server render and the first paint before any measurement has happened.
  assert.equal(layoutModeFor(0), 'sheet');
  assert.equal(layoutModeFor(Number.NaN), 'sheet');
  assert.equal(layoutModeFor(-1), 'sheet');
});

it('gives no drag room at the exact dock threshold, and says so', () => {
  assert.equal(maxPanelWidth(DOCK_MIN_VIEWPORT_PX), MIN_PANEL_PX);
  assert.equal(isResizable(DOCK_MIN_VIEWPORT_PX), false);
  assert.equal(isResizable(1280), false); // rail mode is a fixed width
});

it('opens up drag room as the display grows, then stops at the prose cap', () => {
  assert.equal(maxPanelWidth(1440), 416);
  assert.equal(maxPanelWidth(1664), MAX_PANEL_PX);
  assert.equal(maxPanelWidth(3840), MAX_PANEL_PX);
  assert.equal(isResizable(1440), true);
});

it('clamps a requested width into what the viewport can afford', () => {
  assert.equal(clampPanelWidth(100, 1920), MIN_PANEL_PX);
  assert.equal(clampPanelWidth(9999, 1920), MAX_PANEL_PX);
  assert.equal(clampPanelWidth(9999, 1440), 416);
  assert.equal(clampPanelWidth(420.6, 1920), 421);
});

it('treats an unreadable width as the default rather than propagating NaN', () => {
  // Every non-finite value goes the same way. The realistic source is a
  // corrupted stored preference, and there the default is the right answer —
  // a drag cannot produce one of these.
  assert.equal(clampPanelWidth(Number.NaN, 1920), DEFAULT_PANEL_PX);
  assert.equal(clampPanelWidth(Number.POSITIVE_INFINITY, 1920), DEFAULT_PANEL_PX);
  // …and the default is itself clamped, so a narrow display still gets a legal width.
  assert.equal(clampPanelWidth(Number.NaN, DOCK_MIN_VIEWPORT_PX), MIN_PANEL_PX);
});

it('never returns a negative or zero width, even on a viewport that cannot dock', () => {
  for (const vw of [0, 320, 800, 1023]) {
    assert.ok(clampPanelWidth(DEFAULT_PANEL_PX, vw) >= MIN_PANEL_PX, `viewport ${vw}`);
  }
});

it('leaves the page at least its `lg` content width at every docked size', () => {
  // The invariant this whole module exists to hold. If it fails, Tailwind's
  // `lg:` layouts are being rendered into less room than they were built for
  // and no media query can notice.
  for (let viewport = DOCK_MIN_VIEWPORT_PX; viewport <= 3840; viewport += 37) {
    for (let requested = 0; requested <= 2000; requested += 43) {
      const width = clampPanelWidth(requested, viewport);
      assert.ok(
        viewport - width >= MIN_CONTENT_PX,
        `viewport ${viewport}, requested ${requested}: content ${viewport - width} < ${MIN_CONTENT_PX}`,
      );
      assert.ok(width >= MIN_PANEL_PX, `viewport ${viewport}: panel ${width} below minimum`);
    }
  }
});

it('turns anything unrecognisable in storage into the default width', () => {
  for (const raw of [
    null,
    undefined,
    'garbage',
    [],
    42,
    {},
    { widthPx: '420' },
    { widthPx: -5 },
    { widthPx: 99999 },
    { widthPx: Number.NaN },
    { widthPx: MIN_PANEL_PX - 1 },
    { widthPx: MAX_PANEL_PX + 1 },
  ]) {
    assert.equal(
      normalizePanelPrefs(raw).widthPx,
      DEFAULT_PANEL_PX,
      `expected default for ${JSON.stringify(raw)}`,
    );
  }
});

it('keeps a plausible stored width and ignores unknown keys beside it', () => {
  assert.equal(normalizePanelPrefs({ widthPx: 500 }).widthPx, 500);
  assert.equal(normalizePanelPrefs({ widthPx: 500, phase: 'open' }).widthPx, 500);
  assert.equal(normalizePanelPrefs({ widthPx: MIN_PANEL_PX }).widthPx, MIN_PANEL_PX);
  assert.equal(normalizePanelPrefs({ widthPx: MAX_PANEL_PX }).widthPx, MAX_PANEL_PX);
});

console.log(`\nask-panel: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
