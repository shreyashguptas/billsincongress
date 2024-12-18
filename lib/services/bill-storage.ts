import { supabase } from '../supabase';
import { Bill } from '../types';
import { cleanSponsorName, expandBillType } from '../utils';

export class BillStorageService {
  async storeBills(bills: Bill[]): Promise<void> {
    try {
      // Prepare the bills data for storage
      const billsToStore = await Promise.all(bills.map(async bill => {
        // Get existing bill to check for status changes
        const { data: existingBill } = await supabase
          .from('bills')
          .select('status, status_history')
          .eq('id', bill.id)
          .single();

        let statusHistory = existingBill?.status_history || [];
        const now = new Date().toISOString();

        // If status has changed, add to history
        if (existingBill?.status !== bill.status) {
          statusHistory = [
            ...statusHistory,
            {
              date: now,
              oldStatus: existingBill?.status,
              newStatus: bill.status,
              actionText: bill.latestActionText
            }
          ];
        }

        return {
          id: bill.id,
          title: bill.title,
          congress_number: bill.congressNumber,
          bill_type: expandBillType(bill.billType),
          bill_number: bill.billNumber,
          sponsor_name: cleanSponsorName(bill.sponsorName),
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
          origin_chamber: bill.originChamber,
          origin_chamber_code: bill.originChamberCode,
          congress_gov_url: bill.congressGovUrl,
          status_history: statusHistory,
          last_status_change: existingBill?.status !== bill.status ? now : null,
          introduced_date: bill.introducedDate,
          constitutional_authority_text: bill.constitutionalAuthorityText,
          official_title: bill.officialTitle,
          short_title: bill.shortTitle,
          cosponsors_count: bill.cosponsorsCount,
          last_updated: new Date(bill.lastUpdated || now).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
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

  async getBills(limit: number = 10, offset: number = 0): Promise<Bill[]> {
    try {
      console.log(`Fetching bills from Supabase with limit ${limit} and offset ${offset}...`);
      
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .order('update_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      if (!data) {
        console.log('No bills found in database');
        return [];
      }

      // Transform the data back into Bill objects
      return data.map((bill: Record<string, any>) => ({
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
        },
        originChamber: bill.origin_chamber || '',
        originChamberCode: bill.origin_chamber_code || '',
        congressGovUrl: bill.congress_gov_url || '',
        statusHistory: bill.status_history || [],
        lastStatusChange: bill.last_status_change,
        introducedDate: bill.introduced_date || '',
        constitutionalAuthorityText: bill.constitutional_authority_text || '',
        officialTitle: bill.official_title || bill.title,
        shortTitle: bill.short_title || '',
        cosponsorsCount: bill.cosponsors_count || 0
      }));
    } catch (error) {
      console.error('Error fetching bills from storage:', error);
      throw error;
    }
  }

  async getBillById(id: string): Promise<Bill[]> {
    try {
      console.log(`Fetching bill with ID ${id} from Supabase...`);
      
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('No bill found with the specified ID');
        return [];
      }

      // Transform the data back into Bill objects
      return data.map((bill: Record<string, any>) => ({
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
        },
        originChamber: bill.origin_chamber || '',
        originChamberCode: bill.origin_chamber_code || '',
        congressGovUrl: bill.congress_gov_url || '',
        statusHistory: bill.status_history || [],
        lastStatusChange: bill.last_status_change,
        introducedDate: bill.introduced_date || '',
        constitutionalAuthorityText: bill.constitutional_authority_text || '',
        officialTitle: bill.official_title || bill.title,
        shortTitle: bill.short_title || '',
        cosponsorsCount: bill.cosponsors_count || 0
      }));
    } catch (error) {
      console.error('Error fetching bill by ID from storage:', error);
      throw error;
    }
  }

  async updateBillSummary(billId: string, summary: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bills')
        .update({
          summary,
          updated_at: new Date().toISOString()
        })
        .eq('id', billId);

      if (error) throw error;
    } catch (error) {
      console.error(`Error updating summary for bill ${billId}:`, error);
      throw error;
    }
  }
} 