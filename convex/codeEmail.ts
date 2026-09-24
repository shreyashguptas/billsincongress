/**
 * The sign-up and password-reset code emails. PURE — no Convex imports — so
 * the rendering is unit-tested in codeEmail.test.ts. Sent by emailCodes.ts.
 *
 * Shares the letterhead in emailStyle.ts. The code is plain text in the
 * HTML, never an image, so it reads the same when a mail client blocks remote
 * content (Apple Mail Privacy Protection).
 */
import {
  BRAND,
  C,
  MONO,
  SANS,
  emailDocument,
  escapeHtml,
  masthead,
  preheader,
  type RenderedEmail,
} from "./emailStyle";

export type CodePurpose = "verify" | "reset";

const COPY: Record<CodePurpose, { subject: string; eyebrow: string; lead: string; ignore: string }> = {
  verify: {
    subject: `Verify your email — ${BRAND}`,
    eyebrow: "Verify your email",
    lead: "Your verification code is",
    ignore: "If you didn't request this, you can safely ignore it.",
  },
  reset: {
    subject: `Reset your password — ${BRAND}`,
    eyebrow: "Reset your password",
    lead: "Your password-reset code is",
    ignore: "If you didn't request this, your account is safe — you can ignore it.",
  },
};

export const CODE_LIFETIME_MINUTES = 15;

export function renderCodeEmail(purpose: CodePurpose, code: string): RenderedEmail {
  const copy = COPY[purpose];
  const expiry = `It expires in ${CODE_LIFETIME_MINUTES} minutes.`;

  const bodyHtml = `${preheader(`${copy.lead} ${code}.`)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.ground};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;background:${C.card};border:1px solid ${C.rule};">
${masthead(copy.eyebrow)}
<tr><td style="padding:24px 28px 8px;font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(copy.lead)}</td></tr>
<tr><td style="padding:4px 28px 8px;">
  <p style="margin:0;font:600 32px/1.2 ${MONO};letter-spacing:.2em;color:${C.navy};">${escapeHtml(code)}</p>
</td></tr>
<tr><td style="padding:8px 28px 24px;font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(expiry)}</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${C.rule};font:12px/1.6 ${SANS};color:${C.muted};">${escapeHtml(copy.ignore)}</td></tr>
</table>
</td></tr>
</table>
`;

  const html = emailDocument(copy.subject, bodyHtml);

  const text = [`${copy.lead} ${code}.`, "", expiry, "", copy.ignore].join("\n");

  return { subject: copy.subject, html, bodyHtml, text };
}
