'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { analytics } from '@/lib/analytics';
import { Trash2 } from 'lucide-react';

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

  if (chats === undefined) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="px-5 py-8">
        <p className="text-sm text-muted-foreground leading-relaxed">
          No saved conversations yet. Sign in and your questions are kept here so you can
          pick them up later. Signed-out conversations are never stored.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {chats.map((chat) => (
          <div key={chat._id} className="group flex items-start gap-2">
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
              className="flex-1 text-left rounded-sm px-2 py-2 hover:bg-secondary transition-colors"
            >
              <p className="font-serif text-[13px] leading-snug line-clamp-2">{chat.title}</p>
              <p className="font-mono text-[10px] text-muted-foreground tabular mt-1">
                {new Date(chat.lastActivityAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {' · '}
                {chat.messageCount} messages
              </p>
            </button>
            <button
              type="button"
              aria-label={`Delete conversation: ${chat.title}`}
              onClick={async () => {
                await remove({ chatId: chat._id });
                analytics.answerThreadDeleted({ scope: 'one', thread_count: 1 });
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 mt-2 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-3 shrink-0">
        {confirmingAll ? (
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground flex-1">Delete all {chats.length}?</p>
            <button
              type="button"
              onClick={async () => {
                const res = await removeAll({});
                analytics.answerThreadDeleted({ scope: 'all', thread_count: res.deleted });
                setConfirmingAll(false);
              }}
              className="text-xs text-destructive hover:underline"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingAll(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Delete all conversations
          </button>
        )}
      </div>
    </div>
  );
}
