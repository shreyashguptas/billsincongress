import { Bill } from '../types';

const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

export class CongressApiService {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) {
      throw new Error('Missing CONGRESS_API_KEY environment variable');
    }
    this.apiKey = apiKey;
  }

  async fetchBills(limit: number = 10): Promise<Bill[]> {
    try {
      // Get current congress (118) and fetch House bills
      const url = new URL(`${CONGRESS_API_BASE_URL}/bill/118/hr`);
      const params = {
        'api_key': this.apiKey,
        'limit': limit.toString(),
        'format': 'json',
        'sort': 'updateDate desc',
        'offset': '0'
      };

      // Add query parameters
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      console.log('Fetching bills from URL:', url.toString().replace(this.apiKey, '[REDACTED]'));

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      console.log('API Response structure:', Object.keys(data));

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid API response format');
      }

      // The bills should be in the bills array
      const billsData = data.bills || [];
      
      if (!Array.isArray(billsData)) {
        console.error('Unexpected response structure:', data);
        throw new Error('Bills data is not an array');
      }

      return billsData.map((bill: any) => {
        // Extract policy area name if it exists
        const policyArea = bill.policyArea?.name || '';
        
        // Extract summary text, removing HTML tags if present
        const summaryText = bill.summaries?.[0]?.text || '';
        const cleanSummary = summaryText.replace(/<[^>]*>/g, '');

        // Create a unique ID combining congress and bill number
        const id = `${bill.congress || '118'}-${bill.number || ''}`.trim();

        return {
          id: id || 'unknown',
          title: bill.title || 'Untitled Bill',
          sponsor: bill.sponsors?.[0]?.fullName || 
                  `${bill.sponsors?.[0]?.firstName || ''} ${bill.sponsors?.[0]?.lastName || ''}`.trim() || 
                  'Unknown Sponsor',
          introduced: bill.introducedDate || '',
          status: bill.latestAction?.text || 'Status unknown',
          progress: 0,
          summary: cleanSummary || bill.title || 'No summary available',
          tags: policyArea ? [policyArea] : [],
          lastUpdated: bill.updateDate || bill.latestAction?.actionDate || new Date().toISOString(),
          voteCount: {
            yea: 0,
            nay: 0,
            present: 0,
            notVoting: 0
          }
        };
      });
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }
  }
} 