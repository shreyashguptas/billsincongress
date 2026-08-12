import { Bill } from '@/lib/types/bill';
import { ConvexHttpClient } from 'convex/browser';
import { parseBillReference, expandSearchAcronym } from '@/lib/bill-query';

/**
 * Bills service that fetches data from Convex backend.
 * Falls back to empty results if Convex is not configured.
 */

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

/**
 * PostHog distinct/session ID headers so server-side captures in API routes
 * attach to the same person and session replay as the browser's events.
 * Browser-only (dynamic import) so this shared client/server file stays
 * safe to import from server components.
 */
async function getPostHogHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const { analytics } = await import('@/lib/analytics');
    return analytics.requestHeaders();
  } catch {
    return {};
  }
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

export interface BillsCountResult {
  count: number | null;
  exact: boolean;
}

/**
 * Convex args for the text/number part of a query.
 *
 * A search box entry that is entirely a bill reference ("HR 7540", "s.4784",
 * bare "9244") becomes an indexed number lookup instead of a title search,
 * because a bill number appears in no title and so can never match there.
 * Anything else stays a title search.
 *
 * An explicit bill-type dropdown selection wins over the type in the typed
 * reference — the visible control should not be silently overridden — so a
 * contradictory pair simply returns nothing, which the empty state explains.
 */
function resolveTextQuery(
  titleFilter: string,
  billNumber: string,
  billType: string | null,
): { titleFilter?: string; billNumber?: string; billType?: string } {
  const explicitType = billType && billType !== 'all' ? billType : undefined;

  // An explicit bill-number filter is already unambiguous; leave it alone.
  const reference = billNumber ? null : parseBillReference(titleFilter);
  if (!reference) {
    // "NDAA" matches no title; its bill is called "National Defense
    // Authorization Act". Expand before searching.
    const expanded = expandSearchAcronym(titleFilter) ?? titleFilter;
    return {
      titleFilter: expanded || undefined,
      billNumber: billNumber || undefined,
      billType: explicitType,
    };
  }

  return {
    titleFilter: undefined,
    billNumber: reference.billNumber,
    billType: explicitType ?? reference.billType ?? undefined,
  };
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
    base_rate_percent: doc.base_rate_percent,
    base_rate_sample: doc.base_rate_sample,
    days_in_committee: doc.days_in_committee,
  };
}

export const billsService = {
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
      introducedDateFilter = 'all',
      lastActionDateFilter = 'all',
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
        sponsorFilter: sponsorFilter.length > 0 ? sponsorFilter : undefined,
        ...resolveTextQuery(titleFilter, billNumber, billType),
        policyArea: policyArea && policyArea !== 'all' ? policyArea : undefined,
        introducedDateFilter:
          introducedDateFilter && introducedDateFilter !== 'all' ? introducedDateFilter : undefined,
        lastActionDateFilter:
          lastActionDateFilter && lastActionDateFilter !== 'all' ? lastActionDateFilter : undefined,
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
   * Fetch an exact total count when Convex can answer from precomputed data.
   * Complex filter combinations return `{ count: null, exact: false }` rather
   * than scanning an entire congress.
   */
  async fetchBillsCount(
    params: Omit<BillQueryParams, 'page' | 'itemsPerPage'>,
  ): Promise<BillsCountResult> {
    const {
      status = 'all',
      introducedDateFilter = 'all',
      lastActionDateFilter = 'all',
      sponsorFilter = [],
      titleFilter = '',
      stateFilter = 'all',
      policyArea = 'all',
      billType = 'all',
      billNumber = '',
      congress = 'all',
    } = params;

    const client = getConvexClient();
    if (!client) return { count: null, exact: false };

    try {
      const { api } = await import('../../convex/_generated/api');
      return await client.query(api.bills.listCount, {
        congress: congress && congress !== 'all' ? parseInt(congress, 10) : undefined,
        progressStage: status && status !== 'all' ? parseInt(status, 10) : undefined,
        sponsorState: stateFilter && stateFilter !== 'all' ? stateFilter : undefined,
        sponsorFilter: sponsorFilter.length > 0 ? sponsorFilter : undefined,
        ...resolveTextQuery(titleFilter, billNumber, billType),
        policyArea: policyArea && policyArea !== 'all' ? policyArea : undefined,
        introducedDateFilter:
          introducedDateFilter && introducedDateFilter !== 'all' ? introducedDateFilter : undefined,
        lastActionDateFilter:
          lastActionDateFilter && lastActionDateFilter !== 'all' ? lastActionDateFilter : undefined,
      });
    } catch (error) {
      console.error('Error fetching bills count from Convex:', error);
      return { count: null, exact: false };
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
   * Fetch persisted chat history for the signed-in user and bill.
   * Returns an empty array when no conversation exists yet.
   */
  async getBillChatHistory(
    billId: string
  ): Promise<Array<{ _id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>> {
    const client = getConvexClient();
    if (!client) return [];

    try {
      const { api } = await import('../../convex/_generated/api');
      const result = await client.query(api.llm.getBillChatHistory, { billId });
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
    question: string,
    clientSessionId?: string,
  ): Promise<ChatResult> {
    try {
      const response = await fetch('/api/bill-chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getPostHogHeaders()) },
        body: JSON.stringify({ billId, question, clientSessionId }),
      });
      const result = (await response.json()) as ChatResult;
      if (!response.ok && !result.error) {
        return { answer: "", error: "Failed to get response" };
      }
      return result;
    } catch (error) {
      console.error('Error sending chat message:', error);
      return { answer: "", error: "Failed to get response" };
    }
  },

  async getChatUsage(): Promise<ChatUsageResult> {
    try {
      const response = await fetch('/api/bill-chat/usage');
      if (!response.ok) {
        return {
          kind: 'anonymous',
          max: 5,
          blocked: false,
          resetAt: null,
        };
      }
      return (await response.json()) as ChatUsageResult;
    } catch (error) {
      console.error('Error fetching chat usage:', error);
      return {
        kind: 'anonymous',
        max: 5,
        blocked: false,
        resetAt: null,
      };
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

export type ChatUsageResult = {
  kind: "anonymous" | "authed";
  max: number;
  blocked: boolean;
  resetAt: number | null;
  retryAfterMs?: number | null;
  remaining?: number;
  used?: number;
  requiresAuth?: boolean;
};
