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
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc ml-5 mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal ml-5 mb-2 space-y-1">{children}</ol>
  ),
};

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
      <div className="border-l-2 border-border pl-3 space-y-2">
        <p className="label-eyebrow">One question first</p>
        <div className="font-serif text-[15px] leading-relaxed">
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{turn.content}</ReactMarkdown>
        </div>
        {awaiting && (
          <p className="text-xs text-muted-foreground">
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
    <div className="space-y-2">
      <WorkLog entries={turn.work ?? []} done={Boolean(turn.done)} />
      <div className="font-serif text-[15px] leading-relaxed">
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
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 lg:px-5"
      >
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ask anything about bills in Congress — what one does, where it stands, who wrote
            it. Every answer cites the records it came from.
          </p>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            <p key={turn.id} className="font-serif text-lg leading-snug">
              {turn.content}
            </p>
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
          <div className="px-3 py-2 border border-destructive/30 bg-destructive/5 rounded-sm">
            <p className="text-sm text-destructive">{error}</p>
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

      <div className="shrink-0 border-t border-border px-4 py-3 lg:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = input;
            setInput('');
            void ask(q, { source: 'typed' });
          }}
          className="flex items-center gap-2"
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
              'h-11 flex-1 rounded-sm border border-border bg-background px-3 text-base',
              'focus:border-foreground focus:outline-none disabled:opacity-60',
              'lg:h-10 lg:text-sm',
            )}
            disabled={busy}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-foreground text-background',
              'transition-colors hover:bg-foreground/85 disabled:opacity-40 lg:h-10 lg:w-10',
            )}
          >
            {busy ? (
              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-background border-t-transparent" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
