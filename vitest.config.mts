import { defineConfig } from "vitest/config";

// Only the Convex function specs run under vitest: they need convex-test,
// which loads modules through `import.meta.glob`. Every other test in this repo
// is a plain `*.test.ts` script run by scripts/run-tests.ts under tsx.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.spec.ts"],
    server: { deps: { inline: ["convex-test"] } },
    // Node 25+ ships Web Storage, and the edge-runtime environment touches the
    // global `localStorage` while building its sandbox, so every worker printed
    // "ExperimentalWarning: localStorage is not available". Convex functions
    // never use Web Storage; turning it off makes Node 26 behave like Node 24
    // here and keeps real warnings visible.
    execArgv: ["--no-experimental-webstorage"],
  },
});
