/**
 * Tests for lib/ask-panel-state.ts — the ask panel's phase machine.
 *
 * The reported bug this file pins down: on a phone, tapping a bill card inside
 * an answer looked like it did nothing. The page underneath navigated
 * correctly; the sheet simply covered it. The third test below is that bug,
 * written as an assertion so it cannot come back silently — and the fourth is
 * its mirror, that the same navigation must NOT move a docked panel, where the
 * bill opens beside the conversation and moving anything would be noise.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import type { PanelMode } from './ask-panel';
import {
  INITIAL_ASK_STATE,
  launcherVisible,
  nextAskState,
  panelInert,
  type AskAction,
  type AskPhase,
} from './ask-panel-state';

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

const PHASES: AskPhase[] = ['closed', 'open', 'minimized'];
const MODES: PanelMode[] = ['sheet', 'rail', 'dock'];

it('starts closed', () => {
  assert.equal(INITIAL_ASK_STATE.phase, 'closed');
});

it('opens from every phase', () => {
  for (const phase of PHASES) {
    assert.equal(nextAskState({ phase }, { type: 'open' }).phase, 'open');
    assert.equal(nextAskState({ phase }, { type: 'restore' }).phase, 'open');
  }
});

it('steps aside when a navigation happens under a panel that covers the page', () => {
  // The mobile "tapping the bill card did nothing" bug, as an assertion.
  assert.equal(nextAskState({ phase: 'open' }, { type: 'minimize', mode: 'sheet' }).phase, 'minimized');
  assert.equal(nextAskState({ phase: 'open' }, { type: 'minimize', mode: 'rail' }).phase, 'minimized');
});

it('does not move a docked panel on navigation', () => {
  assert.equal(nextAskState({ phase: 'open' }, { type: 'minimize', mode: 'dock' }).phase, 'open');
});

it('does not flap across a multi-hop navigation', () => {
  for (const mode of MODES) {
    assert.equal(nextAskState({ phase: 'minimized' }, { type: 'minimize', mode }).phase, 'minimized');
    assert.equal(nextAskState({ phase: 'closed' }, { type: 'minimize', mode }).phase, 'closed');
  }
});

it('returns the identical state object when nothing changed', () => {
  // Referential stability keeps the provider from re-rendering the whole
  // conversation on every navigation that changes no phase.
  const open = { phase: 'open' as const };
  assert.equal(nextAskState(open, { type: 'open' }), open);
  assert.equal(nextAskState(open, { type: 'minimize', mode: 'dock' }), open);
  const closed = { phase: 'closed' as const };
  assert.equal(nextAskState(closed, { type: 'close' }), closed);
});

it('closes from every phase', () => {
  for (const phase of PHASES) {
    assert.equal(nextAskState({ phase }, { type: 'close' }).phase, 'closed');
  }
});

it('restores a minimised conversation to open', () => {
  assert.equal(nextAskState({ phase: 'minimized' }, { type: 'restore' }).phase, 'open');
});

it('has no action that can produce a phase outside the three', () => {
  const actions: AskAction[] = [
    { type: 'open' },
    { type: 'close' },
    { type: 'restore' },
    ...MODES.map((mode) => ({ type: 'minimize', mode }) as AskAction),
  ];
  for (const phase of PHASES) {
    for (const action of actions) {
      assert.ok(
        PHASES.includes(nextAskState({ phase }, action).phase),
        `${phase} + ${JSON.stringify(action)}`,
      );
    }
  }
});

it('shows a way back in every phase except open', () => {
  assert.equal(launcherVisible('closed'), true);
  assert.equal(launcherVisible('minimized'), true);
  assert.equal(launcherVisible('open'), false);
});

it('hides the off-screen panel from assistive technology and the tab order', () => {
  assert.equal(panelInert('closed'), true);
  assert.equal(panelInert('minimized'), true);
  assert.equal(panelInert('open'), false);
});

console.log(`\nask-panel-state: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
