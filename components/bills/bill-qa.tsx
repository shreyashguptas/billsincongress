'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { billsService } from '@/lib/services/bills-service';
import ReactMarkdown from 'react-markdown';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface BillQAProps {
  billId: string;
}

const EXAMPLE_QUESTIONS = [
  'What does this bill do in simple terms?',
  "What's the current status and what's next?",
  'Who supports or opposes this bill?',
  'What are the key sections of this bill?',
];

function generateSessionId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'bill_chat_session_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = generateSessionId();
    localStorage.setItem(key, id);
  }
  return id;
}

const MarkdownMessage = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-2 space-y-1">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      h1: ({ children }) => <h3 className="font-serif text-base font-semibold mt-3 mb-1.5">{children}</h3>,
      h2: ({ children }) => <h3 className="font-serif text-base font-semibold mt-3 mb-1.5">{children}</h3>,
      h3: ({ children }) => <h3 className="font-serif text-sm font-semibold mt-2 mb-1">{children}</h3>,
      a: ({ href, children }) => (
        <a
          href={href}
          className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="rounded-sm border border-border bg-card px-4 py-3 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '160ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '320ms' }} />
    </div>
  </div>
);

export default function BillQA({ billId }: BillQAProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);

    billsService
      .getBillChatHistory(billId, sid)
      .then((history) => {
        setMessages(history.map((m) => ({ id: m._id, role: m.role, content: m.content })));
      })
      .catch(() => {})
      .finally(() => setIsLoadingHistory(false));
  }, [billId]);

  useEffect(() => {
    if (!isLoadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoadingHistory]);

  const handleSubmit = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || isLoading || !sessionId) return;

      const tempId = `temp_${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, role: 'user', content: q }]);
      setInput('');
      setIsLoading(true);
      setError('');

      try {
        const result = await billsService.sendChatMessage(billId, sessionId, q);
        if (result.error) {
          setError(result.error);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
        } else {
          setMessages((prev) => [
            ...prev,
            { id: `assistant_${Date.now()}`, role: 'assistant', content: result.answer },
          ]);
        }
      } catch {
        setError('Failed to get a response. Please try again.');
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [billId, sessionId, isLoading]
  );

  const isEmpty = messages.length === 0 && !isLoadingHistory;
  const questionCount = messages.filter((m) => m.role === 'user').length;

  return (
    <div className="rounded-sm border border-border bg-background flex flex-col overflow-hidden" style={{ height: '540px' }}>
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-status-law" aria-hidden="true" />
          <p className="label-eyebrow !mb-0">Bill chat</p>
        </div>
        {questionCount > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground tabular">
            {questionCount} {questionCount === 1 ? 'question' : 'questions'}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3 min-h-0">
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-foreground border-t-transparent" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <p className="text-sm text-muted-foreground mb-5 max-w-sm leading-relaxed">
              Ask any question about this bill — its provisions, status, sponsors, or impact.
            </p>
            <div className="flex flex-col gap-1.5 w-full max-w-md">
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(q)}
                  disabled={isLoading}
                  className="px-3 py-2.5 text-sm text-left rounded-sm border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-sm px-4 py-2.5 text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'bg-foreground text-background'
                      : 'border border-border bg-card text-foreground'
                  )}
                >
                  {message.role === 'assistant' ? <MarkdownMessage content={message.content} /> : <p>{message.content}</p>}
                </div>
              </div>
            ))}

            {isLoading && <TypingIndicator />}

            {!isLoading && messages.length > 0 && messages.length < 4 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {EXAMPLE_QUESTIONS.filter(
                  (q) => !messages.some((m) => m.role === 'user' && m.content === q)
                )
                  .slice(0, 3)
                  .map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSubmit(q)}
                      disabled={isLoading}
                      className="px-2.5 py-1 text-[12px] border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="px-3 py-2 border border-destructive/30 bg-destructive/5 rounded-sm max-w-sm text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border px-5 py-3 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isEmpty ? 'Ask a question…' : 'Ask a follow-up…'}
            className="flex-1 h-10 px-3 text-sm rounded-sm border border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground"
            disabled={isLoading || isLoadingHistory}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={isLoading || isLoadingHistory || !input.trim()}
            aria-label="Send"
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-foreground text-background hover:bg-foreground/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isLoading ? (
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
