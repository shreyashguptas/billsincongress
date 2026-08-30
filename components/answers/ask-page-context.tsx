'use client';

import { useEffect } from 'react';
import { useAnswers } from './answer-provider';
import type { PublishedContext } from '@/lib/page-context';

/**
 * How a page tells the ask panel what it currently has open.
 *
 * Renders nothing, so a server component can mount it with plain props and a
 * client page can mount it beside its own state. The path already says which
 * bill or which hub the reader is on; this is only for what the path cannot
 * know — the Congress a reader has selected on the dashboard, or the live
 * filter set on the bills list.
 *
 * That Congress matters more than it looks. Every catalog fetch defaults to the
 * 119th, so a reader studying the 117th on the dashboard and then asking a
 * question was, until now, answered about a different Congress entirely.
 */
export function AskPageContext({ congress, scope }: PublishedContext): null {
  const { setPublished } = useAnswers();

  // Keyed on the serialised value, not the object: `scopeFromFilters` builds a
  // new object on every render of the list page, and an identity-keyed effect
  // would re-publish on every keystroke in the filter bar.
  const key = JSON.stringify({ congress: congress ?? null, scope: scope ?? null });

  useEffect(() => {
    setPublished(JSON.parse(key) as PublishedContext);
    return () => setPublished(null);
  }, [key, setPublished]);

  return null;
}
