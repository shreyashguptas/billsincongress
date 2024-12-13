import { supabase } from '../supabase';
import { Bill } from '../types';

export class BillStorageService {
  async storeBills(bills: Bill[]): Promise<void> {
    try {
      // Prepare the bills data for storage
      const billsToStore = bills.map(bill => ({
        id: bill.id,
        title: bill.title,
        congress_number: bill.congressNumber,
        bill_type: bill.billType,
        bill_number: bill.billNumber,
        sponsor_name: bill.sponsorName,
        sponsor_state: bill.sponsorState,
        sponsor_party: bill.sponsorParty,
        sponsor_bioguide_id: bill.sponsorBioguideId,
        committee_count: bill.committeeCount,
        latest_action_text: bill.latestActionText,
        latest_action_date: bill.latestActionDate,
        update_date: bill.updateDate,
        status: bill.status,
        progress: bill.progress,
        summary: bill.summary,
        tags: Array.isArray(bill.tags) ? bill.tags : [],
        ai_summary: bill.aiSummary,
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
        .order('update_date', { ascending: false });

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
        congressNumber: bill.congress_number,
        billType: bill.bill_type,
        billNumber: bill.bill_number,
        sponsorName: bill.sponsor_name,
        sponsorState: bill.sponsor_state,
        sponsorParty: bill.sponsor_party,
        sponsorBioguideId: bill.sponsor_bioguide_id,
        committeeCount: bill.committee_count,
        latestActionText: bill.latest_action_text,
        latestActionDate: bill.latest_action_date,
        updateDate: bill.update_date,
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