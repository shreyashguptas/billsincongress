'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { X, History, Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RateLimitDialog } from '@/components/bills/rate-limit-dialog';
import { useAnswers } from './answer-provider';
import AnswerThread from './answer-thread';
import { HistoryList } from './history-list';

/**
 * The persistent panel (spec §6.2).
 *
 * Mounted in the root layout as a SIBLING of the page content, so client-side
 * navigation swaps the page underneath while this and its conversation survive.
 * Mounting it inside the page tree would defeat the entire design.
 *
 * Desktop ≥1280px: a fixed right rail. Below that: a full-height sheet, because
 * `container-editorial` (max-w-6xl) has no width to give up.
 */
export function AnswerPanel() {
  const {
    isOpen,
    setOpen,
    turns,
    rateLimit,
    dismissRateLimit,
    resume,
    newChat,
    pendingHandoff,
    acceptHandoff,
    declineHandoff,
  } = useAnswers();
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const [showHistory, setShowHistory] = useState(false);

  const dialog = rateLimit ? (
    <RateLimitDialog
      open
      onOpenChange={(open) => {
        if (!open) dismissRateLimit();
      }}
      kind={rateLimit.kind}
      max={rateLimit.max}
      resetAt={rateLimit.resetAt}
      redirectTo={pathname}
    />
  ) : null;

  if (!isOpen) {
    return (
      <>
        {dialog}
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true, 'resume_pill')}
            className={cn(
              'fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-sm',
              'border border-border bg-background px-3 py-2 text-sm shadow-sm',
              'hover:border-foreground/40 transition-colors',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-status-law" aria-hidden="true" />
            Continue asking
          </button>
        )}
      </>
    );
  }

  return (
    <>
      {dialog}
      <div
        className="fixed inset-0 z-40 bg-background/60 xl:hidden"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed z-50 flex flex-col border-border bg-background',
          'inset-x-0 bottom-0 top-16 border-t',
          'xl:inset-y-0 xl:left-auto xl:right-0 xl:top-0 xl:w-[400px] xl:border-l xl:border-t-0',
        )}
        aria-label="Ask about Congress"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-status-law" aria-hidden="true" />
            <p className="label-eyebrow !mb-0">{showHistory ? 'Your conversations' : 'Ask'}</p>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                aria-label={showHistory ? 'Back to conversation' : 'Your conversations'}
                className="hover:text-foreground transition-colors"
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
              className="hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="hover:text-foreground transition-colors"
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
          <div className="border-b border-border px-5 py-3 shrink-0 space-y-2">
            <p className="text-sm leading-relaxed">
              Keep the conversation you started before signing in?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void acceptHandoff()}
                className="text-xs text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground"
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
