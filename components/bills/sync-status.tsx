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

  const timeAgo = formatDistanceToNow(new Date(syncStatus.completedAt), { addSuffix: true });

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-status-law" aria-hidden="true" />
      Updated {timeAgo}
    </span>
  );
}
