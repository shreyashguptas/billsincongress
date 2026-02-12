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

  const timeAgo = formatDistanceToNow(new Date(syncStatus.completedAt), {
    addSuffix: true,
  });

  return (
    <p className="text-xs text-muted-foreground/70">
      Data updated {timeAgo}
    </p>
  );
}
