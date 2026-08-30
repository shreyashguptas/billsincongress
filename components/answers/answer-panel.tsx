'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { X, History, Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RateLimitDialog } from '@/components/bills/rate-limit-dialog';
import { layoutModeFor, viewportWidth } from '@/lib/ask-panel';
import { launcherVisible, panelInert } from '@/lib/ask-panel-state';
import { surfaceFor } from '@/lib/page-context';
import { useAnswers, useNoteNavReason } from './answer-provider';
import AnswerThread from './answer-thread';
import { HistoryList } from './history-list';
import { AskLauncher } from './ask-launcher';
import { ResizeHandle } from './resize-handle';

/** How far a downward swipe has to travel before it counts as a dismissal. */
const SWIPE_DISMISS_PX = 96;

/**
 * The persistent panel (spec §6.2).
 *
 * Mounted in the root layout as a SIBLING of the page content, so client-side
 * navigation swaps the page underneath while this and its conversation survive.
 * Mounting it inside the page tree would defeat the entire design.
 *
 * The panel is ALWAYS mounted, in every phase — it is moved off screen with a
 * transform rather than unmounted. That is what makes stepping aside for a bill
 * cheap: the thread's scroll position and any half-typed follow-up are ordinary
 * component state, and unmounting would silently throw both away on a
 * transition the reader never asked for.
 *
 * Which SHAPE it takes — bottom sheet, floating rail, or a docked rail that
 * pushes the page — is decided entirely by media queries in globals.css. No
 * component here reads the viewport during render, which is what keeps the
 * server and client renders identical.
 */
export function AnswerPanel() {
  const {
    phase,
    turns,
    rateLimit,
    dismissRateLimit,
    resume,
    newChat,
    setOpen,
    restore,
    minimize,
    pendingHandoff,
    acceptHandoff,
    declineHandoff,
  } = useAnswers();
  const noteNavReason = useNoteNavReason();
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const [showHistory, setShowHistory] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const previousPhase = useRef(phase);
  const swipeFrom = useRef(0);
  const swipeBy = useRef(0);

  const open = phase === 'open';

  // Escape dismisses. Bound only while open so it never competes with the
  // dialogs that portal above this panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false, 'escape');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Where focus lands on each transition. Without this, stepping aside for a
  // bill leaves a keyboard or screen-reader user on <body> — at the top of
  // nothing, with the page they just opened unannounced.
  useEffect(() => {
    const from = previousPhase.current;
    previousPhase.current = phase;
    if (from === phase) return;

    if (phase === 'open') {
      // The composer, except on a phone, where focusing an input throws the
      // on-screen keyboard over the answer the reader came to read.
      const mode = layoutModeFor(viewportWidth());
      const target =
        mode === 'sheet'
          ? panelRef.current
          : (document.getElementById('ask-composer') as HTMLInputElement | null);
      target?.focus({ preventScroll: true });
      return;
    }
    if (from !== 'open') return;
    if (phase === 'minimized') {
      document.getElementById('main')?.focus({ preventScroll: true });
      return;
    }
    launcherRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /**
   * The reported bug, fixed at the source.
   *
   * A bill card inside an answer is an ordinary link and always navigated
   * correctly — but on a phone the sheet covers the page, so the tap read as
   * doing nothing at all. Capturing the click means the panel starts moving on
   * the tap itself rather than when the route finally commits, and it also
   * catches the case a route-change listener structurally cannot: tapping the
   * card for the bill the reader is ALREADY on, where the path never changes.
   *
   * Everything that is not a plain left-click on an internal link is left
   * alone: modified clicks, new tabs and external links all still do what the
   * reader expects, with the conversation still on screen.
   */
  const onClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as
      | HTMLAnchorElement
      | null;
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/')) return;

    noteNavReason('entity_navigation');
    minimize('entity_navigation');
  };

  // Swipe the sheet away. Same pointer discipline as the resize edge: capture
  // the pointer so the gesture survives leaving the element, write the offset
  // inline so nothing re-renders per frame.
  const onGrabDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    swipeFrom.current = e.clientY;
    swipeBy.current = 0;
    if (panelRef.current) panelRef.current.dataset.dragging = '1';
  };

  const onGrabMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !panelRef.current) return;
    // Downward only. Dragging up would tear the sheet off the bottom edge.
    swipeBy.current = Math.max(0, e.clientY - swipeFrom.current);
    panelRef.current.style.transform = `translateY(${swipeBy.current}px)`;
  };

  const onGrabUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (panelRef.current) {
      delete panelRef.current.dataset.dragging;
      panelRef.current.style.transform = '';
    }
    if (swipeBy.current > SWIPE_DISMISS_PX) setOpen(false, 'swipe');
    swipeBy.current = 0;
  };

  const iconButton =
    'inline-flex h-11 w-11 items-center justify-center rounded-sm hover:text-foreground ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'lg:h-9 lg:w-9';

  return (
    <>
      {rateLimit && (
        <RateLimitDialog
          open
          onOpenChange={(next) => {
            if (!next) dismissRateLimit();
          }}
          kind={rateLimit.kind}
          max={rateLimit.max}
          resetAt={rateLimit.resetAt}
          redirectTo={pathname}
        />
      )}

      {launcherVisible(phase) && (
        <AskLauncher
          ref={launcherRef}
          phase={phase}
          turnCount={turns.length}
          onOpen={() => (phase === 'minimized' ? restore() : setOpen(true, 'launcher'))}
        />
      )}

      <aside
        id="ask-panel"
        ref={panelRef}
        tabIndex={-1}
        // `inert` rather than conditional rendering: off screen it must be out
        // of the tab order and invisible to screen readers, but the thread's
        // scroll position and the composer's draft have to survive.
        inert={panelInert(phase)}
        aria-labelledby="ask-title"
        onClickCapture={onClickCapture}
        className={cn(
          'ask-panel flex flex-col border-border bg-background',
          'border-t lg:border-l lg:border-t-0',
        )}
      >
        <ResizeHandle surface={surfaceFor(pathname)} />

        {/* Grab bar. Only on the sheet, where a swipe is the natural dismissal. */}
        <div
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          aria-hidden="true"
          className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing lg:hidden"
        >
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2 lg:px-5 lg:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-law" aria-hidden="true" />
            <h2 id="ask-title" className="label-eyebrow !mb-0 truncate font-sans">
              {showHistory ? 'Your conversations' : 'Ask'}
            </h2>
          </div>
          <div className="-mr-2 flex shrink-0 items-center text-muted-foreground lg:-mr-1.5">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                aria-label={showHistory ? 'Back to conversation' : 'Your conversations'}
                className={iconButton}
              >
                {showHistory ? (
                  <MessageSquare className="h-4 w-4" />
                ) : (
                  <History className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                newChat();
                setShowHistory(false);
              }}
              aria-label="New conversation"
              className={iconButton}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false, 'manual')}
              aria-label="Close the ask panel"
              className={iconButton}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/*
          The sign-in hand-off (spec §4.7). Shown once, never applied silently —
          the reader chose to be anonymous for those turns.
        */}
        {pendingHandoff && !showHistory && (
          <div className="shrink-0 space-y-2 border-b border-border px-4 py-3 lg:px-5">
            <p className="text-sm leading-relaxed">
              Keep the conversation you started before signing in?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void acceptHandoff()}
                className="text-xs text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={declineHandoff}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {showHistory ? (
          <HistoryList onResume={resume} onClose={() => setShowHistory(false)} />
        ) : (
          <AnswerThread surface="panel" />
        )}
      </aside>
    </>
  );
}
