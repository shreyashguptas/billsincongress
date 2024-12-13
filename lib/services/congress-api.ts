import { Bill } from '../types';

const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

export class CongressApiService {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) {
      throw new Error('Congress API key is not configured');
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

      // For each bill, fetch additional details including summaries
      const detailedBills = await Promise.all(
        billsData.map(async (bill: any) => {
          try {
            const detailUrl = new URL(`${CONGRESS_API_BASE_URL}/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`);
            detailUrl.searchParams.append('api_key', this.apiKey);
            detailUrl.searchParams.append('format', 'json');

            const detailResponse = await fetch(detailUrl.toString());
            const detailData = await detailResponse.json();
            const billDetail = detailData.bill;

            // Calculate progress based on actions
            const progress = this.calculateProgress(billDetail);

            // Create a bill object that matches the Bill interface
            const billObject: Bill = {
              id: `${bill.congress}-${bill.number}`,
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
              status: this.determineStatus(billDetail),
              progress: progress,
              summary: billDetail.summaries?.[0]?.text?.replace(/<[^>]*>/g, '') || '',
              tags: billDetail.policyArea ? [billDetail.policyArea.name] : [],
              lastUpdated: bill.updateDate || undefined,
              voteCount: {
                yea: 0,
                nay: 0,
                present: 0,
                notVoting: 0
              }
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

  private calculateProgress(bill: any): number {
    // Calculate progress based on bill status
    if (!bill) return 0;

    if (bill.laws?.length > 0) return 100; // Became law
    
    const actionText = bill.latestAction?.text?.toLowerCase() || '';
    
    if (actionText.includes('became public law')) return 100;
    if (actionText.includes('passed') && actionText.includes('senate')) return 75;
    if (actionText.includes('passed') && actionText.includes('house')) return 50;
    if (actionText.includes('reported')) return 25;
    if (actionText.includes('introduced')) return 10;
    
    return 0;
  }

  private determineStatus(bill: any): string {
    if (!bill) return 'Unknown';

    const actionText = bill.latestAction?.text?.toLowerCase() || '';

    if (bill.laws?.length > 0 || actionText.includes('became public law')) {
      return 'Became Law';
    }
    if (actionText.includes('passed') && actionText.includes('senate')) {
      return 'Passed Senate';
    }
    if (actionText.includes('passed') && actionText.includes('house')) {
      return 'Passed House';
    }
    if (actionText.includes('reported')) {
      return 'Reported';
    }
    if (actionText.includes('introduced')) {
      return 'Introduced';
    }

    return 'In Progress';
  }
} 