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
 * the conversation survives navigation. This component can therefore be
 * unmounted and remounted freely without losing anything.
 */
export default function AnswerThread({ surface = 'panel' }: { surface?: string }) {
  const { turns, busy, error, ask } = useAnswers();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the answer as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5 min-h-0"
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

      <div className="border-t border-border px-5 py-3 shrink-0">
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={turns.length === 0 ? 'Ask a question…' : 'Ask a follow-up…'}
            aria-label="Ask a question"
            className="flex-1 h-10 px-3 text-sm rounded-sm border border-border bg-background focus:outline-none focus:border-foreground disabled:opacity-60"
            disabled={busy}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-sm bg-foreground text-background',
              'hover:bg-foreground/85 transition-colors disabled:opacity-40 shrink-0',
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
