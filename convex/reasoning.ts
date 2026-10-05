/**
 * The answer model's reasoning setting. Pure (no Convex imports), so
 * convex/answer.ts and scripts/check-grounding.ts share one definition and it
 * carries unit tests.
 */

/**
 * Private reasoning: the model thinks in a separate field that is never shown.
 *
 * It was switched off when this was one-bill chat (f07e23e: "thinking tokens
 * would add latency and output cost without better answers"). Now that the
 * answer is a multi-round tool loop, that thinking had nowhere to go but the
 * answer itself: a reader on 2026-10-05 was shown "Since the list is ordered
 * most-bills-first… the rows shown are a sample of 553 total. But the question
 * is about senators specifically…" before the answer. With it on, the thinking
 * comes back in `message.reasoning`, recorded in the AI trace and never sent to
 * the reader. answerSanitize.ts stays as the safety net.
 *
 * OPENROUTER_REASONING switches it without a deploy: "off" (or "false", "none",
 * "no", "0", "disabled") turns it off; "minimal", "low", "medium" or "high" sets
 * the effort. Default low, and anything else falls back to low with a log line.
 */
const OFF = new Set(["off", "false", "none", "no", "0", "disabled"]);
const EFFORTS = new Set(["minimal", "low", "medium", "high"]);

export function reasoningConfig(
  setting: string | undefined,
): { enabled: false } | { effort: string } {
  const value = (setting ?? "").trim().toLowerCase();
  if (OFF.has(value)) return { enabled: false };
  if (value === "") return { effort: "low" };
  if (EFFORTS.has(value)) return { effort: value };
  // A typo in the incident off switch ("lo", "disbled") must not become an
  // effort OpenRouter refuses on every request. Say so, and use the default.
  console.error(`OPENROUTER_REASONING="${setting}" is not off or an effort (minimal, low, medium, high); using low`);
  return { effort: "low" };
}

/**
 * The completion budget. On most providers max_tokens covers reasoning AND the
 * answer together, and a budget spent thinking returns an empty answer marked
 * finish_reason "length". So reasoning adds room on top of the answer's own.
 */
export const ANSWER_MAX_TOKENS = 2048;
export const REASONING_HEADROOM_TOKENS = 2048;
