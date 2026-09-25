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
  CARD,
  MONO,
  SANS,
  emailDocument,
  escapeHtml,
  footer,
  masthead,
  preheader,
  SPECTRUM,
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

/**
 * Six digits, six spectrum colours: a short bar under the code, one band per
 * digit (a 32px mono digit at .2em tracking advances about 26px). The code itself stays one plain string so it copies in one go.
 */
function codeUnderline(): string {
  const cells = SPECTRUM.map(
    (c, i) =>
      `<td width="20" height="3" style="width:20px;height:3px;line-height:3px;font-size:0;background:${c};">&nbsp;</td>${i < 5 ? '<td width="6" style="width:6px;font-size:0;">&nbsp;</td>' : ""}`,
  ).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>${cells}</tr></table>`;
}

export function renderCodeEmail(purpose: CodePurpose, code: string): RenderedEmail {
  const copy = COPY[purpose];
  const expiry = `It expires in ${CODE_LIFETIME_MINUTES} minutes.`;

  const bodyHtml = `${preheader(`${copy.lead} ${code}.`)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.ground};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;${CARD}">
${masthead(copy.eyebrow)}
<tr><td style="padding:24px 28px 8px;font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(copy.lead)}</td></tr>
<tr><td style="padding:4px 28px 8px;">
  <p style="margin:0;font:600 32px/1.2 ${MONO};letter-spacing:.2em;color:${C.ink};">${escapeHtml(code)}</p>
  ${codeUnderline()}
</td></tr>
<tr><td style="padding:8px 28px 24px;font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(expiry)}</td></tr>
${footer(escapeHtml(copy.ignore))}
</table>
</td></tr>
</table>
`;

  const html = emailDocument(copy.subject, bodyHtml);

  const text = [`${copy.lead} ${code}.`, "", expiry, "", copy.ignore].join("\n");

  return { subject: copy.subject, html, bodyHtml, text };
}
