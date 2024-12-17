import { Bill } from '../types.js';

const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

interface BatchOptions {
  offset: number;
  limit: number;
  fromDateTime?: string;
  toDateTime?: string;
  sort?: string;
}

interface ApiParams {
  api_key: string;
  limit: string;
  offset: string;
  format: string;
  sort?: string;
  fromDateTime?: string;
  toDateTime?: string;
}

export class CongressApiService {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) {
      throw new Error('Congress API key is not configured');
    }
    this.apiKey = apiKey;
  }

  async fetchBillsBatch(congress: number, billType: string, options: BatchOptions): Promise<Bill[]> {
    try {
      const url = new URL(`${CONGRESS_API_BASE_URL}/bill/${congress}/${billType}`);
      const params: ApiParams = {
        api_key: this.apiKey,
        limit: options.limit.toString(),
        offset: options.offset.toString(),
        format: 'json'
      };

      if (options.sort) {
        params.sort = options.sort;
      }

      if (options.fromDateTime) {
        params.fromDateTime = options.fromDateTime;
      }
      if (options.toDateTime) {
        params.toDateTime = options.toDateTime;
      }

      // Add query parameters
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      console.log('Fetching bills from URL:', url.toString().replace(this.apiKey, '[REDACTED]'));

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Congress-Tracker/1.0'
        },
        next: { revalidate: 3600 } // Cache for 1 hour
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

      const billsData = data.bills || [];
      
      if (!Array.isArray(billsData)) {
        console.error('Unexpected response structure:', data);
        throw new Error('Bills data is not an array');
      }

      // For each bill, fetch additional details including summaries
      const detailedBills = await Promise.all(
        billsData.map(async (bill: any) => {
          try {
            const detailUrl = new URL(`${CONGRESS_API_BASE_URL}/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`);
            detailUrl.searchParams.append('api_key', this.apiKey);
            detailUrl.searchParams.append('format', 'json');

            const detailResponse = await fetch(detailUrl.toString(), {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Congress-Tracker/1.0'
              },
              next: { revalidate: 3600 } // Cache for 1 hour
            });

            if (!detailResponse.ok) {
              throw new Error(`HTTP error! status: ${detailResponse.status}`);
            }

            const detailData = await detailResponse.json();
            const billDetail = detailData.bill;

            // Calculate progress based on actions
            const progress = this.calculateProgress(billDetail);
            const status = this.determineStatus(billDetail);

            // Create a bill object that matches the Bill interface
            const billObject: Bill = {
              id: `${bill.congress}-${bill.type.toLowerCase()}-${bill.number}`,
              title: bill.title || 'Untitled Bill',
              congressNumber: bill.congress,
              billType: bill.type,
              billNumber: parseInt(bill.number),
              sponsorName: billDetail.sponsors?.[0]?.fullName || '',
              sponsorState: billDetail.sponsors?.[0]?.state || '',
              sponsorParty: billDetail.sponsors?.[0]?.party || '',
              sponsorBioguideId: billDetail.sponsors?.[0]?.bioguideId || '',
              committeeCount: billDetail.committees?.count || 0,
              latestActionText: bill.latestAction?.text || '',
              latestActionDate: bill.latestAction?.actionDate || '',
              updateDate: bill.updateDate || '',
              status: status,
              progress: progress,
              summary: billDetail.summaries?.[0]?.text?.replace(/<[^>]*>/g, '') || '',
              tags: billDetail.policyArea ? [billDetail.policyArea.name] : [],
              lastUpdated: bill.updateDateIncludingText || bill.updateDate,
              voteCount: {
                yea: 0,
                nay: 0,
                present: 0,
                notVoting: 0
              },
              originChamber: bill.originChamber || '',
              originChamberCode: bill.originChamberCode || '',
              congressGovUrl: billDetail.congressGovUrl || '',
              statusHistory: [],
              introducedDate: billDetail.introducedDate || '',
              constitutionalAuthorityText: billDetail.constitutionalAuthorityText || '',
              officialTitle: billDetail.title || bill.title || '',
              shortTitle: billDetail.shortTitle || '',
              cosponsorsCount: billDetail.cosponsors?.count || 0
            };

            return billObject;
          } catch (error) {
            console.error(`Error fetching details for bill ${bill.number}:`, error);
            return null;
          }
        })
      );

      // Filter out any null values and ensure type safety
      return detailedBills.filter((bill): bill is Bill => bill !== null);
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }
  }

  async fetchBills(limit: number = 10): Promise<Bill[]> {
    // Use the new batch fetching method for consistency
    return this.fetchBillsBatch(118, 'hr', { offset: 0, limit });
  }

  private calculateProgress(bill: any): number {
    if (!bill) return 0;
    
    const actionText = bill.latestAction?.text?.toLowerCase() || '';
    const status = {
      'became public law': 100,
      'enrolled bill': 90,
      'passed both': 80,
      'passed senate': 70,
      'passed house': 60,
      'reported favorably': 50,
      'reported': 40,
      'hearings': 30,
      'referred': 20,
      'introduced': 10
    };

    for (const [key, value] of Object.entries(status)) {
      if (actionText.includes(key)) return value;
    }
    
    return 0;
  }

  private determineStatus(bill: any): string {
    if (!bill) return 'Unknown';

    const actionText = bill.latestAction?.text?.toLowerCase() || '';

    if (bill.laws?.length > 0 || actionText.includes('became public law')) {
      return 'Became Law';
    }
    if (actionText.includes('enrolled')) {
      return 'Enrolled';
    }
    if (actionText.includes('passed') && actionText.includes('both')) {
      return 'Passed Both Chambers';
    }
    if (actionText.includes('passed') && actionText.includes('senate')) {
      return 'Passed Senate';
    }
    if (actionText.includes('passed') && actionText.includes('house')) {
      return 'Passed House';
    }
    if (actionText.includes('reported favorably')) {
      return 'Reported Favorably';
    }
    if (actionText.includes('reported')) {
      return 'Reported';
    }
    if (actionText.includes('hearings')) {
      return 'In Hearings';
    }
    if (actionText.includes('referred')) {
      return 'Referred';
    }
    if (actionText.includes('introduced')) {
      return 'Introduced';
    }

    return 'In Progress';
  }
} 