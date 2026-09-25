/**
 * Bill-alert digests: which actions are new since the last email, and the email
 * that reports them. PURE — no Convex imports — so the "what is new" rule and
 * the rendered email are unit-tested in alertDigest.test.ts without a database.
 *
 * Accuracy matters here the same way it does on the site: an alert that says a
 * bill moved when it did not, or stays silent when it did, is a false statement
 * in our voice. Every line in the email is an action or status we hold from
 * Congress.gov, quoted as stored; nothing is summarised or predicted.
 */
import { BillStageDescriptions } from "./billStage";
import { formatCongressOrdinal } from "../lib/congress";
import {
  BRAND,
  C,
  MONO,
  SANS,
  SERIF,
  emailDocument,
  escapeHtml,
  masthead,
  preheader,
  type RenderedEmail,
} from "./emailStyle";

/** Actions shown per bill before "and N more on the bill page". */
export const MAX_ACTIONS_PER_BILL = 8;

/** Bills shown in full (with their actions) in one digest; the rest are listed compactly. */
export const MAX_BILLS_IN_FULL = 12;

/**
 * Size ceiling for a digest's HTML body. Gmail clips a message over ~102 KB
 * (hiding everything after the cut, including the unsubscribe link), and
 * PostHog wraps the body in its own template, so leave room: a digest that
 * would exceed this shows fewer bills in full and lists the rest compactly.
 */
export const MAX_DIGEST_HTML_BYTES = 80 * 1024;

export interface ActionRow {
  actionDate: string; // YYYY-MM-DD
  text: string;
}

export interface Watermark {
  lastSeenActionDate?: string;
  lastSeenActionFingerprints: string[];
  lastSeenStage?: number;
}

/**
 * Identity of an action for "have we reported this?". Date + text only:
 * Congress.gov often lists one floor action twice (House clerk and Library of
 * Congress, different codes, same words), and a reader must not see it twice.
 * Whitespace is collapsed so a re-sync that reflows the text is not "new".
 */
export function fingerprintAction(action: ActionRow): string {
  const key = `${action.actionDate}|${action.text.replace(/\s+/g, " ").trim()}`;
  // FNV-1a, 32-bit. Collisions only matter between two actions on the SAME
  // date of the SAME bill, and a collision would hide one line, not invent one.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The watermark that treats every current action as already reported. */
export function watermarkFor(
  actions: readonly ActionRow[],
  stage: number | undefined,
): Watermark {
  let latest: string | undefined;
  for (const a of actions) if (latest === undefined || a.actionDate > latest) latest = a.actionDate;
  const onLatest = actions.filter((a) => a.actionDate === latest).map(fingerprintAction);
  return {
    lastSeenActionDate: latest,
    lastSeenActionFingerprints: [...new Set(onLatest)],
    lastSeenStage: stage,
  };
}

/**
 * Actions not yet reported, oldest first, duplicates removed. An action is new
 * when it is dated after the watermark, or dated ON the watermark's day with a
 * fingerprint the watermark has not seen.
 */
export function newActionsSince(
  actions: readonly ActionRow[],
  watermark: Watermark,
): ActionRow[] {
  const seen = new Set(watermark.lastSeenActionFingerprints);
  const out: ActionRow[] = [];
  const emitted = new Set<string>();
  for (const a of actions) {
    const fp = fingerprintAction(a);
    if (emitted.has(fp)) continue;
    const since = watermark.lastSeenActionDate;
    const isNew =
      since === undefined ||
      a.actionDate > since ||
      (a.actionDate === since && !seen.has(fp));
    if (!isNew) continue;
    emitted.add(fp);
    out.push(a);
  }
  return out.sort((x, y) => (x.actionDate < y.actionDate ? -1 : x.actionDate > y.actionDate ? 1 : 0));
}

export interface BillChange {
  billId: string;
  billTypeLabel: string; // "H.R."
  billNumber: string;
  congress: number;
  title: string;
  /** Set only when the stage actually changed since the last email. */
  stageChange?: { from?: number; to: number };
  newActions: ActionRow[];
}

/** A change worth an email: a new action, or a status change with none. */
export function hasNews(change: BillChange): boolean {
  return change.newActions.length > 0 || change.stageChange !== undefined;
}

export function billLabel(change: Pick<BillChange, "billTypeLabel" | "billNumber">): string {
  return `${change.billTypeLabel} ${change.billNumber}`;
}

function stageName(stage: number): string {
  return BillStageDescriptions[stage] ?? "Status updated";
}

/** "Passed One Chamber" → "passed one chamber" for mid-sentence use. */
function stagePhrase(stage: number): string {
  const name = stageName(stage);
  return name === "To President" ? "went to the President" : name.toLowerCase();
}

export function digestSubject(changes: readonly BillChange[]): string {
  if (changes.length === 1) {
    const c = changes[0];
    return c.stageChange
      ? `${billLabel(c)} ${stagePhrase(c.stageChange.to)}`
      : `New action on ${billLabel(c)}`;
  }
  // Lead with a status change when there is one: it is the news.
  const lead = changes.find((c) => c.stageChange) ?? changes[0];
  const rest = changes.length - 1;
  const leadText = lead.stageChange
    ? `${billLabel(lead)} ${stagePhrase(lead.stageChange.to)}`
    : `New action on ${billLabel(lead)}`;
  return `${leadText}, and ${rest} more bill${rest === 1 ? "" : "s"} you follow`;
}

/** "2026-09-23" → "Sep 23, 2026". Parsed as UTC so the day never shifts. */
export function formatActionDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface DigestLinks {
  siteUrl: string; // no trailing slash
  manageUrl: string;
  unsubscribeUrl: string;
}

function billUrl(links: DigestLinks, billId: string): string {
  return `${links.siteUrl}/bills/${encodeURIComponent(billId)}`;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Titles in the compact list are cut to this many characters. */
const COMPACT_TITLE_CHARS = 110;

/**
 * Official titles run to hundreds of characters; the compact list shows a
 * shortened one (the bill page has it in full), which is what keeps a
 * 100-bill day under the size budget whatever the titles are.
 */
function shortTitle(title: string): string {
  return title.length <= COMPACT_TITLE_CHARS ? title : `${title.slice(0, COMPACT_TITLE_CHARS - 1).trimEnd()}…`;
}

/** "H.R. 4318 — Rural Broadband… · now Passed One Chamber · 3 new actions" */
function compactLine(change: BillChange): string {
  const parts = [`${billLabel(change)} — ${shortTitle(change.title)}`];
  if (change.stageChange) parts.push(`now ${stageName(change.stageChange.to)}`);
  const n = change.newActions.length;
  if (n > 0) parts.push(`${n} new action${n === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function renderCompactHtml(rest: readonly BillChange[], links: DigestLinks, afterFull: boolean): string {
  const items = rest
    .map((c) => {
      const url = billUrl(links, c.billId);
      const detail = [
        c.stageChange ? `now ${escapeHtml(stageName(c.stageChange.to))}` : "",
        c.newActions.length > 0
          ? `${c.newActions.length} new action${c.newActions.length === 1 ? "" : "s"}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr><td style="padding:5px 0;font:14px/1.45 ${SANS};color:${C.ink};"><a href="${escapeHtml(url)}" style="color:${C.ink};font-weight:600;">${escapeHtml(billLabel(c))}</a> ${escapeHtml(shortTitle(c.title))}<span style="color:${C.muted};"> &middot; ${detail}</span></td></tr>`;
    })
    .join("\n");
  return `<tr><td style="padding:22px 28px 18px;border-top:1px solid ${C.rule};">
  <p style="margin:0 0 8px;font:11px/1.4 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.muted};">${afterFull ? "Also moved" : "The bills"} (${rest.length})</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${items}
  </table>
</td></tr>`;
}

function renderBillHtml(change: BillChange, links: DigestLinks): string {
  const shown = [...change.newActions].reverse().slice(0, MAX_ACTIONS_PER_BILL);
  const hidden = change.newActions.length - shown.length;
  const url = billUrl(links, change.billId);

  const stage = change.stageChange
    ? `<p style="margin:0 0 14px;font:600 13px/1.4 ${SANS};color:${C.accent};">Now: ${escapeHtml(stageName(change.stageChange.to))}${
        change.stageChange.from !== undefined
          ? `<span style="font-weight:400;color:${C.muted};"> &nbsp;(was ${escapeHtml(stageName(change.stageChange.from))})</span>`
          : ""
      }</p>`
    : "";

  const rows = shown
    .map(
      (a) => `<tr>
  <td valign="top" width="104" style="width:104px;padding:6px 14px 6px 0;font:12px/1.5 ${MONO};color:${C.muted};white-space:nowrap;">${escapeHtml(formatActionDate(a.actionDate))}</td>
  <td valign="top" style="padding:6px 0;font:14px/1.5 ${SANS};color:${C.ink};">${escapeHtml(a.text)}</td>
</tr>`,
    )
    .join("\n");

  const more =
    hidden > 0
      ? `<p style="margin:8px 0 0;font:13px/1.5 ${SANS};color:${C.muted};">and ${hidden} earlier new action${hidden === 1 ? "" : "s"} on the bill page</p>`
      : "";

  return `<tr><td style="padding:24px 28px;border-top:1px solid ${C.rule};">
  <p style="margin:0 0 6px;font:11px/1.4 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.muted};">${escapeHtml(billLabel(change))} &middot; ${escapeHtml(formatCongressOrdinal(change.congress))} Congress</p>
  <p style="margin:0 0 12px;font:600 18px/1.35 ${SERIF};color:${C.ink};"><a href="${escapeHtml(url)}" style="color:${C.ink};text-decoration:none;">${escapeHtml(change.title)}</a></p>
  ${stage}
  ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>` : ""}
  ${more}
  <p style="margin:14px 0 0;font:600 14px/1.4 ${SANS};"><a href="${escapeHtml(url)}" style="color:${C.accent};text-decoration:underline;">Open ${escapeHtml(billLabel(change))} &rarr;</a></p>
</td></tr>`;
}

function renderBillText(change: BillChange, links: DigestLinks): string {
  const lines = [`${billLabel(change)} (${formatCongressOrdinal(change.congress)} Congress)`, change.title];
  if (change.stageChange) {
    lines.push(
      `Now: ${stageName(change.stageChange.to)}` +
        (change.stageChange.from !== undefined ? ` (was ${stageName(change.stageChange.from)})` : ""),
    );
  }
  const shown = [...change.newActions].reverse().slice(0, MAX_ACTIONS_PER_BILL);
  for (const a of shown) lines.push(`  ${formatActionDate(a.actionDate)}  ${a.text}`);
  const hidden = change.newActions.length - shown.length;
  if (hidden > 0) lines.push(`  and ${hidden} earlier new action${hidden === 1 ? "" : "s"} on the bill page`);
  lines.push(billUrl(links, change.billId));
  return lines.join("\n");
}

/**
 * The daily digest. Newest action first within a bill; bills in the order
 * given (the caller puts status changes first).
 */
export function renderDigestEmail(
  changes: readonly BillChange[],
  links: DigestLinks,
  sentOn: Date,
): RenderedEmail {
  const subject = digestSubject(changes);
  const dateLine = sentOn.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  const count = `${changes.length} bill${changes.length === 1 ? "" : "s"} you follow ${changes.length === 1 ? "has" : "have"} new activity`;

  // Most important first (the caller sorts: status changes, then most
  // actions). Show as many in full as fit the size budget, the rest as one
  // line each, so a heavy day never produces an email Gmail clips or PostHog
  // refuses. Every changed bill still appears.
  let inFull = Math.min(changes.length, MAX_BILLS_IN_FULL);
  let bodyHtml = buildBody(inFull);
  while (inFull > 0 && byteLength(bodyHtml) > MAX_DIGEST_HTML_BYTES) {
    inFull -= 1;
    bodyHtml = buildBody(inFull);
  }

  function buildBody(full: number): string {
    const rest = changes.slice(full);
    return `${preheader(`${count}.`)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.ground};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:${C.card};border:1px solid ${C.rule};">
${masthead(`Bill alerts · ${dateLine}`)}
<tr><td style="padding:20px 28px 4px;font:15px/1.55 ${SANS};color:${C.ink};">${escapeHtml(count)} since your last alert.</td></tr>
${changes.slice(0, full).map((c) => renderBillHtml(c, links)).join("\n")}
${rest.length > 0 ? renderCompactHtml(rest, links, full > 0) : ""}
<tr><td style="padding:20px 28px 26px;border-top:1px solid ${C.rule};font:12px/1.6 ${SANS};color:${C.muted};">
  Actions and status come from Congress.gov, shown as the official record states them. Congress.gov can post an action a day or more after it happens.<br><br>
  You get this because you follow these bills with ${BRAND} Pro. It only arrives on days something changes.<br>
  <a href="${escapeHtml(links.manageUrl)}" style="color:${C.muted};">Choose which bills</a> &middot; <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:${C.muted};">Stop all bill alert emails</a>
</td></tr>
</table>
</td></tr>
</table>
`;
  }

  const html = emailDocument(subject, bodyHtml);
  const rest = changes.slice(inFull);

  const text = [
    `${BRAND} — bill alerts, ${dateLine}`,
    "",
    `${count} since your last alert.`,
    "",
    changes.slice(0, inFull).map((c) => renderBillText(c, links)).join("\n\n"),
    ...(rest.length > 0
      ? [
          "",
          inFull > 0 ? `Also moved (${rest.length}):` : `The bills (${rest.length}):`,
          ...rest.map((c) => `- ${compactLine(c)}: ${billUrl(links, c.billId)}`),
        ]
      : []),
    "",
    "---",
    "Actions and status come from Congress.gov, shown as the official record states them.",
    `You get this because you follow these bills with ${BRAND} Pro. It only arrives on days something changes.`,
    `Choose which bills: ${links.manageUrl}`,
    `Stop all bill alert emails: ${links.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, bodyHtml, text };
}
