'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { splitAnswer } from '@/lib/answer-entities';
import { useAnswers, type Turn } from './answer-provider';
import { SourceList } from './source-list';
import { WorkLog } from './work-log';
import { EntityBlock } from './entity-block';

/** How close to the bottom still counts as "following along". */
const PINNED_PX = 72;

const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 ml-5 list-disc space-y-1.5 marker:text-ink-3">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1.5 marker:font-mono marker:text-ink-3">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
};

/** Answer prose (brand.md, "Type"): Newsreader at the panel's reading size. */
const PROSE = 'font-serif text-reading-sm text-ink';

/**
 * The assistant asking the reader something, rather than answering.
 *
 * This exists because the model used to guess. "How many bills has the Senate
 * passed" has two readings — cleared the chamber, or became law — that give
 * very different numbers, and it silently picked one and stated it as fact.
 * Asking is the honest move, so it has to read as an invitation rather than a
 * failure: same serif voice as an answer, set off by a rule, no alert colour.
 *
 * No source apparatus: nothing is cited here, so a "From our database" heading
 * over an empty list would only imply the question was itself a finding. The
 * work log stays — whatever it looked up before deciding to ask is real.
 */
function ReaderQuestionTurn({ turn, awaiting }: { turn: Turn; awaiting: boolean }) {
  return (
    <div className="space-y-2">
      <WorkLog entries={turn.work ?? []} done={Boolean(turn.done)} />
      <div className="space-y-2 border-l-2 border-line-strong pl-4">
        <p className="label-eyebrow">One question first</p>
        <div className={PROSE}>
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{turn.content}</ReactMarkdown>
        </div>
        {awaiting && (
          <p className="text-[13px] leading-5 text-ink-3">
            Answer below and the thread carries on from there.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One assistant turn: prose interleaved with entity cards, then its sources.
 *
 * Entity directives are resolved against the handles the model was actually
 * given, so a bill it invented simply does not render (spec §6.6).
 */
function AssistantTurn({ turn, surface }: { turn: Turn; surface: string }) {
  const blocks = splitAnswer(turn.content, new Set(turn.allowed ?? []));

  return (
    <div className="space-y-3">
      <WorkLog entries={turn.work ?? []} done={Boolean(turn.done)} />
      <div className={PROSE}>
        {blocks.map((block, i) =>
          block.type === 'prose' ? (
            <ReactMarkdown key={i} components={MARKDOWN_COMPONENTS}>
              {block.text}
            </ReactMarkdown>
          ) : (
            <EntityBlock key={i} block={block} surface={surface} entities={turn.entities} />
          ),
        )}
      </div>
      {turn.done && (
        <SourceList
          handles={turn.sources ?? []}
          surface={surface}
          webReason={turn.webReason}
          webSources={turn.webSources}
        />
      )}
    </div>
  );
}

/**
 * The grounded answer thread — presentational only.
 *
 * All state lives in AnswerProvider, which is mounted in the root layout, so
 * the conversation survives navigation. The panel around this keeps it mounted
 * across every phase, so the scroll position below and the composer draft also
 * survive the panel stepping aside for a bill.
 */
export default function AnswerThread({ surface = 'panel' }: { surface?: string }) {
  const { turns, busy, error, ask } = useAnswers();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the answer as it streams in — but only for a reader who is still at
  // the bottom. Yanking someone back down while they are reading an earlier
  // paragraph of a long answer is the worst moment to do it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= PINNED_PX) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const streaming = turns.some((t) => t.role === 'assistant' && !t.done);
  const last = turns[turns.length - 1];
  // Only the LAST turn is still waiting on the reader. An earlier question they
  // have already answered keeps its rule and eyebrow, but stops asking again.
  const awaitingReply = Boolean(last?.askedReader && last.done);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 lg:px-5"
      >
        {turns.length === 0 && (
          <p className="text-[15px] leading-relaxed text-ink-2">
            Ask anything about bills in Congress — what one does, where it stands, who wrote
            it. Every answer cites the records it came from.
          </p>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            // The reader's own words: right-aligned in a quiet sunken block,
            // in the interface face, so the answer's serif stays the voice
            // of the record.
            <div key={turn.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-sunken px-4 py-3 text-[15px] leading-relaxed text-ink">
                {turn.content}
              </p>
            </div>
          ) : turn.askedReader ? (
            <ReaderQuestionTurn
              key={turn.id}
              turn={turn}
              awaiting={awaitingReply && turn.id === last?.id}
            />
          ) : (
            <AssistantTurn key={turn.id} turn={turn} surface={surface} />
          ),
        )}

        {error && (
          <div className="rounded-md border border-error/40 px-4 py-3">
            <p className="text-sm leading-relaxed text-error">{error}</p>
          </div>
        )}
      </div>

      {/* Answers stream in silently. This is the only thing that tells a screen
          reader an answer is on its way, and that one has arrived. */}
      <p aria-live="polite" className="sr-only">
        {streaming
          ? 'Writing an answer…'
          : awaitingReply
            ? 'A question for you, in the thread. Reply in the box below.'
            : turns.length > 0
              ? 'Answer ready.'
              : ''}
      </p>

      {/* The ask composer (brand.md, "Patterns"): raised, a line-strong edge,
          rounded-lg, the send button a 40px ink circle. */}
      <div className="shrink-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-2 lg:px-5 lg:pb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = input;
            setInput('');
            void ask(q, { source: 'typed' });
          }}
          className={cn(
            'flex h-[60px] items-center gap-2 rounded-lg border border-line-strong bg-raised pl-4 pr-2.5',
            'transition-shadow focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2 focus-within:ring-offset-paper',
          )}
        >
          <input
            id="ask-composer"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              awaitingReply
                ? 'Answer the question…'
                : turns.length === 0
                  ? 'Ask a question…'
                  : 'Ask a follow-up…'
            }
            aria-label={awaitingReply ? 'Answer the question' : 'Ask a question'}
            enterKeyHint="send"
            autoComplete="off"
            // 16px on small screens is not a style choice: iOS Safari zooms the
            // whole page in when a focused input is any smaller, and then never
            // zooms back out.
            className={cn(
              // The form draws the edge and the focus ring; the field itself is
              // bare (border-0, p-0 and ring-0 undo the forms plugin's input box).
              'h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink placeholder:text-ink-3',
              'focus:outline-none focus:ring-0 disabled:cursor-not-allowed lg:text-[15px]',
            )}
            disabled={busy}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className={cn(
              'focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink',
              'transition-colors hover:bg-ink/85 disabled:opacity-40',
            )}
          >
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-ink border-t-transparent" />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
