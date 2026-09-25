/**
 * Every email the site sends goes out through PostHog Workflows. Pure — no
 * Convex imports — so any action can call it: the sign-in code providers
 * (convex/emailCodes.ts) and the bill-alert sender (convex/email.ts).
 *
 * How it works: each stream is one PostHog workflow with a webhook trigger and
 * a single email step. We POST the finished message (recipient, subject, text,
 * HTML) to that workflow's URL; the workflow's email step just places those
 * fields. The site renders every email itself, so the wording lives in this
 * repository, not in PostHog's editor.
 *
 * The URL alone would let anyone who learned it send mail as Bills.Congress,
 * so each workflow's trigger also requires `Authorization: Bearer <secret>`
 * (the trigger's "Authorization header value" setting) and rejects anything
 * else with a 401.
 *
 * Streams:
 *   codes  — sign-up and password-reset codes, workflow "Bills.Congress:
 *            sign-in codes". Message category "transactional": sent even to
 *            someone who opted out of other mail, with no unsubscribe header,
 *            and open and click tracking turned off.
 *   alerts — Pro bill-alert digests, workflow "Bills.Congress: bill alerts".
 *            Message category "marketing": PostHog adds the one-click
 *            List-Unsubscribe header mail clients show as a button, and skips
 *            anyone who used it. Our own unsubscribe link stays in the footer.
 *            Tracking off.
 */

export type EmailStream = "codes" | "alerts";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Every send uses this one PostHog distinct id, so PostHog does not build a
 * profile per recipient from the email-delivery events it records. The
 * recipient's address is still in those events (`$email_to`); that is how
 * PostHog reports bounces.
 */
export const EMAIL_DISTINCT_ID = "bills-congress-mailer";

/**
 * The name the workflow run is started under. It is NOT ingested as an
 * analytics event (a webhook trigger only ingests one if the workflow has a
 * "Capture event" step, and ours has none), but the trigger template rejects a
 * request without it.
 *
 * What PostHog does keep: each run's trigger payload, this whole request, in
 * the workflow's Invocations tab. For the codes stream that includes the live
 * code, readable by anyone with access to the PostHog project until it expires
 * (15 minutes, one use). See "Email" in Documentation/overview.md.
 */
export const EMAIL_EVENT = "bic_email_requested";

const WEBHOOK_ENV: Record<EmailStream, string> = {
  codes: "POSTHOG_EMAIL_CODES_WEBHOOK_URL",
  alerts: "POSTHOG_EMAIL_ALERTS_WEBHOOK_URL",
};

/** Why a send failed, and whether trying again could help. */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

/** The request PostHog receives. Exported for the tests. */
export function emailRequest(stream: EmailStream, email: OutgoingEmail) {
  const url = process.env[WEBHOOK_ENV[stream]];
  const secret = process.env.POSTHOG_EMAIL_WEBHOOK_SECRET;
  if (!url || !secret) {
    throw new EmailSendError(
      `Email is not configured: set ${WEBHOOK_ENV[stream]} and POSTHOG_EMAIL_WEBHOOK_SECRET`,
      false,
    );
  }
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        event: EMAIL_EVENT,
        distinct_id: EMAIL_DISTINCT_ID,
        stream,
        to: email.to,
        subject: email.subject,
        text: email.text,
        // An empty html makes PostHog send the text part alone.
        html: email.html ?? "",
      }),
    } satisfies RequestInit,
  };
}

/**
 * Hands one email to PostHog. Resolves once PostHog has accepted it, which is
 * not the same as delivered: PostHog queues sends above the project's daily
 * allowance, and reports bounces as `$workflows_email_bounced` events.
 */
export async function sendEmail(stream: EmailStream, email: OutgoingEmail): Promise<void> {
  const { url, init } = emailRequest(stream, email);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new EmailSendError(`PostHog unreachable: ${String(err)}`, true);
  }
  if (res.ok) return;
  const body = (await res.text().catch(() => "")).slice(0, 300);
  // 429 and 5xx may pass on a retry; 4xx (bad secret, wrong URL, bad body)
  // will not.
  throw new EmailSendError(
    `PostHog refused the email (${res.status}): ${body}`,
    res.status === 429 || res.status >= 500,
  );
}
