import { supabase } from '../supabase.js';
import { Bill } from '../types.js';

export class BillStorageService {
  async storeBills(bills: Bill[]): Promise<void> {
    try {
      // Prepare the bills data for storage
      const billsToStore = bills.map(bill => ({
        id: bill.id,
        title: bill.title,
        sponsor: bill.sponsor,
        introduced: bill.introduced,
        status: bill.status,
        progress: bill.progress,
        summary: bill.summary,
        tags: Array.isArray(bill.tags) ? bill.tags : [],
        vote_count: bill.voteCount || {
          yea: 0,
          nay: 0,
          present: 0,
          notVoting: 0
        },
        last_updated: bill.lastUpdated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      console.log('Preparing to store bills:', billsToStore.length);

      const { error } = await supabase
        .from('bills')
        .upsert(billsToStore, {
          onConflict: 'id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Supabase storage error:', error);
        throw error;
      }

      console.log('Successfully stored bills in Supabase');
    } catch (error) {
      console.error('Error storing bills:', error);
      throw error;
    }
  }

  async getBills(limit: number = 10): Promise<Bill[]> {
    try {
      console.log('Fetching bills from Supabase...');
      
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .limit(limit)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      if (!data) {
        console.log('No bills found in database');
        return [];
      }

      // Transform the data back into Bill objects
      return data.map(bill => ({
        id: bill.id,
        title: bill.title,
        sponsor: bill.sponsor,
        introduced: bill.introduced,
        status: bill.status,
        progress: bill.progress || 0,
        summary: bill.summary,
        tags: Array.isArray(bill.tags) ? bill.tags : [],
        aiSummary: bill.ai_summary,
        lastUpdated: bill.last_updated,
        voteCount: bill.vote_count || {
          yea: 0,
          nay: 0,
          present: 0,
          notVoting: 0
        }
      }));
    } catch (error) {
      console.error('Error fetching bills from storage:', error);
      throw error;
    }
  }
} 