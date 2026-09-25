/**
 * The emails a Pro plan change sends: started, cancellation scheduled or
 * withdrawn, a failed renewal, and the end of Pro. PURE — no Convex imports —
 * so the copy is unit-tested in billingEmail.test.ts. Which change gets which
 * email is `billingNotice` in plan.ts; `applySubscription` (billing.ts)
 * schedules the send.
 *
 * Money documents (receipts, refunds, invoices) are Stripe's, so these never
 * state an amount: they say what changed and what the reader can do next.
 *
 * Shares the letterhead in emailStyle.ts: text only, no images or web fonts,
 * so it reads the same with remote content blocked (Apple Mail).
 */
import type { BillingNotice } from "./plan";
import {
  BRAND,
  C,
  CARD,
  SANS,
  emailDocument,
  escapeHtml,
  footer,
  masthead,
  pill,
  SPECTRUM,
  preheader,
  type RenderedEmail,
} from "./emailStyle";

export interface BillingEmailContext {
  siteUrl: string; // no trailing slash
  /** When the current paid period ends, unix seconds. */
  periodEnd?: number;
  interval?: "month" | "year";
}

/** Unix seconds → "October 24, 2026", in US Eastern time like the site. */
export function formatBillingDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

interface Copy {
  subject: string;
  eyebrow: string;
  /** The state in one pill, coloured by what it means. */
  state: { label: string; tone: Tone };
  /** Drawn as a list with spectrum dots — the welcome email's two features. */
  features?: string[];
  paragraphs: string[];
  button?: { label: string; href: string };
}

/**
 * Pill colours for a plan state. Pro is indigo (topic-3, never a party
 * colour); a heads-up is the stage ramp's amber; a problem is the site's
 * error red; the free plan is ink-3.
 */
type Tone = "pro" | "heads-up" | "problem" | "free";
const TONE: Record<Tone, { fill: string; tint: string; text: string }> = {
  pro: { fill: "#4a3aa7", tint: "#ecebf7", text: "#3b2e8a" },
  "heads-up": { fill: "#b17725", tint: "#f8eedf", text: "#7a4f14" },
  problem: { fill: "#b3261e", tint: "#f9e3e1", text: "#8c1d17" },
  free: { fill: "#838995", tint: "#f0f1f3", text: "#4a515a" },
};

function copyFor(notice: BillingNotice, ctx: BillingEmailContext): Copy {
  const site = ctx.siteUrl;
  const account = `${site}/account`;
  const on = ctx.periodEnd !== undefined ? formatBillingDate(ctx.periodEnd) : undefined;
  const cadence = ctx.interval === "year" ? "yearly" : ctx.interval === "month" ? "monthly" : undefined;

  switch (notice.kind) {
    case "welcome":
      return {
        subject: notice.returning ? `Welcome back to ${BRAND} Pro` : `Welcome to ${BRAND} Pro`,
        eyebrow: notice.returning ? "Pro is back on" : "Pro is on",
        state: { label: notice.returning ? "Pro is back on" : "Pro is on", tone: "pro" },
        features: [
          "Up to 500 questions a day to the assistant, up from 100.",
          "Email alerts for up to 100 bills. Press “Email me updates” on any bill page, and you get one email on mornings a bill you follow has a new action or status. No news, no email.",
        ],
        paragraphs: [
          "Your Pro plan is active. It adds two things to your account:",
          on
            ? `Your plan renews ${cadence ? `${cadence} ` : ""}on ${on}. Stripe emails your receipt separately. You can change or cancel your plan any time from your account page.`
            : "Stripe emails your receipt separately. You can change or cancel your plan any time from your account page.",
        ],
        button: { label: "Find a bill to follow", href: `${site}/bills` },
      };
    case "cancel_scheduled":
      return {
        subject: on ? `Your Pro plan ends on ${on}` : "Your Pro plan is set to end",
        eyebrow: "Cancellation confirmed",
        state: { label: on ? `Pro ends ${on}` : "Pro is set to end", tone: "heads-up" },
        paragraphs: [
          on
            ? `You cancelled Pro. You keep everything until ${on}, and you will not be charged again.`
            : "You cancelled Pro. You keep everything until the end of the period you paid for, and you will not be charged again.",
          "After that your account goes back to the free plan. The bills you follow stay saved, but alert emails pause.",
          "Changed your mind? Renew from your account page before then.",
        ],
        button: { label: "Open your account", href: account },
      };
    case "cancel_withdrawn":
      return {
        subject: "Your Pro plan will keep renewing",
        eyebrow: "Staying on Pro",
        state: { label: "Renewing as normal", tone: "pro" },
        paragraphs: [
          on ? `You're staying on Pro. It renews on ${on}.` : "You're staying on Pro. It renews as before.",
          "Nothing else changes: your alerts and question allowance carry on.",
        ],
        button: { label: "Open your account", href: account },
      };
    case "payment_failed":
      return {
        subject: "Your Pro payment didn't go through",
        eyebrow: "Payment problem",
        state: { label: "Payment didn’t go through", tone: "problem" },
        paragraphs: [
          "We couldn't charge your card for Pro. You keep Pro while Stripe tries again over the next couple of weeks.",
          "To fix it now, open your account page, choose “Manage billing” and update your card. If every retry fails, your account goes back to the free plan.",
        ],
        button: { label: "Update your card", href: account },
      };
    case "ended": {
      const lead =
        notice.reason === "payment_failed"
          ? "We couldn't collect payment for Pro after several tries, so your account is back on the free plan."
          : notice.reason === "paused"
            ? "Your Pro plan is paused, so your account is on the free plan for now."
            : "Your Pro plan has ended, and your account is back on the free plan.";
      return {
        subject:
          notice.reason === "paused"
            ? "Your Pro plan is paused"
            : notice.reason === "payment_failed"
              ? "Your Pro plan has ended: payment didn't go through"
              : "Your Pro plan has ended",
        eyebrow: notice.reason === "paused" ? "Pro paused" : "Pro ended",
        state: { label: notice.reason === "paused" ? "Pro is paused" : "Back on the free plan", tone: "free" },
        paragraphs: [
          lead,
          "The bills you follow are still saved, and alert emails are paused. You still get 100 questions a day.",
          notice.reason === "paused"
            ? "Resume any time from your account page, under “Manage billing”."
            : "Subscribe again any time, and your alerts pick up where they left off.",
        ],
        button:
          notice.reason === "paused"
            ? { label: "Open your account", href: account }
            : { label: "See Pro", href: `${site}/pro` },
      };
    }
  }
}

function buttonHtml(label: string, href: string): string {
  // A bordered table cell rather than an image or CSS button, so it renders in
  // every client and with images off.
  return `<tr><td style="padding:8px 28px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${C.ink};border-radius:8px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 18px;font:600 14px/1.2 ${SANS};color:${C.ground};text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr></table>
</td></tr>`;
}

export function renderBillingEmail(notice: BillingNotice, ctx: BillingEmailContext): RenderedEmail {
  const copy = copyFor(notice, ctx);
  const paragraph = (p: string, first: boolean) =>
    `<tr><td style="padding:${first ? "16px" : "4px"} 28px 12px;font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(p)}</td></tr>`;
  const features = (copy.features ?? [])
    .map(
      (f, i) => `<tr><td style="padding:4px 28px 10px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td valign="top" width="22" style="width:22px;padding-top:7px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${SPECTRUM[i % SPECTRUM.length]};"></span></td>
  <td style="font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(f)}</td>
</tr></table></td></tr>`,
    )
    .join("\n");
  const [lead, ...rest] = copy.paragraphs;
  const body = [paragraph(lead, true), features, ...rest.map((p) => paragraph(p, false))].join("\n");

  const bodyHtml = `${preheader(copy.paragraphs[0])}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.ground};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;${CARD}">
${masthead(copy.eyebrow)}
<tr><td style="padding:24px 28px 0;">${pill(copy.state.label, TONE[copy.state.tone])}</td></tr>
${body}
${copy.button ? buttonHtml(copy.button.label, copy.button.href) : ""}
${footer(`You get this because you have a ${BRAND} account with a Pro subscription. Receipts and invoices come from Stripe. Questions: <a href="mailto:hi@billsincongress.com" style="color:${C.muted};">hi@billsincongress.com</a>`)}
</table>
</td></tr>
</table>
`;

  const text = [
    ...[copy.paragraphs[0], ...(copy.features ?? []).map((f) => `- ${f}`), ...copy.paragraphs.slice(1)].flatMap((p) => [p, ""]),
    ...(copy.button ? [`${copy.button.label}: ${copy.button.href}`, ""] : []),
    "---",
    `You get this because you have a ${BRAND} account with a Pro subscription. Receipts and invoices come from Stripe. Questions: hi@billsincongress.com`,
  ].join("\n");

  return { subject: copy.subject, html: emailDocument(copy.subject, bodyHtml), bodyHtml, text };
}
