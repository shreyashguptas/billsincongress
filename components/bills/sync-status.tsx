'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { billsService } from '@/lib/services/bills-service';

interface SyncStatusData {
  syncType: string;
  completedAt: string | undefined;
  totalProcessed: number | undefined;
  totalSuccess: number | undefined;
  totalFailed: number | undefined;
}

/**
 * " · Updated 3 hours ago" — the tail of a page's `SourceLine`, read from the
 * last completed sync. Renders nothing until that is known, so the source line
 * never claims a freshness it has not checked.
 */
export default function SyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const status = await billsService.getSyncStatus();
      setSyncStatus(status);
    };
    fetchStatus();
  }, []);

  if (!syncStatus?.completedAt) return null;

  const completedAt = new Date(syncStatus.completedAt);
  const timeAgo = formatDistanceToNow(completedAt, { addSuffix: true });

  return (
    <>
      <span aria-hidden="true"> · </span>
      Updated <time dateTime={completedAt.toISOString()}>{timeAgo}</time>
    </>
  );
}
