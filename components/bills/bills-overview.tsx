'use client';

import { useEffect, useState, useCallback } from 'react';
import { BillCard } from './bill-card';
import { Bill } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// Helper function to transform Supabase data to Bill type
const transformBillData = (data: any): Bill => ({
  id: data.id,
  title: data.title,
  congressNumber: data.congress_number,
  billType: data.bill_type,
  billNumber: data.bill_number,
  sponsorName: data.sponsor_name,
  sponsorState: data.sponsor_state,
  sponsorParty: data.sponsor_party,
  sponsorBioguideId: data.sponsor_bioguide_id,
  committeeCount: data.committee_count,
  latestActionText: data.latest_action_text,
  latestActionDate: data.latest_action_date,
  updateDate: data.update_date,
  status: data.status,
  progress: data.progress || 0,
  summary: data.summary,
  tags: Array.isArray(data.tags) ? data.tags : [],
  aiSummary: data.ai_summary,
  lastUpdated: data.last_updated,
  voteCount: data.vote_count || {
    yea: 0,
    nay: 0,
    present: 0,
    notVoting: 0
  }
});

export function BillsOverview({ initialBills }: { initialBills: Bill[] }) {
  const [bills, setBills] = useState<Bill[]>(() => 
    // Ensure unique bills by using a Map with unique IDs
    Array.from(new Map(initialBills.map(bill => [bill.id, bill])).values())
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(10);

  const loadMoreBills = useCallback(async () => {
    try {
      setLoadingMore(true);
      const { data, error: supabaseError } = await supabase
        .from('bills')
        .select('*')
        .order('update_date', { ascending: false })
        .range(offset, offset + 9);

      if (supabaseError) throw supabaseError;

      if (data) {
        const newBills = data.map(transformBillData);
        // Ensure no duplicate bills are added
        setBills(prev => {
          const existingIds = new Set(prev.map(b => b.id));
          const uniqueNewBills = newBills.filter(b => !existingIds.has(b.id));
          return [...prev, ...uniqueNewBills];
        });
        setOffset(prev => prev + 10);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [offset]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">      
      {bills.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">No bills found</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bills.map((bill) => (
              <BillCard 
                key={`${bill.congressNumber}-${bill.billNumber}-${bill.id}`} 
                bill={bill} 
              />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Button
              onClick={loadMoreBills}
              disabled={loadingMore}
              variant="outline"
              size="lg"
            >
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load More Bills
            </Button>
          </div>
        </>
      )}
    </div>
  );
}