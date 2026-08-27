'use client';

import { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useAnswers } from './answer-provider';
import { analytics } from '@/lib/analytics';
import { starterQuestions, type StarterInput } from '@/lib/starter-questions';

/**
 * The masthead ask box (spec §6.1).
 *
 * Deliberately NOT a chat bubble: a single rule-bordered field at reading
 * width, with three generated starters beneath it as quiet text buttons. The
 * conversation itself belongs to the panel, so submitting here just calls
 * ask() and the panel takes over.
 */
export function HeroAsk({ starters }: { starters: StarterInput }) {
  const { ask, busy } = useAnswers();
  const [input, setInput] = useState('');
  const questions = starterQuestions(starters);

  return (
    <div className="mt-7 max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = input;
          setInput('');
          void ask(q, { source: 'typed' });
        }}
        className="flex items-center gap-2 border border-border rounded-sm bg-background focus-within:border-foreground transition-colors"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any bill in Congress…"
          aria-label="Ask about any bill in Congress"
          maxLength={2000}
          disabled={busy}
          className="flex-1 h-12 px-4 bg-transparent text-base border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Ask"
          className="mr-1.5 inline-flex h-9 w-9 items-center justify-center rounded-sm bg-foreground text-background hover:bg-foreground/85 transition-colors disabled:opacity-40 shrink-0"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-3 flex flex-col gap-1.5 items-start">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              analytics.answerStarterClicked({ surface: 'home', starter_text: q });
              void ask(q, { source: 'starter' });
            }}
            disabled={busy}
            className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <span className="text-muted-foreground/60 mr-1.5" aria-hidden="true">
              ▸
            </span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
