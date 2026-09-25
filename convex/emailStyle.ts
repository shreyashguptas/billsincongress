/**
 * The letterhead every email shares: palette, type, escaping and the document
 * shell. PURE — no Convex imports.
 *
 * Every email is built to read the same when a mail client blocks remote
 * content (Apple Mail Privacy Protection, "Block All Remote Content"): no
 * images, no web fonts, no remote CSS — inline styles and system font stacks
 * only. The tests for each email check this.
 */

export const BRAND = "Bills in Congress";

// The site's Day palette (Documentation/brand.md): paper, raised, ink, ink-3
// and line. Mail clients ignore CSS variables and most ignore dark-mode media
// queries, so it is literal. Like the site, the letterhead has no accent.
export const C = {
  ground: "#f6f5f1",
  card: "#ffffff",
  ink: "#101418",
  muted: "#666d77",
  rule: "#e2e1db",
};
export const SERIF = "Georgia,'Times New Roman',serif";
export const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

export interface RenderedEmail {
  subject: string;
  /** A complete HTML document, for previews and any sender that wants one. */
  html: string;
  /**
   * The same email without the document shell (what sits inside <body>).
   * PostHog wraps an email's HTML in its own document, so this is what is
   * sent; a nested <html> would be malformed.
   */
  bodyHtml: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wraps an email body in a complete HTML document. */
export function emailDocument(subject: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.ground};">
${bodyHtml}</body></html>`;
}

/** Hidden preview line mail clients show next to the subject. */
export function preheader(text: string): string {
  return `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(text)}</span>`;
}

/** The masthead at the top of every email: the wordmark, then an eyebrow. */
export function masthead(eyebrow: string): string {
  return `<tr><td style="padding:22px 28px 18px;border-bottom:1px solid ${C.rule};">
  <p style="margin:0;font:600 20px/1.2 ${SERIF};color:${C.ink};">${BRAND}</p>
  <p style="margin:6px 0 0;font:11px/1.4 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.muted};">${escapeHtml(eyebrow)}</p>
</td></tr>`;
}
