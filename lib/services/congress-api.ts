import { Bill } from '../types.js';

const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';
const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests

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
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.CONGRESS_API_KEY || '';
    this.baseUrl = 'https://api.congress.gov/v3';
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private extractSummaryFromBillData(billData: any): string {
    // Try to get summary from various possible locations in bill data
    if (billData.summaries?.[0]?.text) {
      return billData.summaries[0].text;
    }
    if (billData.summary?.text) {
      return billData.summary.text;
    }
    if (typeof billData.summary === 'string' && billData.summary) {
      return billData.summary;
    }
    return '';
  }

  async fetchBillSummary(congress: number, billType: string, billNumber: number): Promise<string> {
    try {
      const url = new URL(`${this.baseUrl}/bill/${congress}/${billType}/${billNumber}/summaries`);
      url.searchParams.append('api_key', this.apiKey);
      url.searchParams.append('format', 'json');

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.warn(`No summary found in summaries endpoint for bill ${congress}-${billType}-${billNumber}`);
        return '';
      }

      const data = await response.json();
      const summaries = data?.summaries || [];
      if (summaries.length > 0 && summaries[0].text) {
        console.log(`Found summary in summaries endpoint for bill ${congress}-${billType}-${billNumber}`);
        return summaries[0].text;
      }
      return '';
    } catch (error) {
      console.error(`Error fetching summary for bill ${congress}-${billType}-${billNumber}:`, error);
      return '';
    }
  }

  async fetchBills(limit: number = 10, congress?: number, billType: string = 'hr', offset: number = 0): Promise<Bill[]> {
    try {
      const currentCongress = congress || Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
      console.log(`Fetching ${billType.toUpperCase()} bills from Congress ${currentCongress}, offset: ${offset}...`);

      // Fetch bill list with detailed information
      const listUrl = new URL(`${this.baseUrl}/bill/${currentCongress}/${billType}`);
      listUrl.searchParams.append('api_key', this.apiKey);
      listUrl.searchParams.append('limit', limit.toString());
      listUrl.searchParams.append('offset', offset.toString());
      listUrl.searchParams.append('format', 'json');
      listUrl.searchParams.append('sort', 'updateDate desc');

      const listResponse = await fetch(listUrl.toString());
      if (!listResponse.ok) {
        throw new Error(`API request failed: ${listResponse.statusText}`);
      }

      const listData = await listResponse.json();
      if (!listData.bills || listData.bills.length === 0) {
        console.log(`No ${billType.toUpperCase()} bills found for Congress ${currentCongress} at offset ${offset}`);
        return [];
      }

      // Fetch detailed information for each bill with rate limiting
      const detailedBills = [];
      for (const bill of listData.bills) {
        try {
          // Delay before fetching bill details
          await this.delay(RATE_LIMIT_DELAY);

          const detailUrl = new URL(`${this.baseUrl}/bill/${bill.congress}/${bill.type}/${bill.number}`);
          detailUrl.searchParams.append('api_key', this.apiKey);
          detailUrl.searchParams.append('format', 'json');

          const detailResponse = await fetch(detailUrl.toString());
          if (!detailResponse.ok) {
            console.error(`Failed to fetch details for bill ${bill.congress}-${bill.type}-${bill.number}`);
            continue;
          }

          const detailData = await detailResponse.json();
          
          // First try to get summary from bill details
          let summary = this.extractSummaryFromBillData(detailData.bill);
          
          // If no summary in bill details, try the summaries endpoint
          if (!summary) {
            await this.delay(RATE_LIMIT_DELAY);
            summary = await this.fetchBillSummary(bill.congress, bill.type, bill.number);
          }

          if (!summary) {
            console.log(`No summary available for bill ${bill.congress}-${bill.type}-${bill.number}`);
          }
          
          detailedBills.push({
            ...bill,
            ...detailData.bill,
            summary
          });
        } catch (error) {
          console.error(`Error processing bill ${bill.congress}-${bill.type}-${bill.number}:`, error);
        }
      }

      console.log(`Successfully fetched ${detailedBills.length} ${billType.toUpperCase()} bills with summaries`);
      return this.transformBills(detailedBills);
    } catch (error) {
      console.error(`Error fetching ${billType.toUpperCase()} bills:`, error);
      throw error;
    }
  }

  private cleanSponsorName(fullName: string): string {
    // Remove anything in square brackets and trim
    return fullName.replace(/\s*\[.*?\]\s*$/, '').trim();
  }

  private transformBills(bills: any[]): Bill[] {
    return bills.map(bill => {
      // Safely extract policy areas and subjects as tags
      let tags: string[] = [];
      try {
        // Handle policy area
        if (bill.policyArea?.name) {
          tags.push(bill.policyArea.name);
        }

        // Handle subjects in different possible formats
        if (Array.isArray(bill.subjects)) {
          const subjectNames = bill.subjects
            .map((subject: any) => {
              if (typeof subject === 'string') return subject;
              if (subject?.name) return subject.name;
              return null;
            })
            .filter((name: string | null): name is string => name !== null);
          tags.push(...subjectNames);
        } else if (typeof bill.subjects === 'string') {
          tags.push(bill.subjects);
        }
      } catch (error) {
        console.warn(`Warning: Error processing tags for bill ${bill.congress}-${bill.type}-${bill.number}:`, error);
      }

      // Get committee information safely
      const committees = Array.isArray(bill.committees) ? bill.committees : [];
      const committeeCount = committees.length;

      // Get sponsor information safely
      const sponsor = bill.sponsors?.[0] || bill.sponsor || {};
      const rawSponsorName = sponsor.name || sponsor.fullName || '';
      const sponsorName = this.cleanSponsorName(rawSponsorName);

      // Get summary safely from various possible locations
      const summary = bill.summaries?.[0]?.text || 
                     bill.summary?.text ||
                     (typeof bill.summary === 'string' ? bill.summary : '') || '';

      // Get action history safely
      let statusHistory = [];
      try {
        const actions = Array.isArray(bill.actions) ? bill.actions : [];
        statusHistory = actions.map((action: any) => ({
          date: action.actionDate || action.date || '',
          oldStatus: action.type || action.actionType || '',
          newStatus: action.type || action.actionType || '',
          actionText: action.text || action.description || ''
        }));
      } catch (error) {
        console.warn(`Warning: Error processing status history for bill ${bill.congress}-${bill.type}-${bill.number}:`, error);
      }

      // Get constitutional authority text safely
      const constitutionalText = typeof bill.constitutionalAuthorityStatement === 'string' 
        ? bill.constitutionalAuthorityStatement
        : bill.constitutionalAuthorityStatement?.text || '';

      // Create the bill object with safe fallbacks
      return {
        id: `${bill.congress}-${bill.type.toLowerCase()}-${bill.number}`,
        title: bill.title || bill.shortTitle || '',
        congressNumber: bill.congress,
        billType: bill.type,
        billNumber: bill.number,
        sponsorName,
        sponsorState: sponsor.state || '',
        sponsorParty: sponsor.party || '',
        sponsorBioguideId: sponsor.bioguideId || '',
        committeeCount,
        latestActionText: bill.latestAction?.text || '',
        latestActionDate: bill.latestAction?.actionDate || '',
        updateDate: bill.updateDate || '',
        status: this.determineStatus(bill),
        progress: this.calculateProgress(bill),
        summary,
        tags,
        aiSummary: '',
        lastUpdated: bill.updateDateIncludingText || bill.updateDate || '',
        voteCount: bill.votes?.[0]?.voteCount || {
          yea: 0,
          nay: 0,
          present: 0,
          notVoting: 0
        },
        originChamber: bill.originChamber || bill.originChamberCode === 'H' ? 'House' : 'Senate',
        originChamberCode: bill.originChamberCode || (bill.type.startsWith('H') ? 'H' : 'S'),
        congressGovUrl: bill.url || '',
        statusHistory,
        lastStatusChange: bill.latestAction?.actionDate || '',
        introducedDate: bill.introducedDate || '',
        constitutionalAuthorityText: constitutionalText,
        officialTitle: bill.title || '',
        shortTitle: bill.shortTitle || '',
        cosponsorsCount: bill.cosponsors?.count || bill.cosponsorCount || 0
      };
    });
  }

  private determineStatus(bill: any): string {
    const actionText = (bill.latestAction?.text || '').toLowerCase();
    const actions = (bill.actions || []).map((action: any) => 
      (action.text || action.description || '').toLowerCase()
    );
    
    // Check both latest action and full action history
    const hasAction = (text: string) => 
      actionText.includes(text) || actions.some((action: string) => action.includes(text));

    if (hasAction('became public law')) {
      return 'Enacted';
    }
    if (hasAction('vetoed')) {
      return 'Vetoed';
    }
    if (hasAction('passed by the senate') || hasAction('passed senate')) {
      return 'Passed Senate';
    }
    if (hasAction('passed by the house') || hasAction('passed house') || hasAction('passed/agreed to in house')) {
      return 'Passed House';
    }
    if (hasAction('reported')) {
      return 'Reported';
    }
    if (hasAction('introduced')) {
      return 'Introduced';
    }
    if (hasAction('referred to')) {
      return 'In Committee';
    }
    if (hasAction('failed') || hasAction('rejected')) {
      return 'Failed';
    }
    return 'In Progress';
  }

  private calculateProgress(bill: any): number {
    const status = this.determineStatus(bill);
    const actions = (bill.actions || []).map((action: any) => 
      (action.text || action.description || '').toLowerCase()
    );

    // Helper function to check if any action includes text
    const hasAction = (text: string) => 
      actions.some((action: string) => action.includes(text));

    // Calculate progress based on completed stages
    switch (status.toLowerCase()) {
      case 'enacted':
      case 'became law':
        return 100; // Completed all stages

      case 'passed senate':
        return 80;  // Completed 4 stages

      case 'passed house':
        return 60;  // Completed 3 stages

      case 'reported':
      case 'in committee':
        return 40;  // Completed 2 stages

      case 'introduced':
        return 20;  // Completed 1 stage

      case 'vetoed':
        // If vetoed after Senate passage
        if (hasAction('passed senate')) {
          return 80;
        }
        // If vetoed after House passage
        if (hasAction('passed house')) {
          return 60;
        }
        // If vetoed earlier
        return 40;

      case 'failed':
      case 'rejected':
        // If failed in Senate
        if (hasAction('failed') && hasAction('senate')) {
          return 60; // Made it through House
        }
        // If failed in House
        if (hasAction('failed') && hasAction('house')) {
          return 40; // Made it through committee
        }
        // Failed in committee
        return 20;

      default:
        // For 'In Progress' status, check the highest completed stage
        if (hasAction('passed senate')) return 80;
        if (hasAction('passed house')) return 60;
        if (hasAction('reported')) return 40;
        if (hasAction('introduced')) return 20;
        return 0;
    }
  }
} 