import { defineConfig } from "vitest/config";

// Only the Convex function specs run under vitest: they need convex-test,
// which loads modules through `import.meta.glob`. Every other test in this repo
// is a plain `*.test.ts` script run by scripts/run-tests.ts under tsx.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.spec.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
