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
import {
  billIdFor,
  pageContextFor,
  surfaceFor,
  type PublishedContext,
} from '@/lib/page-context';
import {
  clampPanelWidth,
  layoutModeFor,
  loadPanelPrefs,
  viewportWidth,
} from '@/lib/ask-panel';
import {
  INITIAL_ASK_STATE,
  nextAskState,
  type AskAction,
  type AskPhase,
  type AskState,
  type CloseReason,
  type OpenTrigger,
} from '@/lib/ask-panel-state';
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
  phase: AskPhase;
  busy: boolean;
  error: string;
  rateLimit: RateLimitInfo | null;
  chatId: Id<'chats'> | null;
  /** A signed-out transcript waiting for a keep/discard decision. */
  pendingHandoff: StoredTurn[] | null;
  /** Open or dismiss. `trigger` names where it came from, for the funnel. */
  setOpen: (open: boolean, trigger?: OpenTrigger | CloseReason) => void;
  /** Bring a set-aside conversation back, thread and draft intact. */
  restore: () => void;
  /** Step the panel aside so the page it just opened becomes visible. */
  minimize: (reason: CloseReason) => void;
  /** What the current route has open, beyond what the path already says. */
  setPublished: (published: PublishedContext | null) => void;
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

/**
 * How the panel tells the provider that the navigation about to happen came
 * from a link inside an answer.
 *
 * Separate from the main context on purpose: it is set during a click, read
 * during the next pathname change, and never rendered — putting it on the
 * conversation context would invalidate every consumer of `useAnswers()`
 * mid-stream for a value none of them display.
 */
const NavReasonContext = createContext<(reason: CloseReason) => void>(() => {});

export function useNoteNavReason() {
  return useContext(NavReasonContext);
}

export function AnswerProvider({ children }: { children: React.ReactNode }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [askState, setAskState] = useState<AskState>(INITIAL_ASK_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [chatId, setChatId] = useState<Id<'chats'> | null>(null);
  const [resumeId, setResumeId] = useState<Id<'chats'> | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<StoredTurn[] | null>(null);
  const [published, setPublishedState] = useState<PublishedContext | null>(null);

  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const saveTranscriptMutation = useMutation(api.chats.saveTranscript);
  const resumed = useQuery(api.chats.messages, resumeId ? { chatId: resumeId } : 'skip');

  const navCountRef = useRef(0);
  const lastSurfaceRef = useRef('home');
  const wasAuthedRef = useRef<boolean | null>(null);

  /**
   * The phase, mirrored synchronously.
   *
   * A navigation out of an answer reaches the panel twice — once from the
   * click, before the router commits, and once from the pathname changing
   * afterwards. The reducer is idempotent so the STATE is safe either way, but
   * the analytics are not: without a synchronous read of the current phase,
   * `answer_panel_closed` would fire twice for one tap and the funnel measuring
   * this very fix would be wrong. `setState` is asynchronous; this is not.
   */
  const phaseRef = useRef<AskPhase>(INITIAL_ASK_STATE.phase);
  const turnsRef = useRef<Turn[]>(turns);
  const pathnameRef = useRef(pathname);
  const openedAtRef = useRef(0);
  const minimizedAtRef = useRef(0);
  /** Set by the panel's click-capture, so the pathname effect knows the cause. */
  const navReasonRef = useRef<CloseReason>('navigation');

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const surfaceNow = useCallback(() => surfaceFor(pathnameRef.current), []);
  const questionCount = () => turnsRef.current.filter((t) => t.role === 'user').length;

  /**
   * Run one transition. Returns the new state, or null when the reducer decided
   * nothing should change — callers report analytics only on a real transition.
   */
  const apply = useCallback((action: AskAction): AskState | null => {
    const prev = { phase: phaseRef.current };
    const next = nextAskState(prev, action);
    if (next.phase === prev.phase) return null;
    phaseRef.current = next.phase;
    setAskState(next);
    return next;
  }, []);

  const openPanel = useCallback(
    (trigger: OpenTrigger) => {
      if (!apply({ type: 'open' })) return;
      openedAtRef.current = Date.now();
      analytics.answerPanelOpened({
        surface: surfaceNow(),
        trigger,
        has_conversation: turnsRef.current.length > 0,
      });
    },
    [apply, surfaceNow],
  );

  const closePanel = useCallback(
    (reason: CloseReason) => {
      if (!apply({ type: 'close' })) return;
      analytics.answerPanelClosed({
        surface: surfaceNow(),
        reason,
        turn_count: questionCount(),
        dwell_ms: openedAtRef.current ? Date.now() - openedAtRef.current : 0,
      });
    },
    [apply, surfaceNow],
  );

  const minimize = useCallback(
    (reason: CloseReason) => {
      // Read the mode from the live viewport, in an event handler — never
      // during render, where it would be a hydration mismatch.
      const mode = layoutModeFor(viewportWidth());
      if (!apply({ type: 'minimize', mode })) return;
      minimizedAtRef.current = Date.now();
      analytics.answerPanelClosed({
        surface: surfaceNow(),
        reason,
        turn_count: questionCount(),
        dwell_ms: openedAtRef.current ? Date.now() - openedAtRef.current : 0,
      });
    },
    [apply, surfaceNow],
  );

  const restore = useCallback(() => {
    const wasMinimized = phaseRef.current === 'minimized';
    if (!apply({ type: 'restore' })) return;
    openedAtRef.current = Date.now();
    if (wasMinimized) {
      analytics.answerPanelRestored({
        surface: surfaceNow(),
        trigger: 'launcher',
        turn_count: questionCount(),
        away_ms: minimizedAtRef.current ? Date.now() - minimizedAtRef.current : 0,
      });
      return;
    }
    analytics.answerPanelOpened({
      surface: surfaceNow(),
      trigger: 'launcher',
      has_conversation: turnsRef.current.length > 0,
    });
  }, [apply, surfaceNow]);

  const setOpen = useCallback(
    (open: boolean, trigger: OpenTrigger | CloseReason = 'manual') => {
      if (open) openPanel(trigger as OpenTrigger);
      else closePanel(trigger as CloseReason);
    },
    [openPanel, closePanel],
  );

  const setPublished = useCallback((next: PublishedContext | null) => {
    setPublishedState(next);
  }, []);

  const noteNavReason = useCallback((reason: CloseReason) => {
    navReasonRef.current = reason;
  }, []);

  // ── DOM plumbing ─────────────────────────────────────────────────────────
  // The phase drives the layout push, the panel's transform, the launcher's
  // shape and the mobile scroll lock — all in CSS, off a single attribute, so
  // no component has to know the viewport.
  useEffect(() => {
    document.documentElement.dataset.ask = askState.phase;
  }, [askState.phase]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.ask;
    },
    [],
  );

  // Restore the reader's preferred width. Clamped against THIS viewport, not
  // the one it was saved on: a 640px width chosen on a large display must not
  // follow them onto a laptop and starve the page there.
  useEffect(() => {
    const { widthPx } = loadPanelPrefs();
    document.documentElement.style.setProperty(
      '--ask-w',
      `${clampPanelWidth(widthPx, viewportWidth())}px`,
    );
  }, []);

  // The on-screen keyboard. Fixed elements are positioned against the LAYOUT
  // viewport, which iOS does not shrink when the keyboard appears — so without
  // this the composer sits underneath it. Shrinking the sheet by the overlap
  // keeps the composer, the last child of a flex column, directly above the
  // keys. Absent `visualViewport`, the value stays 0 and nothing changes.
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!vv || askState.phase !== 'open') return;
    const sync = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--ask-kb', `${Math.round(overlap)}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.documentElement.style.setProperty('--ask-kb', '0px');
    };
  }, [askState.phase]);

  // Restore an in-progress anonymous conversation after a hard refresh.
  useEffect(() => {
    const stored = loadTranscript();
    if (stored.length > 0) {
      setTurns(
        stored.map((t, i) => ({ id: `r${i}`, role: t.role, content: t.content, done: true })),
      );
    }
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────
  // Two things happen here. The first is the metric that says whether the
  // persistent panel is earning its complexity (spec §11). The second is the
  // fix for the reported bug: on a phone the sheet covers the page, so a bill
  // tapped inside an answer opened correctly and was never seen. The panel now
  // steps aside for it.
  //
  // The panel's own click-capture usually gets there first, so the motion
  // starts on the tap rather than when the route commits. This is the backstop
  // for every navigation that does not pass through it — a link in the header,
  // browser back, a programmatic push — and it cannot double-report, because
  // `minimize` no-ops once the phase has already moved.
  const isFirstPathRef = useRef(true);
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
      return;
    }
    if (turnsRef.current.length > 0) navCountRef.current += 1;
    minimize(navReasonRef.current);
    navReasonRef.current = 'navigation';
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

      // A question typed into the panel on a filtered list carries that list's
      // scope, not only the "Ask about these" button — the reader is looking at
      // the same rows either way.
      const scope = opts.scope ?? published?.scope ?? undefined;
      const context = pageContextFor(pathname, published);
      const surface = scope ? 'filtered' : surfaceFor(pathname);
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
      openPanel('ask');
      setBusy(true);
      setError('');

      analytics.answerQuestionSubmitted({
        surface,
        question: q,
        question_length: q.length,
        source: opts.source ?? 'typed',
        question_number: turns.filter((t) => t.role === 'user').length + 1,
        ...(scope ? { scope_label: scope.label } : {}),
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
            // `focusBillId` is redundant with `context.billId` and is sent
            // anyway: Convex deploys are manual and separate from the site's,
            // so for one release either half may be the older one.
            focusBillId: billIdFor(pathname),
            context,
            scope,
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
    [busy, chatId, openPanel, pathname, published, turns],
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
      phase: askState.phase,
      busy,
      error,
      rateLimit,
      chatId,
      pendingHandoff,
      setOpen,
      restore,
      minimize,
      setPublished,
      ask,
      resume,
      newChat,
      dismissRateLimit: () => setRateLimit(null),
      acceptHandoff,
      declineHandoff,
    }),
    [
      turns,
      askState.phase,
      busy,
      error,
      rateLimit,
      chatId,
      pendingHandoff,
      setOpen,
      restore,
      minimize,
      setPublished,
      ask,
      resume,
      newChat,
      acceptHandoff,
      declineHandoff,
    ],
  );

  return (
    <AnswerContext.Provider value={value}>
      <NavReasonContext.Provider value={noteNavReason}>{children}</NavReasonContext.Provider>
    </AnswerContext.Provider>
  );
}

