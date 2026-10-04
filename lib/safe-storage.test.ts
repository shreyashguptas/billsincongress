/**
 * Tests for the blocked-storage shim.
 *
 * A browser with storage blocked throws on the property read itself
 * (`window.localStorage`), not on getItem. Convex Auth's Next.js provider does
 * that read during render, so the shim has to make the read succeed. The fake
 * window here throws exactly that way.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { safeLocalStorage, shimBlockedStorage } from "./safe-storage";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

/** A window whose storage getters throw, like a storage-blocked browser. */
function blockedWindow() {
  const win = {};
  for (const kind of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(win, kind, {
      configurable: true,
      get() {
        throw new Error(`SecurityError: Failed to read the '${kind}' property from 'Window'`);
      },
    });
  }
  (globalThis as { window?: unknown }).window = win;
  return win as { localStorage: Storage; sessionStorage: Storage };
}

it("does nothing during SSR", () => {
  assert.deepEqual(shimBlockedStorage(), []);
});

it("leaves working storage alone", () => {
  const real = { getItem: () => "kept" } as unknown as Storage;
  (globalThis as { window?: unknown }).window = { localStorage: real, sessionStorage: real };
  assert.deepEqual(shimBlockedStorage(), []);
  assert.equal((globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage, real);
});

it("makes blocked storage readable, so a render that reads it survives", () => {
  const win = blockedWindow();
  assert.throws(() => win.localStorage);
  assert.deepEqual(shimBlockedStorage(), ["localStorage", "sessionStorage"]);
  assert.doesNotThrow(() => win.localStorage);
  assert.doesNotThrow(() => win.sessionStorage);
  assert.notEqual(win.localStorage, win.sessionStorage);
});

it("the shim behaves like Storage for the session", () => {
  const win = blockedWindow();
  shimBlockedStorage();
  const store = win.localStorage;
  assert.equal(store.getItem("k"), null);
  store.setItem("k", "v");
  assert.equal(store.getItem("k"), "v");
  assert.equal(store.length, 1);
  assert.equal(store.key(0), "k");
  store.removeItem("k");
  assert.equal(store.length, 0);
  store.setItem("a", "1");
  store.clear();
  assert.equal(store.getItem("a"), null);
});

it("the app's own helpers read through the shim", () => {
  blockedWindow();
  shimBlockedStorage();
  safeLocalStorage.setItem("flag", "1");
  assert.equal(safeLocalStorage.getItem("flag"), "1");
});

if (failures.length) {
  console.error(`safe-storage: ${passed} passed, ${failures.length} failed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`safe-storage: ${passed} passed, 0 failed`);
