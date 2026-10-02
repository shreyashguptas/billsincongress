/**
 * The feedback-picture checks: only real pictures, only from our own pages.
 * node:assert, no framework, like syncStatus.test.ts. Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import { isAllowedOrigin, sniffPictureType } from "./feedbackPicture";

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

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

it("reads a JPEG", () => assert.equal(sniffPictureType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg"));
it("reads a PNG", () =>
  assert.equal(sniffPictureType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png"));
it("reads a GIF", () => assert.equal(sniffPictureType(bytes(...ascii("GIF89a"))), "image/gif"));
it("reads a WebP", () =>
  assert.equal(sniffPictureType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"))), "image/webp"));

// Stored files are served from our storage domain, so a page or script
// disguised as a picture must never be accepted.
it("refuses HTML labelled as a picture", () =>
  assert.equal(sniffPictureType(bytes(...ascii("<!doctype html><script>"))), null));
it("refuses SVG, which can carry script", () =>
  assert.equal(sniffPictureType(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg">'))), null));
it("refuses a RIFF file that is not WebP (a WAV)", () =>
  assert.equal(sniffPictureType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE"))), null));
it("refuses an empty body", () => assert.equal(sniffPictureType(new Uint8Array()), null));

it("allows the live site", () => {
  assert.ok(isAllowedOrigin("https://billsincongress.com"));
  assert.ok(isAllowedOrigin("https://www.billsincongress.com"));
});
it("allows a dev server on this machine, any port", () => {
  assert.ok(isAllowedOrigin("http://localhost:3000"));
  assert.ok(isAllowedOrigin("http://127.0.0.1:3150"));
});
it("refuses other sites and look-alikes", () => {
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin("https://billsincongress.com.evil.example"), false);
  assert.equal(isAllowedOrigin("http://billsincongress.com"), false);
  assert.equal(isAllowedOrigin("http://localhost.evil.example"), false);
  assert.equal(isAllowedOrigin(null), false);
});

if (failures.length) {
  console.error(`feedbackPicture: ${failures.length} failed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`feedbackPicture: ${passed} passed`);
