// Pure checks for the feedback-picture upload (convex/feedback.ts), kept free of
// Convex imports so convex/feedbackPicture.test.ts can run them under plain tsx.

/** Largest picture the endpoint stores. The browser shrinks screenshots well under it. */
export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

/** How long a picture is kept before the daily purge deletes it. */
export const PICTURE_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * The picture's real type, read from its first bytes rather than trusted from
 * the request: only the four formats a browser can draw are accepted, so the
 * stored link can never serve an HTML page or a script from our storage.
 */
export function sniffPictureType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  // "RIFF", four length bytes, then "WEBP".
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/**
 * Pages allowed to upload: the live site, and a dev server on this machine.
 * Not a security boundary (anything outside a browser ignores CORS); it keeps
 * other websites' pages from quietly using the endpoint through their visitors.
 */
export function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (origin === "https://billsincongress.com" || origin === "https://www.billsincongress.com") {
    return true;
  }
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
