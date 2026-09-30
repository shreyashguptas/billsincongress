/**
 * "Was this answer right?" — what one tap sends.
 *
 * Every wrong answer found so far was found by us, in an audit: readers had no
 * way to say one was wrong. This is that way. A "no" is only useful if it can
 * be reproduced, so it carries the question and the answer the reader saw; the
 * next step is a case in `scripts/truth/questions.ts` (AGENTS.md, "Answer
 * accuracy").
 *
 * A "yes" carries neither. It is counted, not read, and the question text is
 * already on `answer_question_submitted` for anyone who needs it.
 *
 * Kept free of React and posthog-js so it can be unit-tested under `tsx`.
 */

export type AnswerVerdict = 'right' | 'wrong';

/** The fields of a thread turn this needs; the provider's `Turn` satisfies it. */
export interface RatableTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  webSources?: unknown[];
  done?: boolean;
  askedReader?: boolean;
}

/**
 * Longest answer text sent with a "no". Answers run a few thousand characters;
 * the cap exists so an answer that somehow runs away cannot make one event
 * enormous. `answer_clipped` says when it applied.
 */
export const RATED_ANSWER_MAX = 8000;

// A type, not an interface: `capture()` takes a Record, which an interface is
// not assignable to.
export type AnswerRatedProps = {
  surface: string;
  verdict: AnswerVerdict;
  answer_id: string;
  question_number: number;
  answer_length: number;
  db_source_count: number;
  web_source_count: number;
  /** Signed-in threads only: the saved conversation, to read the whole thread. */
  chat_id?: string;
  // Sent only with a "no":
  question?: string;
  /** The reader's question before this one, when this was a follow-up. */
  previous_question?: string;
  answer?: string;
  answer_clipped?: boolean;
  sources?: string[];
};

/**
 * A turn can be rated only once it is a finished answer. A clarifying question
 * (`askedReader`) is not an answer, and an empty turn has nothing to judge.
 */
export function canRate(turn: RatableTurn): boolean {
  return (
    turn.role === 'assistant' &&
    Boolean(turn.done) &&
    !turn.askedReader &&
    turn.content.trim().length > 0
  );
}

/**
 * The event for one rating, or null when `answerId` is not a ratable answer in
 * `turns`.
 *
 * The question is the nearest reader turn ABOVE the answer, not the last one in
 * the thread: a reader can rate an earlier answer after asking more.
 */
export function answerRatedProps(
  turns: RatableTurn[],
  answerId: string,
  verdict: AnswerVerdict,
  ctx: { surface: string; chatId?: string | null },
): AnswerRatedProps | null {
  const at = turns.findIndex((t) => t.id === answerId);
  if (at === -1 || !canRate(turns[at])) return null;
  const answer = turns[at];

  const questionsBefore = turns.slice(0, at).filter((t) => t.role === 'user');
  const question = questionsBefore[questionsBefore.length - 1];
  const previous = questionsBefore[questionsBefore.length - 2];

  const sources = answer.sources ?? [];
  const props: AnswerRatedProps = {
    surface: ctx.surface,
    verdict,
    answer_id: answer.id,
    question_number: questionsBefore.length,
    answer_length: answer.content.length,
    db_source_count: sources.filter((h) => !h.startsWith('web:')).length,
    web_source_count: (answer.webSources ?? []).length,
    ...(ctx.chatId ? { chat_id: ctx.chatId } : {}),
  };
  if (verdict === 'right') return props;

  const clipped = answer.content.length > RATED_ANSWER_MAX;
  return {
    ...props,
    ...(question ? { question: question.content } : {}),
    ...(previous ? { previous_question: previous.content } : {}),
    answer: clipped ? answer.content.slice(0, RATED_ANSWER_MAX) : answer.content,
    answer_clipped: clipped,
    sources,
  };
}
