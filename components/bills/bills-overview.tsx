'use client';

import { useEffect, useState } from 'react';
import { BillCard } from './bill-card';
import { BillFilters } from './bill-filters';
import { Bill } from '@/lib/types';
import { BillStorageService } from '@/lib/services/bill-storage';

export function BillsOverview() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchBills = async () => {
    try {
      const storage = new BillStorageService();
      const fetchedBills = await storage.getBills(10);
      setBills(fetchedBills);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const syncBills = async () => {
    try {
      setSyncing(true);
      setError(null);
      const response = await fetch('/api/bills/sync');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync bills');
      }
      
      await fetchBills(); // Refresh the bills list after sync
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Loading bills...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">Error: {error}</p>
        <button
          onClick={syncBills}
          disabled={syncing}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Try Again'}
        </button>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="text-center py-8">
        <p>No bills found. Please sync bills first.</p>
        <button
          onClick={syncBills}
          disabled={syncing}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Bills'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <BillFilters />
        <button
          onClick={syncBills}
          disabled={syncing}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Refresh Bills'}
        </button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {bills.map((bill) => (
          <BillCard key={bill.id} bill={bill} />
        ))}
      </div>
    </div>
  );
}