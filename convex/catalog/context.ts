/**
 * What the reader has open, validated at the boundary and turned into prompt.
 *
 * WHY THIS IS A SEPARATE MODULE. The client half of this lives in
 * `lib/page-context.ts`, but nothing here trusts it. `/answer/stream` is an
 * httpAction on `*.convex.site` and is publicly addressable — it does not have
 * to arrive via `app/api/answer/route.ts`, so route-level validation is defence
 * in depth and this is the actual boundary. Everything crossing it is an enum
 * from a closed set, a bounded integer, or a string matched against a pattern.
 *
 * WHY THE PROMPT IS COMPOSED HERE RATHER THAN SENT. Every sentence below is
 * built from a constant table plus validated ids. The one piece of client text
 * that reaches the model is the scope label, and it is stripped of newlines and
 * clamped first — it is partly reader-typed (the title filter flows into it via
 * `lib/answer-scope.ts`) and until now it was interpolated into the system
 * prompt with no length, charset or shape check anywhere in the chain.
 *
 * WHAT CONTEXT IS FOR. It says WHERE TO LOOK, never what is true. Prose
 * injected into a prompt carries no `_cite` handle, so `cite.ts` deletes any
 * citation hung on it and the reader is left with an unsupported sentence. The
 * facts still come from the retrieval tools, with handles attached — which is
 * why the focused bill is SEEDED as a tool result in `answer.ts` rather than
 * described here.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

export type AskRoute = "home" | "bill" | "list" | "hub" | "learn" | "other";

export interface PageContext {
  route: AskRoute;
  congress?: number;
  billId?: string;
}

const ROUTES: readonly AskRoute[] = ["home", "bill", "list", "hub", "learn", "other"];

/** Congress, type, congress suffix — e.g. `1234hr119`. */
export const BILL_ID_PATTERN = /^\d{1,5}[a-z]{1,7}\d{2,3}$/;

/** The 1st Congress sat in 1789; 200 will not arrive for three centuries. */
const MIN_CONGRESS = 1;
const MAX_CONGRESS = 200;

/** Long enough for any real filter description, short enough to be harmless. */
export const MAX_LABEL_CHARS = 120;

/**
 * Read the client's claim about what is on screen. Malformed parts are DROPPED
 * rather than rejected: a bad hint should quietly cost the answer some context,
 * never fail the reader's question.
 */
export function parsePageContext(raw: unknown): PageContext | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const route = ROUTES.includes(input.route as AskRoute) ? (input.route as AskRoute) : "other";
  const ctx: PageContext = { route };

  const congress = input.congress;
  if (
    typeof congress === "number" &&
    Number.isInteger(congress) &&
    congress >= MIN_CONGRESS &&
    congress <= MAX_CONGRESS
  ) {
    ctx.congress = congress;
  }

  const billId = input.billId;
  if (typeof billId === "string" && BILL_ID_PATTERN.test(billId)) {
    ctx.billId = billId;
  }

  return ctx;
}

/** One line, bounded. See the header note on why this is not optional. */
export function sanitizeLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const flat = raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return flat.slice(0, MAX_LABEL_CHARS);
}

/** What each route is, in the model's own terms. Constants, never client text. */
const ROUTE_SENTENCE: Record<AskRoute, string> = {
  home: "The reader is on the home dashboard: totals for one Congress, how far bills have got, the biggest policy areas and the busiest sponsors.",
  bill: "The reader is on a single bill's page.",
  list: "The reader is on the browsable list of bills.",
  hub: "The reader is on a browse page for one chamber, one status or one policy area.",
  learn: "The reader is on the plain-language guide to how Congress works. They are probably asking what something MEANS, not for a specific bill.",
  other: "",
};

/**
 * The CURRENT CONTEXT block appended to the system prompt. Empty string when
 * there is nothing worth saying — the prompt is long enough already.
 */
export function renderContextBlock(ctx: PageContext | null, scopeLabel?: unknown): string {
  const label = sanitizeLabel(scopeLabel);
  const lines: string[] = [];

  if (ctx?.billId) {
    lines.push(
      `The reader has bill ${ctx.billId} open. "this bill", "it" and "this" mean that one. ` +
        `Its row is already in the context above, so do not look it up again. ` +
        `For its timeline call bill_actions with {"billId":"${ctx.billId}"}; ` +
        `for the official summary call bill_summaries with the same.`,
    );
  } else if (ctx && ROUTE_SENTENCE[ctx.route]) {
    lines.push(ROUTE_SENTENCE[ctx.route]);
  }

  if (ctx?.congress !== undefined) {
    lines.push(
      // Deliberately not an ordinal: "121th" is the kind of small wrongness that
      // makes a reader distrust everything else in the answer.
      `They have Congress ${ctx.congress} selected. Use congress: ${ctx.congress} in ` +
        `every fetch unless the question names a different one.`,
    );
  }

  if (label) {
    lines.push(
      `They are looking at a filtered set: ${label}. Those rows are already in your ` +
        `context — use them. Only fetch again if the question needs something outside ` +
        `that set, and say so when you do.`,
    );
  }

  if (lines.length === 0) return "";
  return `\n\nCURRENT CONTEXT\n${lines.join("\n")}`;
}
