'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { billsService } from '@/lib/services/bills-service';
import ReactMarkdown from 'react-markdown';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  Clipboard,
  Database,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface BillQAProps {
  billId: string;
  billTypeLabel: string;
  billNumber: string;
  congress: number;
  currentStatus: string;
  policyArea?: string;
}

interface QATurn {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

const LOADING_STEPS: Array<{ label: string; description: string; icon: LucideIcon }> = [
  {
    label: 'Collecting bill records',
    description: 'Pulling sponsor, status, and summary from the production database.',
    icon: Database,
  },
  {
    label: 'Reading bill text',
    description: 'Fetching the bill language from Congress.gov for context.',
    icon: FileText,
  },
  {
    label: 'Drafting plain-language answer',
    description: 'Composing a direct answer grounded in bill details.',
    icon: Bot,
  },
];

const MAX_QUESTION_LENGTH = 320;

export default function BillQA({
  billId,
  billTypeLabel,
  billNumber,
  congress,
  currentStatus,
  policyArea,
}: BillQAProps) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QATurn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const exampleQuestions = useMemo(() => ([
    `What does ${billTypeLabel} ${billNumber} do in plain English?`,
    `What is this bill's current status and what happens next?`,
    policyArea
      ? `How could this affect ${policyArea.toLowerCase()} policy?`
      : 'Who is most likely to be affected by this bill?',
    'What are the strongest arguments for and against this bill?',
  ]), [billTypeLabel, billNumber, policyArea]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingProgress(0);
      setLoadingStep(0);
      return;
    }

    const startedAt = Date.now();
    const totalDurationMs = 12000;
    const stepDurationMs = 3200;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setLoadingProgress(Math.min(96, Math.round((elapsed / totalDurationMs) * 100)));
      setLoadingStep(
        Math.min(LOADING_STEPS.length - 1, Math.floor(elapsed / stepDurationMs))
      );
    }, 180);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (!resultsRef.current) return;
    resultsRef.current.scrollTo({
      top: resultsRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [history, isLoading, error]);

  const submitQuestion = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError('');
    setIsLoading(true);
    setPendingQuestion(trimmed);
    setQuestion('');

    try {
      const result = await billsService.askBillQuestion(billId, trimmed);
      if (result.error) {
        setQuestion(trimmed);
        setError(result.error);
      } else {
        setHistory((prev) => [
          ...prev,
          {
            id:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            question: trimmed,
            answer: result.answer,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setQuestion(trimmed);
      setError('Failed to get response. Please try again.');
    } finally {
      setPendingQuestion(null);
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQuestion(question);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await submitQuestion(question);
    }
  };

  const handleExampleClick = (example: string) => {
    if (isLoading) return;
    setQuestion(example);
    textareaRef.current?.focus();
  };

  const handleCopy = async (answer: string, turnId: string) => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopiedTurnId(turnId);
      window.setTimeout(() => setCopiedTurnId(null), 1600);
    } catch {
      // Clipboard support can be unavailable in some browser contexts.
    }
  };

  return (
    <section className="relative mt-6 overflow-hidden rounded-2xl border border-congress-navy-700/60 bg-gradient-to-br from-congress-navy-950 via-congress-navy-900 to-congress-navy-800 text-white shadow-elegant-lg">
      <div className="pointer-events-none absolute -left-20 top-8 h-52 w-52 rounded-full bg-congress-gold-500/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-4 h-56 w-56 rounded-full bg-congress-crimson-500/10 blur-3xl" />

      <div className="relative p-4 sm:p-7">
        <div className="mb-6 flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-congress-gold-500/40 bg-congress-gold-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-congress-gold-200">
            <Sparkles className="h-3.5 w-3.5" />
            Bill Intelligence Copilot
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
              Ask anything about this bill
            </h2>
            <p className="max-w-3xl text-sm text-congress-navy-200 sm:text-base">
              The answer combines production database records and the official bill text so you get
              plain-language guidance for this specific legislation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-congress-navy-100">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              {billTypeLabel} {billNumber}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              {congress}th Congress
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              {currentStatus}
            </span>
            {policyArea && (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                {policyArea}
              </span>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/15 bg-congress-navy-900/70 p-3 sm:p-4"
        >
          <label htmlFor="bill-qa-input" className="mb-2 block text-sm font-medium text-congress-navy-100">
            Your question
          </label>
          <textarea
            id="bill-qa-input"
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION_LENGTH))}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Ex: How would this bill affect students, workers, or local governments?"
            className="w-full resize-none rounded-xl border border-white/20 bg-congress-navy-950/80 px-4 py-3 text-sm text-white placeholder:text-congress-navy-300 focus:border-congress-gold-400 focus:outline-none focus:ring-2 focus:ring-congress-gold-400/30 sm:text-base"
            disabled={isLoading}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-congress-navy-300">
              Press Enter to ask, Shift+Enter for a new line. {question.length}/{MAX_QUESTION_LENGTH}
            </div>
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-congress-gold-500 px-4 py-2 text-sm font-semibold text-congress-navy-950 transition-colors hover:bg-congress-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  Ask AI
                  <ArrowUp className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-[0.1em] text-congress-navy-300">
            Try one of these
          </p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                disabled={isLoading}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-congress-navy-100 transition-colors hover:border-congress-gold-400/70 hover:bg-congress-gold-500/10 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/15 bg-congress-navy-950/55 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-congress-navy-200">
              Conversation
            </h3>
            {history.length > 0 && (
              <span className="text-xs text-congress-navy-300">
                {history.length} {history.length === 1 ? 'answer' : 'answers'}
              </span>
            )}
          </div>

          <div ref={resultsRef} className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
            {history.length === 0 && !isLoading && !error && (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-congress-navy-200">
                Ask a simple question to get a plain-language explanation, current status guidance,
                and context from this bill&apos;s text.
              </div>
            )}

            {history.map((turn) => (
              <article key={turn.id} className="space-y-2">
                <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-congress-gold-500 px-4 py-3 text-sm text-congress-navy-950 sm:text-base">
                  {turn.question}
                </div>

                <div className="max-w-[96%] rounded-2xl rounded-bl-md border border-white/15 bg-congress-navy-900/90 px-4 py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-congress-navy-300">
                      <Bot className="h-3.5 w-3.5" />
                      AI Answer
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(turn.answer, turn.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-1 text-xs text-congress-navy-200 transition-colors hover:border-congress-gold-400/70 hover:text-white"
                    >
                      {copiedTurnId === turn.id ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Clipboard className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="space-y-2 text-sm leading-relaxed text-congress-navy-50 sm:text-base">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>
                        ),
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-semibold text-white">{children}</h1>,
                        h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold text-white">{children}</h2>,
                        h3: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold text-white">{children}</h3>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="text-congress-gold-300 underline underline-offset-4"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {turn.answer}
                    </ReactMarkdown>
                  </div>
                  <p className="mt-3 text-[11px] text-congress-navy-300">
                    {new Date(turn.createdAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </article>
            ))}

            {isLoading && pendingQuestion && (
              <article className="space-y-2">
                <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-congress-gold-500/95 px-4 py-3 text-sm text-congress-navy-950 sm:text-base">
                  {pendingQuestion}
                </div>

                <div className="max-w-[96%] rounded-2xl rounded-bl-md border border-congress-gold-500/25 bg-congress-navy-900/80 px-4 py-3">
                  <div className="mb-3 flex items-center gap-2 text-sm text-congress-navy-100">
                    <Loader2 className="h-4 w-4 animate-spin text-congress-gold-300" />
                    Building answer from bill data and text...
                  </div>
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-congress-gold-500 to-congress-gold-300 transition-all duration-200"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>

                  <div className="space-y-2">
                    {LOADING_STEPS.map((step, index) => {
                      const StepIcon = step.icon;
                      const isActive = index <= loadingStep;
                      return (
                        <div
                          key={step.label}
                          className="flex items-start gap-2 rounded-lg px-2 py-1.5"
                        >
                          <StepIcon
                            className={`mt-0.5 h-3.5 w-3.5 ${isActive ? 'text-congress-gold-300' : 'text-congress-navy-400'}`}
                          />
                          <div>
                            <p className={`text-xs font-medium ${isActive ? 'text-congress-navy-100' : 'text-congress-navy-300'}`}>
                              {step.label}
                            </p>
                            <p className="text-xs text-congress-navy-400">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>
            )}

            {error && (
              <div className="rounded-xl border border-rose-300/35 bg-rose-500/15 px-4 py-3">
                <p className="text-sm text-rose-100">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
