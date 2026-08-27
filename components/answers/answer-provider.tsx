'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { analytics } from '@/lib/analytics';
import {
  loadTranscript,
  saveTranscript,
  clearTranscript,
  type Turn as StoredTurn,
} from '@/lib/transcript-cap';
import type { AnswerScope } from '@/lib/answer-scope';
import type { WorkEntry } from './work-log';

export interface WebSource {
  handle: string;
  url: string;
  title?: string;
  excerpt: string;
}

export interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  allowed?: string[];
  entities?: Record<string, Record<string, unknown>>;
  webReason?: string;
  webSources?: WebSource[];
  work?: WorkEntry[];
  done?: boolean;
}

export interface RateLimitInfo {
  kind: 'anonymous' | 'authed';
  max: number;
  resetAt: number;
}

interface AskOptions {
  source?: 'typed' | 'starter';
  scope?: AnswerScope | null;
}

interface AnswerContextValue {
  turns: Turn[];
  isOpen: boolean;
  busy: boolean;
  error: string;
  rateLimit: RateLimitInfo | null;
  chatId: Id<'chats'> | null;
  /** A signed-out transcript waiting for a keep/discard decision. */
  pendingHandoff: StoredTurn[] | null;
  setOpen: (open: boolean, trigger?: string) => void;
  ask: (question: string, opts?: AskOptions) => Promise<void>;
  resume: (chatId: Id<'chats'>) => void;
  newChat: () => void;
  dismissRateLimit: () => void;
  acceptHandoff: () => Promise<void>;
  declineHandoff: () => void;
}

const AnswerContext = createContext<AnswerContextValue | null>(null);

export function useAnswers(): AnswerContextValue {
  const ctx = useContext(AnswerContext);
  if (!ctx) throw new Error('useAnswers must be used inside <AnswerProvider>');
  return ctx;
}

/** Derive the surface name from the path, for analytics. */
function surfaceFor(pathname: string): string {
  if (pathname === '/') return 'home';
  if (/^\/bills\/[^/]+$/.test(pathname)) return 'bill';
  if (pathname.startsWith('/bills')) return 'filtered';
  return 'other';
}

/** Derive the focused bill from the path, so "this bill" resolves after navigation. */
function billIdFor(pathname: string): string | undefined {
  const m = pathname.match(/^\/bills\/([^/]+)$/);
  return m ? m[1] : undefined;
}

export function AnswerProvider({ children }: { children: React.ReactNode }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [chatId, setChatId] = useState<Id<'chats'> | null>(null);
  const [resumeId, setResumeId] = useState<Id<'chats'> | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<StoredTurn[] | null>(null);

  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const saveTranscriptMutation = useMutation(api.chats.saveTranscript);
  const resumed = useQuery(api.chats.messages, resumeId ? { chatId: resumeId } : 'skip');

  const navCountRef = useRef(0);
  const lastSurfaceRef = useRef('home');
  const wasAuthedRef = useRef<boolean | null>(null);

  const setOpen = useCallback((open: boolean, trigger = 'manual') => {
    setIsOpen(open);
    if (open) analytics.answerPanelOpened({ surface: 'panel', trigger });
  }, []);

  // Restore an in-progress anonymous conversation after a hard refresh.
  useEffect(() => {
    const stored = loadTranscript();
    if (stored.length > 0) {
      setTurns(
        stored.map((t, i) => ({ id: `r${i}`, role: t.role, content: t.content, done: true })),
      );
    }
  }, []);

  // Count navigations that happen mid-thread — the metric that says whether the
  // persistent panel is earning its complexity (spec §11).
  useEffect(() => {
    if (turns.length > 0) navCountRef.current += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Sign-in hand-off (spec §4.7). Offered ONCE, on the transition into signed
  // in, and never applied silently — the reader chose to be anonymous for
  // those turns, so keeping them is their call.
  useEffect(() => {
    const was = wasAuthedRef.current;
    wasAuthedRef.current = isAuthenticated;
    if (was === false && isAuthenticated) {
      const stored = loadTranscript();
      if (stored.length > 0) setPendingHandoff(stored);
    }
  }, [isAuthenticated]);

  // A resumed thread arrives asynchronously. `null` means "not yours or not
  // there" — indistinguishable by design (spec §4.8 Rule 3), so both start a
  // fresh conversation rather than surfacing a telling error.
  useEffect(() => {
    if (!resumeId || resumed === undefined) return;
    if (resumed === null) {
      setResumeId(null);
      setChatId(null);
      setTurns([]);
      return;
    }
    setTurns(
      resumed.map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        sources: m.citations ?? [],
        allowed: m.allowed ?? [],
        entities: (m.entities as Record<string, Record<string, unknown>>) ?? {},
        webReason: m.webReason ?? '',
        webSources: m.webSources ?? [],
        work: m.workLog ?? [],
        done: true,
      })),
    );
    setChatId(resumeId);
    setResumeId(null);
  }, [resumed, resumeId]);

  const ask = useCallback(
    async (question: string, opts: AskOptions = {}) => {
      const q = question.trim();
      if (!q || busy) return;

      const surface = opts.scope ? 'filtered' : surfaceFor(pathname);
      const askedAt = Date.now();
      const userTurn: Turn = { id: `u${askedAt}`, role: 'user', content: q };
      const botTurn: Turn = {
        id: `a${askedAt}`,
        role: 'assistant',
        content: '',
        work: [],
        done: false,
      };
      const history = turns.map((t) => ({ role: t.role, content: t.content }));

      setTurns((prev) => [...prev, userTurn, botTurn]);
      setIsOpen(true);
      setBusy(true);
      setError('');

      analytics.answerQuestionSubmitted({
        surface,
        question: q,
        question_length: q.length,
        source: opts.source ?? 'typed',
        question_number: turns.filter((t) => t.role === 'user').length + 1,
        ...(opts.scope ? { scope_label: opts.scope.label } : {}),
      });

      if (navCountRef.current > 0) {
        analytics.answerSurvivedNavigation({
          from_surface: lastSurfaceRef.current,
          to_surface: surface,
          turn_number: turns.filter((t) => t.role === 'user').length + 1,
        });
        navCountRef.current = 0;
      }
      lastSurfaceRef.current = surface;

      const patch = (fn: (t: Turn) => Turn) =>
        setTurns((prev) => prev.map((t) => (t.id === botTurn.id ? fn(t) : t)));
      const drop = () => setTurns((prev) => prev.filter((t) => t.id !== botTurn.id));

      // Accumulated outside React state so `done` can report a real length
      // without waiting for a re-render.
      let answerText = '';
      // A stream that ends without one of these has failed in a way no event
      // described — a dropped connection, or a proxy that returned something
      // that was not SSE at all. Without this the turn sits spinning forever.
      let settled = false;

      try {
        const res = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            focusBillId: billIdFor(pathname),
            scope: opts.scope ?? undefined,
            history,
            chatId: chatId ?? undefined,
          }),
        });
        if (!res.body) throw new Error('no stream');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const lines = frame.split('\n');
            const evLine = lines.find((l) => l.startsWith('event: '));
            const dataLine = lines.find((l) => l.startsWith('data: '));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(7);
            const data = JSON.parse(dataLine.slice(6));

            if (event === 'work') {
              patch((t) => ({ ...t, work: [...(t.work ?? []), data] }));
            } else if (event === 'delta') {
              answerText += data.text;
              patch((t) => ({ ...t, content: t.content + data.text }));
            } else if (event === 'done') {
              settled = true;
              patch((t) => ({
                ...t,
                sources: data.sources ?? [],
                allowed: data.allowed ?? [],
                entities: data.entities ?? {},
                webReason: data.webReason ?? '',
                webSources: data.webSources ?? [],
                done: true,
              }));
              if (data.chatId) setChatId(data.chatId as Id<'chats'>);

              const webSources = (data.webSources ?? []) as WebSource[];
              analytics.answerReceived({
                surface,
                response_ms: Date.now() - askedAt,
                answer_length: answerText.length,
                db_source_count: (data.sources ?? []).filter(
                  (h: string) => !h.startsWith('web:'),
                ).length,
                web_source_count: webSources.length,
                dropped: data.dropped ?? 0,
                partial: Boolean(data.partial),
              });
              if ((data.dropped ?? 0) > 0) {
                analytics.answerCitationUnresolved({
                  surface,
                  marker_count: data.dropped,
                  model: 'deepseek-v4-flash',
                });
              }
              if (webSources.length > 0) {
                analytics.answerWebSearchUsed({
                  surface,
                  reason: data.webReason ?? '',
                  result_count: webSources.length,
                  engine: 'exa',
                });
              }
            } else if (event === 'rate_limited') {
              settled = true;
              drop();
              setRateLimit({ kind: data.kind, max: data.max, resetAt: data.resetAt });
              analytics.answerRateLimited({
                surface,
                limit_kind: data.kind,
                max: data.max,
              });
            } else if (event === 'error') {
              settled = true;
              setError(data.message);
              drop();
              analytics.answerFailed({ surface, error: data.message });
            }
          }
        }
        if (!settled) {
          setError('The answer ended unexpectedly. Please try again.');
          drop();
          analytics.answerFailed({ surface, error: 'stream_incomplete' });
        }
      } catch {
        setError('Failed to get a response. Please try again.');
        drop();
        analytics.answerFailed({ surface, error: 'network_error' });
      } finally {
        setBusy(false);
      }
    },
    [busy, chatId, pathname, turns],
  );

  // Session storage only. Anonymous conversations never reach the database —
  // see spec §4.7. Signed-in threads are persisted server-side instead, by the
  // answer action, so this is a no-op for them beyond refresh resilience.
  useEffect(() => {
    const finished: StoredTurn[] = turns
      .filter((t) => t.role === 'user' || t.done)
      .map((t) => ({ role: t.role, content: t.content }));
    if (finished.length > 0) saveTranscript(finished);
  }, [turns]);

  const resume = useCallback((id: Id<'chats'>) => {
    setError('');
    setResumeId(id);
  }, []);

  const newChat = useCallback(() => {
    setTurns([]);
    setChatId(null);
    setError('');
    clearTranscript();
  }, []);

  const acceptHandoff = useCallback(async () => {
    const stored = pendingHandoff ?? [];
    setPendingHandoff(null);
    if (stored.length === 0) return;
    try {
      const res = await saveTranscriptMutation({ turns: stored });
      if (res?.chatId) setChatId(res.chatId);
      analytics.answerAnonThreadSaved({ turn_count: stored.length });
    } catch {
      // Nothing is lost: the transcript is still in session storage.
    }
    clearTranscript();
  }, [pendingHandoff, saveTranscriptMutation]);

  const declineHandoff = useCallback(() => {
    setPendingHandoff(null);
    clearTranscript();
  }, []);

  const value = useMemo(
    () => ({
      turns,
      isOpen,
      busy,
      error,
      rateLimit,
      chatId,
      pendingHandoff,
      setOpen,
      ask,
      resume,
      newChat,
      dismissRateLimit: () => setRateLimit(null),
      acceptHandoff,
      declineHandoff,
    }),
    [
      turns,
      isOpen,
      busy,
      error,
      rateLimit,
      chatId,
      pendingHandoff,
      setOpen,
      ask,
      resume,
      newChat,
      acceptHandoff,
      declineHandoff,
    ],
  );

  return <AnswerContext.Provider value={value}>{children}</AnswerContext.Provider>;
}
