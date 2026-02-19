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
  sponsorFilter?: string;
  titleFilter?: string;
  stateFilter?: string | null;
  policyArea?: string | null;
  billType?: string | null;
  billNumber?: string;
  congress?: string | null;
}

export interface BillsResponse {
  data: Bill[];
  count: number;
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
      sponsorFilter = '',
      titleFilter = '',
      stateFilter = 'all',
      policyArea = 'all',
      billType = 'all',
      billNumber = '',
      congress = 'all',
    } = params;

    const client = getConvexClient();
    if (!client) {
      return { data: [], count: 0 };
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
        sponsorFilter: sponsorFilter || undefined,
        billNumber: billNumber || undefined,
        policyArea: policyArea && policyArea !== 'all' ? policyArea : undefined,
        offset,
        limit: itemsPerPage,
      });

      return {
        data: result.data.map(transformConvexBill),
        count: result.count,
      };
    } catch (error) {
      console.error('Error fetching bills from Convex:', error);
      return { data: [], count: 0 };
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

  async askBillQuestion(billId: string, question: string): Promise<{ answer: string; error?: string }> {
    const client = getConvexClient();
    if (!client) {
      return { answer: "", error: "Service not available" };
    }

    try {
      const { api } = await import('../../convex/_generated/api');
      return await client.action(api.llm.askBillQuestion, { billId, question });
    } catch (error) {
      console.error('Error asking bill question:', error);
      return { answer: "", error: "Failed to get response" };
    }
  },
};
