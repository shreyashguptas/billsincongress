'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { billsService } from '@/lib/services/bills-service';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface BillQAProps {
  billId: string;
}

const EXAMPLE_QUESTIONS = [
  "What does this bill do in simple terms?",
  "What is the current status and what's next?",
  "Who supports or opposes this bill?",
  "What are the key sections of this bill?",
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
      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
      li: ({ children }) => <li className="ml-1">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
      h2: ({ children }) => <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
      a: ({ href, children }) => (
        <a
          href={href}
          className="text-primary underline underline-offset-2"
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
    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '160ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '320ms' }}
      />
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

  // Initialise session and load persisted history on mount
  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);

    billsService
      .getBillChatHistory(billId, sid)
      .then((history) => {
        setMessages(
          history.map((m) => ({
            id: m._id,
            role: m.role,
            content: m.content,
          }))
        );
      })
      .catch(() => {
        // History fetch failure is non-fatal — start fresh
      })
      .finally(() => setIsLoadingHistory(false));
  }, [billId]);

  // Scroll to the latest message
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
          // Remove the optimistic user message on error
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
    <div className="bg-card rounded-lg shadow-lg mt-4 flex flex-col overflow-hidden" style={{ height: '520px' }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <h2 className="text-base font-semibold">Ask about this bill</h2>
        {questionCount > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {questionCount} {questionCount === 1 ? 'question' : 'questions'}
          </span>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : isEmpty ? (
          /* Empty state: example questions */
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <p className="text-sm text-muted-foreground mb-4">
              Ask any question about this bill. Try one of these:
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center max-w-lg">
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(q)}
                  disabled={isLoading}
                  className="px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-left sm:text-center disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && <TypingIndicator />}

            {/* Example chips shown after first message for quick follow-ups */}
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
                      className="px-2.5 py-1 text-xs bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80 transition-colors disabled:opacity-50"
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
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg max-w-sm text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────── */}
      <div className="border-t px-4 py-3 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(input);
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isEmpty ? 'Ask a question about this bill…' : 'Ask a follow-up question…'}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            disabled={isLoading || isLoadingHistory}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={isLoading || isLoadingHistory || !input.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent" />
                <span>Thinking</span>
              </span>
            ) : (
              'Send'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
