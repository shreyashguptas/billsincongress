import { Bill } from '@/lib/types/bill';
import { ConvexHttpClient } from 'convex/browser';

/**
 * Bills service that fetches data from Convex backend.
 * Falls back to empty results if Convex is not configured.
 */

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export interface BillQueryParams {
  page?: number;
  itemsPerPage?: number;
  status?: string | null;
  introducedDateFilter?: string | null;
  lastActionDateFilter?: string | null;
  // Array of exact full names ("First Last"). Empty array = no filter.
  sponsorFilter?: string[];
  titleFilter?: string;
  stateFilter?: string | null;
  policyArea?: string | null;
  billType?: string | null;
  billNumber?: string;
  congress?: string | null;
}

export interface SponsorOption {
  name: string;
  party?: string;
  state?: string;
  billCount: number;
}

export interface BillsResponse {
  data: Bill[];
  hasMore: boolean;
}

/**
 * Transform a Convex bill document to the frontend Bill interface.
 * Maps camelCase Convex fields to snake_case Bill fields.
 */
function transformConvexBill(doc: any): Bill {
  return {
    id: doc.billId || doc._id,
    congress: doc.congress,
    bill_type: doc.billType,
    bill_number: doc.billNumber,
    bill_type_label: doc.billTypeLabel || '',
    introduced_date: doc.introducedDate || '',
    title: doc.title || '',
    sponsor_first_name: doc.sponsorFirstName || '',
    sponsor_last_name: doc.sponsorLastName || '',
    sponsor_party: doc.sponsorParty || '',
    sponsor_state: doc.sponsorState || '',
    progress_stage: doc.progressStage || 20,
    progress_description: doc.progressDescription || 'Introduced',
    bill_subjects: doc.bill_subjects || { policy_area_name: '' },
    latest_summary: doc.latest_summary || '',
    pdf_url: doc.pdf_url || '',
  };
}

export const billsService = {
  async getCongressInfo(): Promise<{ congress: number; startYear: number; endYear: number }> {
    const client = getConvexClient();
    if (!client) {
      return { congress: 119, startYear: 2025, endYear: 2027 };
    }

    try {
      const { api } = await import('../../convex/_generated/api');
      const result = await client.query(api.bills.getCongressInfo);
      return result;
    } catch (error) {
      console.error('Error fetching congress info from Convex:', error);
      return { congress: 119, startYear: 2025, endYear: 2027 };
    }
  },

  async fetchBillById(id: string): Promise<Bill> {
    const client = getConvexClient();
    if (!client) {
      throw new Error('Convex not configured');
    }

    try {
      const { api } = await import('../../convex/_generated/api');
      const result = await client.query(api.bills.getById, { billId: id });
      if (!result) {
        throw new Error('Bill not found');
      }
      return transformConvexBill(result);
    } catch (error) {
      console.error('Error fetching bill from Convex:', error);
      throw error;
    }
  },

  async fetchBills(params: BillQueryParams): Promise<BillsResponse> {
    const {
      page = 1,
      itemsPerPage = 10,
      status = 'all',
      sponsorFilter = [],
      titleFilter = '',
      stateFilter = 'all',
      policyArea = 'all',
      billType = 'all',
      billNumber = '',
      congress = 'all',
    } = params;

    const client = getConvexClient();
    if (!client) {
      return { data: [], hasMore: false };
    }

    try {
      const { api } = await import('../../convex/_generated/api');
      const offset = (page - 1) * itemsPerPage;

      const result = await client.query(api.bills.list, {
        congress: congress && congress !== 'all' ? parseInt(congress, 10) : undefined,
        progressStage: status && status !== 'all' ? parseInt(status, 10) : undefined,
        sponsorState: stateFilter && stateFilter !== 'all' ? stateFilter : undefined,
        billType: billType && billType !== 'all' ? billType : undefined,
        titleFilter: titleFilter || undefined,
        sponsorFilter: sponsorFilter.length > 0 ? sponsorFilter : undefined,
        billNumber: billNumber || undefined,
        policyArea: policyArea && policyArea !== 'all' ? policyArea : undefined,
        offset,
        limit: itemsPerPage,
      });

      return {
        data: result.data.map(transformConvexBill),
        hasMore: result.hasMore,
      };
    } catch (error) {
      console.error('Error fetching bills from Convex:', error);
      return { data: [], hasMore: false };
    }
  },

  /**
   * Fetch the exact total count of bills matching the given filters.
   * Runs independently from `fetchBills` so callers can render the page
   * before the (slower) count finishes.
   */
  async fetchBillsCount(
    params: Omit<BillQueryParams, 'page' | 'itemsPerPage'>,
  ): Promise<number> {
    const {
      status = 'all',
      sponsorFilter = [],
      titleFilter = '',
      stateFilter = 'all',
      policyArea = 'all',
      billType = 'all',
      billNumber = '',
      congress = 'all',
    } = params;

    const client = getConvexClient();
    if (!client) return 0;

    try {
      const { api } = await import('../../convex/_generated/api');
      return await client.query(api.bills.listCount, {
        congress: congress && congress !== 'all' ? parseInt(congress, 10) : undefined,
        progressStage: status && status !== 'all' ? parseInt(status, 10) : undefined,
        sponsorState: stateFilter && stateFilter !== 'all' ? stateFilter : undefined,
        billType: billType && billType !== 'all' ? billType : undefined,
        titleFilter: titleFilter || undefined,
        sponsorFilter: sponsorFilter.length > 0 ? sponsorFilter : undefined,
        billNumber: billNumber || undefined,
        policyArea: policyArea && policyArea !== 'all' ? policyArea : undefined,
      });
    } catch (error) {
      console.error('Error fetching bills count from Convex:', error);
      return 0;
    }
  },

  async getSyncStatus(): Promise<{
    syncType: string;
    completedAt: string | undefined;
    totalProcessed: number | undefined;
    totalSuccess: number | undefined;
    totalFailed: number | undefined;
  } | null> {
    const client = getConvexClient();
    if (!client) return null;

    try {
      const { api } = await import('../../convex/_generated/api');
      return await client.query(api.bills.getSyncStatus);
    } catch (error) {
      console.error('Error fetching sync status from Convex:', error);
      return null;
    }
  },

  async fetchAllSponsors(): Promise<SponsorOption[]> {
    const client = getConvexClient();
    if (!client) return [];

    try {
      const { api } = await import('../../convex/_generated/api');
      const rows = await client.query(api.bills.listAllSponsors);
      return rows as SponsorOption[];
    } catch (error) {
      console.error('Error fetching sponsors from Convex:', error);
      return [];
    }
  },

  async getAvailableCongressNumbers(): Promise<number[]> {
    const client = getConvexClient();
    if (!client) {
      return [];
    }

    try {
      const { api } = await import('../../convex/_generated/api');
      return await client.query(api.bills.getCongressNumbers);
    } catch (error) {
      console.error('Error fetching congress numbers from Convex:', error);
      return [];
    }
  },

  /**
   * Fetch persisted chat history for a bill + anonymous browser session.
   * Returns an empty array when no conversation exists yet.
   */
  async getBillChatHistory(
    billId: string,
    sessionId: string
  ): Promise<Array<{ _id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>> {
    const client = getConvexClient();
    if (!client) return [];

    try {
      const { api } = await import('../../convex/_generated/api');
      const result = await client.query(api.llm.getBillChatHistory, { billId, sessionId });
      return result as Array<{ _id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>;
    } catch (error) {
      console.error('Error fetching bill chat history:', error);
      return [];
    }
  },

  /**
   * Send a message in the bill chat and return the AI response.
   * Persists both the user message and the assistant reply in Convex.
   *
   * On rate-limit hit, returns `error: "RATE_LIMITED"` with a `rateLimit`
   * object describing the cap and reset time. Caller (bill-qa.tsx) is
   * expected to render a dialog from those fields.
   */
  async sendChatMessage(
    billId: string,
    sessionId: string,
    question: string
  ): Promise<ChatResult> {
    const client = getConvexClient();
    if (!client) {
      return { answer: "", error: "Service not available" };
    }

    try {
      const { api } = await import('../../convex/_generated/api');
      const result = await client.action(api.llm.sendChatMessage, {
        billId,
        sessionId,
        question,
      });
      return result as ChatResult;
    } catch (error) {
      console.error('Error sending chat message:', error);
      return { answer: "", error: "Failed to get response" };
    }
  },
};

/**
 * Return type for the bill chat. The `RATE_LIMITED` branch carries enough
 * info for the UI to render a "you've hit your daily limit" dialog with
 * the right copy + reset time, without a second round-trip.
 */
export type ChatResult = {
  answer: string;
  error?: string;
  rateLimit?: {
    kind: "anonymous" | "authed";
    max: number;
    retryAfterMs: number;
    resetAt: number;
  };
};
