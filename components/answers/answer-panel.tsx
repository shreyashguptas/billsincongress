'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { X, History, Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RateLimitDialog } from '@/components/bills/rate-limit-dialog';
import { Button } from '@/components/ui/button';
import { DOCK_MIN_VIEWPORT_PX, layoutModeFor, RAIL_MIN_VIEWPORT_PX, viewportWidth } from '@/lib/ask-panel';
import { askInHeaderOnly, launcherVisible, panelInert } from '@/lib/ask-panel-state';
import { surfaceFor } from '@/lib/page-context';
import { useAnswers, useNoteNavReason } from './answer-provider';
import AnswerThread from './answer-thread';
import { HistoryList } from './history-list';
import { AskLauncher } from './ask-launcher';
import { ResizeHandle } from './resize-handle';
import { resetSwiped, useDragDismiss } from '@/hooks/use-drag-dismiss';

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

  const open = phase === 'open';

  // Escape dismisses. Bound only while open so it never competes with the
  // dialogs that portal above this panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // A menu or popover open over the panel takes the Escape for itself
      // (Radix marks it handled); one key must not close both.
      if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false, 'escape');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Below the rail breakpoint the open panel is a sheet over the whole page
  // under the header, so it is modal in effect: the page and the footer behind
  // it go `inert`, and Tab stays in the panel and the header (still visible)
  // instead of landing on links the reader cannot see (WCAG 2.4.11). The rail
  // and the dock leave the page in view, so they leave it live.
  //
  // In a window under 500px tall the panel starts at the very top, over the
  // header (app/globals.css): the header goes `inert` too, or Shift+Tab out of
  // the panel landed on "Sign up" underneath it (844x390). The panel's own
  // title row has the close button there. Not docked: the dock pushes the
  // header aside rather than covering it.
  useEffect(() => {
    if (!open) return;
    const sheet = window.matchMedia(`(max-width: ${RAIL_MIN_VIEWPORT_PX - 0.02}px)`);
    const short = window.matchMedia(
      `(max-height: 499.98px) and (max-width: ${DOCK_MIN_VIEWPORT_PX - 0.02}px)`,
    );
    const header = () => document.querySelector<HTMLElement>('.ask-shell > header');
    const page = () =>
      // The skip link goes with them: it points at #main, which does nothing while inert.
      [
        document.getElementById('main'),
        document.querySelector<HTMLElement>('.ask-shell > footer'),
        document.querySelector<HTMLElement>('a[href="#main"]'),
      ].filter(
        (el): el is HTMLElement => el !== null,
      );
    const apply = () => {
      page().forEach((el) => (el.inert = sheet.matches));
      const h = header();
      if (h) h.inert = short.matches;
    };
    apply();
    sheet.addEventListener('change', apply);
    short.addEventListener('change', apply);
    return () => {
      sheet.removeEventListener('change', apply);
      short.removeEventListener('change', apply);
      page().forEach((el) => (el.inert = false));
      const h = header();
      if (h) h.inert = false;
    };
  }, [open]);

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
      // One frame later: the panel is `visibility: hidden` until the provider's
      // own effect (which runs after this child's) marks <html> open, and
      // focus() on a hidden element silently does nothing.
      const frame = requestAnimationFrame(() => target?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    if (from !== 'open') return;
    if (phase === 'minimized') {
      document.getElementById('main')?.focus({ preventScroll: true });
      return;
    }
    // Back to whichever way in is drawn at this size: the corner pill, or Ask
    // in the header where the pill is not shown (app/globals.css).
    const drawn = (el: HTMLElement | null) => (el && el.getClientRects().length > 0 ? el : null);
    const target = drawn(launcherRef.current) ?? drawn(document.getElementById('ask-header-button'));
    target?.focus({ preventScroll: true });
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

  // Drag it away: down on the sheet, right on the floating rail, with a finger
  // or a mouse, from the grab bar or the title row (hooks/use-drag-dismiss.ts).
  // Not docked: there the panel is part of the layout and its edge resizes.
  const drag = useDragDismiss({
    axis: () => (layoutModeFor(viewportWidth()) === 'sheet' ? 'y' : 'x'),
    direction: 1,
    surface: () => panelRef.current,
    enabled: () => layoutModeFor(viewportWidth()) !== 'dock',
    onDismiss: () => {
      setOpen(false, 'swipe');
      // The drag left the panel parked off screen with an inline transform;
      // hand it back to the stylesheet once the closed state has landed, or
      // the next open would stay where the swipe left it.
      requestAnimationFrame(() => requestAnimationFrame(() => resetSwiped(panelRef.current)));
    },
  });

  // Ghost icon buttons (brand.md, "Button"): 40px, 44px on touch screens,
  // resting at ink-2.
  const iconButton = 'text-ink-2 hover:text-ink';

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

      {launcherVisible(phase, askInHeaderOnly(pathname)) && (
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
          'ask-panel flex flex-col border-line bg-paper focus:outline-hidden',
          // Sheet: square and flush under the header, whose bottom rule is its
          // top edge. Rounded corners there exposed the page behind them as
          // wedges (black over the home page's dark stage), and a border of its
          // own doubled the header's line. Rail and dock: a left edge.
          'lg:border-l',
          // The rail floats over the page; docked, it sits beside the page and
          // a shadow would say otherwise. A sheet's shadow would only fall on
          // the header above it.
          'lg:shadow-float min-[1344px]:shadow-none',
        )}
      >
        <ResizeHandle surface={surfaceFor(pathname)} />

        {/*
          The handle: grab bar and title row together, so the whole top of the
          panel drags (a 20px bar alone was too small a target). Buttons in it
          still click; a drag only starts once the pointer has moved.
        */}
        <div
          {...drag}
          className="shrink-0 touch-none select-none min-[1344px]:touch-auto min-[1344px]:select-auto"
        >
          {/* Grab bar. Only on the sheet, where a swipe is the natural dismissal,
              and not in a window under 500px tall, where its 20px is better
              spent on the answer (the title row still drags). */}
          <div
            aria-hidden="true"
            className="group/grab flex cursor-grab justify-center pb-1.5 pt-2.5 active:cursor-grabbing lg:hidden short:hidden"
          >
            <span className="h-1 w-9 rounded-full bg-line-strong transition-[transform,background-color] duration-150 ease-out group-active/grab:scale-x-110 group-active/grab:bg-ink-3" />
          </div>

          {/*
            From lg up this bar is exactly the site header's height, border
            included (--header-h), so docked beside it the two bottom rules are
            one continuous line across the window.
          */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line py-1.5 pl-4 pr-2 lg:h-(--header-h) lg:py-0 lg:pl-5 lg:pr-3">
            <h2 id="ask-title" className="label-eyebrow min-w-0 truncate">
              {showHistory ? 'Your conversations' : 'Ask'}
            </h2>
            <div className="flex shrink-0 items-center gap-0.5">
              {isAuthenticated && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-label={showHistory ? 'Back to conversation' : 'Your conversations'}
                  className={iconButton}
                >
                  {showHistory ? (
                    <MessageSquare className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  newChat();
                  setShowHistory(false);
                }}
                aria-label="New conversation"
                className={iconButton}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false, 'manual')}
                aria-label="Close the ask panel"
                className={iconButton}
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/*
          The sign-in hand-off (spec §4.7). Shown once, never applied silently —
          the reader chose to be anonymous for those turns.
        */}
        {pendingHandoff && !showHistory && (
          <div className="shrink-0 space-y-3 border-b border-line bg-sunken px-4 py-4 lg:px-5">
            <p className="text-ui leading-relaxed text-ink">
              Keep the conversation you started before signing in?
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={() => void acceptHandoff()}>
                Keep it
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={declineHandoff}>
                Discard
              </Button>
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
