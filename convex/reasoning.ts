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
 * It was on at "low" by default from 2026-10-05, because the model was gpt-oss-120b, which always
 * reasons ("Reasoning is mandatory for this endpoint and cannot be disabled")
 * and does it fast. Measured on 2026-10-05 with the real answer loop over the
 * production data: a typical round reasons for 10 to 80 tokens, which on
 * Cerebras is a few hundredths of a second. On the previous model (DeepSeek on
 * DeepInfra, about 25 tokens a second) the same setting took answers from about
 * 8 s to about 18 s, which is why the speed of the host, not the setting, is the
 * thing to watch.
 *
 * Since 2026-10-22 gpt-oss is the last resort, and the same setting also sets
 * the effort of the Claude models that answer first (claudeEffort in
 * convex/claude.ts): "minimal" and the off-words become "low" there, because
 * Claude Sonnet 5.5 cannot switch thinking off and lower effort is how both
 * Claude models are told to think less.
 *
 * "medium" BY DEFAULT since 2026-10-23, the owner's call after measuring it:
 * the 25 scored questions in scripts/truth/questions.ts, asked three times each
 * on production, got Claude Sonnet 5.5 75 of 75 right at medium against 72 of 75
 * at low (one "36 measures" for 33 bills, one hedge, one stray extra count), for
 * $1.15 against $1.13 per 75 answers and no slower (3.9 s against 4.1 s). Claude
 * Opus 5.5 also scored 75 of 75, at both efforts, for about twice the price and
 * 5.5 s. gpt-oss, the last resort, reasons at medium too: on Cerebras that is
 * still well under a second a round.
 *
 * OPENROUTER_REASONING: "minimal", "low", "medium" or "high" sets the effort;
 * an off-word ("off", "false", "none", "no", "0", "disabled") asks for none,
 * which a model that cannot switch it off refuses (answer.ts then retries with
 * the model's own default); anything unrecognised logs and uses "medium".
 */
const OFF = new Set(["off", "false", "none", "no", "0", "disabled"]);
const EFFORTS = new Set(["minimal", "low", "medium", "high"]);
const DEFAULT_EFFORT = "medium";

export function reasoningConfig(
  setting: string | undefined,
): { enabled: false } | { effort: string } {
  const value = (setting ?? "").trim().toLowerCase();
  if (OFF.has(value)) return { enabled: false };
  if (value === "") return { effort: DEFAULT_EFFORT };
  if (EFFORTS.has(value)) return { effort: value };
  // A typo in the setting ("lo", "disbled") must not become an effort
  // OpenRouter refuses on every request. Say so, and use the default.
  console.error(
    `OPENROUTER_REASONING="${setting}" is not off or an effort (minimal, low, medium, high); using "${DEFAULT_EFFORT}"`,
  );
  return { effort: DEFAULT_EFFORT };
}

/**
 * The completion budget. On most providers max_tokens covers reasoning AND the
 * answer together, and a budget spent thinking returns an empty answer marked
 * finish_reason "length". So reasoning adds room on top of the answer's own.
 */
export const ANSWER_MAX_TOKENS = 2048;
export const REASONING_HEADROOM_TOKENS = 2048;
