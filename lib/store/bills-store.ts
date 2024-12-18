import { create } from 'zustand';
import { Bill } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface BillsState {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  offset: number;
  sortBy: string;
  status: string;
  category: string;
  searchQuery: string;
  uniqueStatuses: string[];
  uniqueTags: string[];
  setBills: (bills: Bill[]) => void;
  setSortBy: (sort: string) => void;
  setStatus: (status: string) => void;
  setCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
  fetchBills: (reset?: boolean) => Promise<void>;
  fetchUniqueValues: () => Promise<void>;
}

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
  },
  originChamber: data.origin_chamber || '',
  originChamberCode: data.origin_chamber_code || '',
  congressGovUrl: data.congress_gov_url || '',
  statusHistory: data.status_history || [],
  lastStatusChange: data.last_status_change,
  introducedDate: data.introduced_date || '',
  constitutionalAuthorityText: data.constitutional_authority_text || '',
  officialTitle: data.official_title || data.title,
  shortTitle: data.short_title || '',
  cosponsorsCount: data.cosponsors_count || 0
});

export const useBillsStore = create<BillsState>((set, get) => ({
  bills: [],
  loading: false,
  error: null,
  offset: 0,
  sortBy: 'latest',
  status: 'all',
  category: 'all',
  searchQuery: '',
  uniqueStatuses: [],
  uniqueTags: [],

  setBills: (bills) => set({ bills }),
  setSortBy: (sortBy) => set({ sortBy }),
  setStatus: (status) => set({ status }),
  setCategory: (category) => set({ category }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  
  clearFilters: () => {
    set({
      sortBy: 'latest',
      status: 'all',
      category: 'all',
      searchQuery: '',
    });
    get().fetchBills(true);
  },

  fetchUniqueValues: async () => {
    try {
      // Fetch unique statuses
      const { data: statusData, error: statusError } = await supabase
        .from('bills')
        .select('status')
        .not('status', 'is', null);

      if (statusError) throw statusError;

      const uniqueStatuses = ['all', ...new Set(statusData.map(item => item.status))];

      // Fetch unique tags
      const { data: tagData, error: tagError } = await supabase
        .from('bills')
        .select('tags')
        .not('tags', 'is', null);

      if (tagError) throw tagError;

      const allTags = tagData.flatMap(item => item.tags || []);
      const uniqueTags = ['all', ...new Set(allTags)];

      set({ uniqueStatuses, uniqueTags });
    } catch (error: any) {
      console.error('Error fetching unique values:', error);
    }
  },

  fetchBills: async (reset = false) => {
    const state = get();
    const offset = reset ? 0 : state.offset;
    
    try {
      set({ loading: true, error: null });
      
      let query = supabase
        .from('bills')
        .select('*');

      // Apply filters
      if (state.status !== 'all') {
        query = query.eq('status', state.status);
      }

      if (state.category !== 'all') {
        query = query.contains('tags', [state.category]);
      }

      if (state.searchQuery) {
        query = query.ilike('title', `%${state.searchQuery}%`);
      }

      // Apply sorting
      if (state.sortBy === 'latest') {
        query = query.order('last_updated', { ascending: false });
      } else if (state.sortBy === 'oldest') {
        query = query.order('last_updated', { ascending: true });
      }

      query = query.range(offset, offset + 9);

      const { data, error: supabaseError } = await query;

      if (supabaseError) throw supabaseError;

      const transformedBills = data?.map(transformBillData) || [];
      
      if (reset) {
        set({ bills: transformedBills, offset: 10 });
      } else {
        set(state => ({
          bills: [...state.bills, ...transformedBills],
          offset: state.offset + 10
        }));
      }
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },
})); 