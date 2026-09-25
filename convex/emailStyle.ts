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
// queries, so it is literal. Like the site, the chrome has no accent: colour
// comes from the data palette below.
export const C = {
  ground: "#f6f5f1",
  card: "#ffffff",
  ink: "#101418",
  muted: "#666d77",
  rule: "#e2e1db",
};
export const SERIF = "Georgia,'Times New Roman',serif";
/** The card every email sits in: raised, a hairline edge, the site's 14px panel radius. */
export const CARD = `background:${C.card};border:1px solid ${C.rule};border-radius:14px;border-collapse:separate;overflow:hidden;`;
export const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

/**
 * The data palette, for email (Documentation/brand.md, "Email"). The same Day
 * values as app/globals.css: the six topic colours, which together are the
 * brand's spectrum, and the stage ramp. As on the site, a colour means
 * something — the spectrum signs the email, a stage colour is a stage.
 * Everything is a table cell or an inline block, so it survives Outlook
 * (square corners there) and a client that blocks remote content.
 */
export const SPECTRUM = ["#eb6834", "#1baf7a", "#4a3aa7", "#eda100", "#2a78d6", "#e87ba4"] as const;

/** Per stage: the fill (dot, track), a tint (pill ground) and a text colour ≥4.5:1 on the tint. */
export const STAGE: Record<number, { fill: string; tint: string; text: string }> = {
  20: { fill: "#838995", tint: "#f0f1f3", text: "#4a515a" },
  40: { fill: "#495979", tint: "#e9ecf2", text: "#3a4761" },
  60: { fill: "#b17725", tint: "#f8eedf", text: "#7a4f14" },
  80: { fill: "#c36d22", tint: "#f9ebde", text: "#83461a" },
  85: { fill: "#5e6678", tint: "#eceef1", text: "#4a515a" },
  90: { fill: "#b64d20", tint: "#f7e5dd", text: "#833716" },
  95: { fill: "#a02226", tint: "#f5e1e1", text: "#7c1a1d" },
  100: { fill: "#31724c", tint: "#e2efe7", text: "#245a3a" },
};
const STAGE_STEP: Record<number, number> = { 20: 1, 40: 2, 60: 3, 80: 4, 85: 5, 90: 5, 95: 6, 100: 7 };

/** The spectrum as a strip: six equal bands. Across the top of every card. */
export function spectrumBar(height = 5): string {
  const cells = SPECTRUM.map(
    (c) => `<td height="${height}" style="height:${height}px;line-height:${height}px;font-size:0;background:${c};">&nbsp;</td>`,
  ).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${cells}</tr></table>`;
}

/** Six small dots in the spectrum — the chamber mark's outer row, in a line. Signs the footer. */
export function spectrumDots(size = 6): string {
  return SPECTRUM.map(
    (c) => `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${c};margin-right:4px;"></span>`,
  ).join("");
}

/** A tinted pill with a coloured dot: a stage, or any state that has a colour. */
export function pill(label: string, colours: { fill: string; tint: string; text: string }): string {
  return `<span style="display:inline-block;padding:4px 10px 4px 8px;border-radius:999px;background:${colours.tint};font:600 13px/1.3 ${SANS};color:${colours.text};"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colours.fill};margin-right:6px;vertical-align:1px;"></span>${escapeHtml(label)}</span>`;
}

/** The site's seven-step stage track, filled to `stage` in its colour. */
export function stageTrack(stage: number): string {
  const s = STAGE[stage] ?? STAGE[20];
  const step = STAGE_STEP[stage] ?? 1;
  const cells = Array.from(
    { length: 7 },
    (_, i) =>
      `<td height="6" style="height:6px;line-height:6px;font-size:0;background:${i < step ? s.fill : "#edece6"};border-radius:2px;">&nbsp;</td>${i < 6 ? '<td width="4" style="width:4px;font-size:0;">&nbsp;</td>' : ""}`,
  ).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:320px;"><tr>${cells}</tr></table>`;
}

/** The email's closing row: spectrum dots over the small print. */
export function footer(html: string): string {
  return `<tr><td style="padding:20px 28px 26px;border-top:1px solid ${C.rule};font:12px/1.6 ${SANS};color:${C.muted};">
  <div style="margin:0 0 12px;line-height:6px;">${spectrumDots()}</div>
  ${html}
</td></tr>`;
}

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

/** The masthead at the top of every card: the spectrum strip, the wordmark, then an eyebrow. */
export function masthead(eyebrow: string): string {
  return `<tr><td style="padding:0;">${spectrumBar()}</td></tr>
<tr><td style="padding:22px 28px 18px;border-bottom:1px solid ${C.rule};">
  <p style="margin:0;font:600 20px/1.2 ${SERIF};color:${C.ink};">${BRAND}</p>
  <p style="margin:6px 0 0;font:600 11px/1.4 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">${escapeHtml(eyebrow)}</p>
</td></tr>`;
}
