/**
 * Screenshots never go in the repository.
 *
 * Screenshots taken to show a change belong in the pull request — pasted into
 * its description or a comment, where GitHub hosts them — never in a commit.
 * Once committed they sit in every clone forever, and nothing in the site uses
 * them. It happened once: eight review screenshots for #138 were committed
 * under `.github/pr-screenshots/` and had to be removed in #145.
 *
 * The rule, checked against every tracked or new (not ignored) file:
 * - An image or video may live only under `public/`, the site's own assets
 *   (plus Next's file-convention icons and share images under `app/`).
 * - Nothing anywhere may be named like a screenshot.
 *
 * One deliberate exception: screenshots the site itself serves in its web app
 * manifest (the `screenshots` member of `app/manifest.ts`, used by richer
 * install prompts and store listings). They live in `public/manifest-screenshots/`,
 * and each one passes only while `app/manifest.ts` references it by path, so the
 * folder cannot become a place to park review images.
 *
 * Run with: `pnpm test`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MEDIA = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|heic|heif|mov|mp4|webm|m4v)$/i;
// Next.js file conventions: app/**/icon.png, apple-icon, opengraph-image, twitter-image.
const NEXT_CONVENTION = /^app\/(.+\/)?(icon|apple-icon|opengraph-image|twitter-image)\d*\.[a-z]+$/i;
const MANIFEST_SCREENSHOTS = "public/manifest-screenshots/";
const manifest = existsSync("app/manifest.ts") ? readFileSync("app/manifest.ts", "utf8") : "";
const SCREENSHOT_NAME = /(screen[\s_-]?shot|screen[\s_-]?recording|pr[\s_-]?screenshots?|^before-|^after-)/i;

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

if (files.length === 0) {
  // An empty listing means git could not answer, not that the tree is clean.
  console.error("check-no-committed-screenshots: git listed no files; refusing to pass on nothing");
  process.exit(1);
}

const offenders: string[] = [];
for (const path of files) {
  const name = path.split("/").pop() ?? path;
  if (path.startsWith(MANIFEST_SCREENSHOTS)) {
    // Served as `/manifest-screenshots/…`: fine only while the manifest uses it.
    if (!MEDIA.test(path) || !manifest.includes(path.slice("public".length))) {
      offenders.push(`${path}: in public/manifest-screenshots/ but not referenced by app/manifest.ts`);
    }
    continue;
  }
  if (MEDIA.test(path) && !path.startsWith("public/") && !NEXT_CONVENTION.test(path)) {
    offenders.push(`${path}: an image or video outside public/`);
  } else if (MEDIA.test(path) && SCREENSHOT_NAME.test(name)) {
    offenders.push(`${path}: named like a screenshot`);
  } else if (/screen[\s_-]?(shot|recording)s?[^/]*\//i.test(path)) {
    // Any folder named like a screenshot folder: pr-screenshots/, review-screenshots/,
    // "Screen Shots/". public/manifest-screenshots/ was handled above.
    offenders.push(`${path}: inside a screenshots folder`);
  }
}

if (offenders.length > 0) {
  console.error("\ncheck-no-committed-screenshots: FAILED\n");
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error(
    "\nScreenshots go in the pull request (drag them into its description or a comment on\n" +
      "github.com), never in the repository. Site images belong under public/.\n",
  );
  process.exit(1);
}
console.log(`check-no-committed-screenshots: ${files.length} files, no screenshots or stray media`);
