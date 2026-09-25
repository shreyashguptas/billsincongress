'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { analytics } from '@/lib/analytics';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Past conversations (spec §6.2). A slide-over inside the panel, not a page.
 *
 * `api.chats.list` returns [] when signed out, so the signed-out state is a
 * property of the server function rather than something this component has to
 * remember to check.
 */
export function HistoryList({
  onResume,
  onClose,
}: {
  onResume: (chatId: Id<'chats'>) => void;
  onClose: () => void;
}) {
  const chats = useQuery(api.chats.list);
  const remove = useMutation(api.chats.remove);
  const removeAll = useMutation(api.chats.removeAll);
  const [confirmingAll, setConfirmingAll] = useState(false);

  // Fired here rather than from the panel's button: only this component knows
  // how many conversations there actually are, and `chat_count` is the whole
  // point of the event. Keyed on the loaded length so it fires once per open,
  // not on every render.
  useEffect(() => {
    if (chats !== undefined) analytics.answerHistoryOpened({ chat_count: chats.length });
  }, [chats?.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (chats === undefined) {
    return (
      <div className="flex justify-center py-8">
        <div
          role="status"
          aria-label="Loading your conversations"
          className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent"
        />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="px-4 py-8 lg:px-5">
        <p className="text-[15px] leading-relaxed text-ink-2">
          No saved conversations yet. Sign in and your questions are kept here so you can
          pick them up later. Signed-out conversations are never stored.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 lg:px-3">
        {chats.map((chat) => (
          <div key={chat._id} className="group flex items-start gap-1">
            <button
              type="button"
              onClick={() => {
                analytics.answerHistoryThreadResumed({
                  thread_id: chat._id,
                  age_days: Math.floor((Date.now() - chat.lastActivityAt) / 86_400_000),
                  message_count: chat.messageCount,
                });
                onResume(chat._id);
                onClose();
              }}
              className="focus-ring min-w-0 flex-1 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-sunken"
            >
              <p className="line-clamp-2 font-serif text-[16px] leading-snug text-ink">{chat.title}</p>
              <p className="mt-1 font-mono text-xs text-ink-3 tabular">
                {new Date(chat.lastActivityAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {' · '}
                {chat.messageCount} messages
              </p>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete conversation: ${chat.title}`}
              onClick={async () => {
                await remove({ chatId: chat._id });
                analytics.answerThreadDeleted({ scope: 'one', thread_count: 1 });
              }}
              // Revealed on hover with a mouse; always shown on a touch screen,
              // where there is no hover to reveal it.
              className={
                'mt-1 shrink-0 text-ink-3 opacity-0 transition-all hover:text-error focus:opacity-100 ' +
                'group-hover:opacity-100 touchable:h-10 touchable:w-10 touchable:opacity-100'
              }
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line px-4 py-3 lg:px-5">
        {confirmingAll ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm text-ink">
              Delete all <span className="font-mono tabular">{chats.length}</span> conversations?
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await removeAll({});
                analytics.answerThreadDeleted({ scope: 'all', thread_count: res.deleted });
                setConfirmingAll(false);
              }}
              // An error-edged outline on the page, not the filled destructive
              // variant: the confirm row is quiet, and the edge carries the warning.
              className="border-error bg-transparent text-error"
            >
              Delete
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingAll(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            className="focus-ring rounded-sm text-[13px] text-ink-2 transition-colors hover:text-error"
          >
            Delete all conversations
          </button>
        )}
      </div>
    </div>
  );
}
