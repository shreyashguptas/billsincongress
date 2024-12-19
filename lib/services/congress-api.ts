import { Bill } from '../types.js';

const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';
const BASE_DELAY = 1100; // Slightly over 1 second to be safe
const MAX_RETRIES = 3;
const BATCH_SIZE = 20;

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

interface BillAction {
  text?: string;
  type?: string;
  sourceSystem?: {
    code?: number;
    name?: string;
  };
  actionDate?: string;
  date?: string;
  description?: string;
}

interface BillData {
  latestAction?: BillAction;
  actions?: {
    items?: BillAction[];
  } | BillAction[];
}

interface BillSummary {
  actionDate: string;
  actionDesc: string;
  text: string;
  updateDate: string;
  versionCode: string;
}

interface SummaryResponse {
  summaries: BillSummary[];
  pagination: {
    count: number;
  };
  request: {
    billNumber: string;
    billType: string;
    congress: string;
  };
}

export class CongressApiService {
  private apiKey: string;
  private baseUrl: string;
  private requestCount: number;
  private lastRequestTime: number;

  constructor() {
    this.apiKey = process.env.CONGRESS_API_KEY || '';
    this.baseUrl = 'https://api.congress.gov/v3';
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleRateLimit(retryCount: number = 0): Promise<void> {
    const backoffDelay = BASE_DELAY * Math.pow(2, retryCount);
    console.log(`Rate limit reached. Waiting ${backoffDelay}ms before retry ${retryCount + 1}/${MAX_RETRIES}`);
    await this.delay(backoffDelay);
  }

  private async makeRequest(url: URL, retryCount: number = 0): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < BASE_DELAY) {
      await this.delay(BASE_DELAY - timeSinceLastRequest);
    }

    try {
      const response = await fetch(url.toString());
      this.lastRequestTime = Date.now();
      this.requestCount++;

      if (response.status === 429 && retryCount < MAX_RETRIES) {
        await this.handleRateLimit(retryCount);
        return this.makeRequest(url, retryCount + 1);
      }

      if (!response.ok && retryCount < MAX_RETRIES) {
        console.warn(`Request failed with status ${response.status}. Retrying...`);
        await this.handleRateLimit(retryCount);
        return this.makeRequest(url, retryCount + 1);
      }

      return response;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`Request failed with error: ${error}. Retrying...`);
        await this.handleRateLimit(retryCount);
        return this.makeRequest(url, retryCount + 1);
      }
      throw error;
    }
  }

  async fetchBillSummary(congress: number, billType: string, billNumber: number): Promise<string> {
    try {
      const url = new URL(`${this.baseUrl}/bill/${congress}/${billType}/${billNumber}/summaries`);
      url.searchParams.append('api_key', this.apiKey);
      url.searchParams.append('format', 'json');

      const response = await this.makeRequest(url);
      if (!response.ok) {
        console.warn(`Failed to fetch summary for bill ${congress}-${billType}-${billNumber}: ${response.statusText}`);
        return '';
      }

      const data = await response.json();
      
      // Check if we have summaries in the response
      if (!data?.summaries || !Array.isArray(data.summaries) || data.summaries.length === 0) {
        console.warn(`No summaries found for bill ${congress}-${billType}-${billNumber}`);
        return '';
      }

      // Sort summaries by updateDate to get the most recent one
      const sortedSummaries = data.summaries.sort((a: BillSummary, b: BillSummary) => {
        return new Date(b.updateDate).getTime() - new Date(a.updateDate).getTime();
      });

      // Get the most recent summary text
      const summaryText = sortedSummaries[0].text;
      if (!summaryText) {
        console.warn(`Empty summary text for bill ${congress}-${billType}-${billNumber}`);
        return '';
      }

      return summaryText
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (error) {
      console.error(`Error fetching summary for bill ${congress}-${billType}-${billNumber}:`, error);
      return '';
    }
  }

  async fetchBills(limit: number = 250, congress?: number, billType: string = 'hr', offset: number = 0): Promise<Bill[]> {
    try {
      const currentCongress = congress || Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
      console.log(`Fetching ${billType.toUpperCase()} bills from Congress ${currentCongress}, offset: ${offset}...`);

      const listUrl = new URL(`${this.baseUrl}/bill/${currentCongress}/${billType}`);
      listUrl.searchParams.append('api_key', this.apiKey);
      listUrl.searchParams.append('limit', Math.min(limit, 250).toString());
      listUrl.searchParams.append('offset', offset.toString());
      listUrl.searchParams.append('format', 'json');
      listUrl.searchParams.append('sort', 'updateDate desc');

      const listResponse = await this.makeRequest(listUrl);
      if (!listResponse.ok) {
        throw new Error(`API request failed: ${listResponse.statusText}`);
      }

      const listData = await listResponse.json();
      if (!listData.bills || listData.bills.length === 0) {
        console.log(`No ${billType.toUpperCase()} bills found for Congress ${currentCongress} at offset ${offset}`);
        return [];
      }

      const detailedBills = [];
      // Process bills in batches
      for (let i = 0; i < listData.bills.length; i += BATCH_SIZE) {
        const batch = listData.bills.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch of ${batch.length} bills (${i + 1}-${i + batch.length} of ${listData.bills.length})...`);
        
        for (const bill of batch) {
          try {
            const billId = `${bill.congress}-${bill.type}-${bill.number}`;
            console.log(`Processing bill ${billId}...`);

            const detailUrl = new URL(`${this.baseUrl}/bill/${bill.congress}/${bill.type}/${bill.number}`);
            detailUrl.searchParams.append('api_key', this.apiKey);
            detailUrl.searchParams.append('format', 'json');
            
            const detailResponse = await this.makeRequest(detailUrl);
            if (!detailResponse.ok) {
              console.error(`Failed to fetch details for bill ${billId}: ${detailResponse.statusText}`);
              continue;
            }
            
            const detailData = await detailResponse.json();
            let summary = '';
            
            if (detailData.bill?.summaries?.count > 0) {
              const summaryUrl = new URL(`${this.baseUrl}/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}/summaries`);
              summaryUrl.searchParams.append('api_key', this.apiKey);
              summaryUrl.searchParams.append('format', 'json');
              
              const summaryResponse = await this.makeRequest(summaryUrl);
              if (summaryResponse.ok) {
                const summaryData = await summaryResponse.json();
                
                if (summaryData?.summaries && Array.isArray(summaryData.summaries) && summaryData.summaries.length > 0) {
                  const sortedSummaries = summaryData.summaries.sort((a: BillSummary, b: BillSummary) => {
                    return new Date(b.updateDate).getTime() - new Date(a.updateDate).getTime();
                  });
                  
                  if (sortedSummaries[0].text) {
                    summary = sortedSummaries[0].text
                      .replace(/<[^>]*>/g, '')
                      .replace(/&nbsp;/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();
                    console.log(`Found summary for bill ${billId} (length: ${summary.length})`);
                  }
                }
              } else {
                console.warn(`Failed to fetch summary for bill ${billId}: ${summaryResponse.statusText}`);
              }
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
        
        // Add a delay between batches
        if (i + BATCH_SIZE < listData.bills.length) {
          console.log('Waiting between batches...');
          await this.delay(BASE_DELAY * 2);
        }
      }

      console.log(`\nSuccessfully fetched ${detailedBills.length} ${billType.toUpperCase()} bills with summaries`);
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

      // Get the summary directly from the bill object
      const summary = bill.summary || '';

      // Get action history safely
      let statusHistory = [];
      try {
        const actions = Array.isArray(bill.actions?.items) 
          ? bill.actions.items 
          : Array.isArray(bill.actions) 
            ? bill.actions 
            : [];

        statusHistory = actions.map((action: any) => ({
          date: action.actionDate || action.date || '',
          oldStatus: action.type || '',
          newStatus: this.determineStatus({
            latestAction: action,
            actions: [action]
          }),
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

  private determineStatus(bill: BillData): string {
    const latestAction = bill.latestAction || {};
    const actionText = (latestAction.text || '').toLowerCase();
    const actionType = (latestAction.type || '').toLowerCase();
    const sourceSystem = latestAction.sourceSystem?.name?.toLowerCase() || '';

    // Define specific action patterns
    const patterns = {
      becameLaw: {
        type: ['becamelaw'],
        text: ['became public law', 'public law no']
      },
      presidential: {
        type: ['president'],
        text: {
          signed: ['signed by president'],
          vetoed: ['vetoed'],
          pending: ['presented to president']
        }
      },
      housePassage: {
        type: ['floor'],
        source: 'house floor actions',
        text: {
          passed: [
            'passed house',
            'passed by recorded vote',
            'passed by voice vote',
            'passed by yeas and nays',
            'on passage passed'
          ],
          excluded: [
            'title of the measure was amended',
            'motion to reconsider',
            'amendments agreed to',
            'amendment agreed to',
            'conference report',
            'motion to suspend'
          ]
        }
      },
      senatePassage: {
        type: ['floor'],
        source: 'senate',
        text: {
          passed: [
            'passed senate',
            'passed by unanimous consent',
            'passed with amendment'
          ],
          excluded: [
            'motion to proceed',
            'cloture',
            'amendment agreed to'
          ]
        }
      }
    };

    // Check if both chambers have passed the bill
    const actions: BillAction[] = 'items' in (bill.actions || {}) && Array.isArray((bill.actions as { items: BillAction[] }).items)
      ? (bill.actions as { items: BillAction[] }).items
      : Array.isArray(bill.actions)
        ? bill.actions
        : [];

    const hasPassedHouse = actions.some((action: BillAction) => {
      const aText = (action.text || '').toLowerCase();
      const aSource = action.sourceSystem?.name?.toLowerCase() || '';
      return aSource.includes('house') &&
        patterns.housePassage.text.passed.some(t => aText.includes(t)) &&
        !patterns.housePassage.text.excluded.some(t => aText.includes(t));
    });

    const hasPassedSenate = actions.some((action: BillAction) => {
      const aText = (action.text || '').toLowerCase();
      const aSource = action.sourceSystem?.name?.toLowerCase() || '';
      return aSource.includes('senate') &&
        patterns.senatePassage.text.passed.some(t => aText.includes(t)) &&
        !patterns.senatePassage.text.excluded.some(t => aText.includes(t));
    });

    // Check latest action against patterns
    if (patterns.becameLaw.type.includes(actionType) || 
        patterns.becameLaw.text.some(t => actionText.includes(t))) {
      return 'Became Law';
    }

    if (actionType === 'president') {
      if (patterns.presidential.text.signed.some(t => actionText.includes(t))) 
        return 'Signed by President';
      if (patterns.presidential.text.vetoed.some(t => actionText.includes(t))) 
        return 'Vetoed';
      if (patterns.presidential.text.pending.some(t => actionText.includes(t))) 
        return 'To President';
    }

    // If bill has passed both chambers but hasn't been sent to president yet
    if (hasPassedHouse && hasPassedSenate) {
      return 'Passed Both Chambers';
    }

    if (actionType === 'floor') {
      // House passage check
      if (sourceSystem.includes('house')) {
        if (patterns.housePassage.text.passed.some(t => actionText.includes(t)) &&
            !patterns.housePassage.text.excluded.some(t => actionText.includes(t))) {
          return hasPassedSenate ? 'Passed Both Chambers' : 'Passed House';
        }
      }
      
      // Senate passage check
      if (sourceSystem.includes('senate')) {
        if (patterns.senatePassage.text.passed.some(t => actionText.includes(t)) &&
            !patterns.senatePassage.text.excluded.some(t => actionText.includes(t))) {
          return hasPassedHouse ? 'Passed Both Chambers' : 'Passed Senate';
        }
      }
    }

    // Committee and Introduction checks
    if (actionType === 'committee' && actionText.includes('reported')) {
      return 'Reported';
    }

    if (actionType === 'introreferral' || actionText.includes('introduced')) {
      return 'Introduced';
    }

    if (actionType === 'committee' || actionText.includes('referred to')) {
      return 'In Committee';
    }

    return 'In Progress';
  }

  private calculateProgress(bill: any): number {
    const status = this.determineStatus(bill);
    
    // Map status to progress percentage
    switch (status) {
      case 'Became Law':
        return 100;
      
      case 'Signed by President':
        return 95;
      
      case 'To President':
        return 90;
      
      case 'Passed Both Chambers':
        return 85;
      
      case 'Passed Senate':
        return bill.originChamberCode === 'H' ? 80 : 60;
      
      case 'Passed House':
        return bill.originChamberCode === 'H' ? 60 : 80;
      
      case 'Reported':
        return 40;
      
      case 'In Committee':
        return 30;
      
      case 'Introduced':
        return 20;
      
      case 'Vetoed': {
        // Calculate vetoed progress based on how far it got
        const actions: BillAction[] = 'items' in (bill.actions || {}) && Array.isArray((bill.actions as { items: BillAction[] }).items)
          ? (bill.actions as { items: BillAction[] }).items
          : Array.isArray(bill.actions)
            ? bill.actions
            : [];
        
        const hasAction = (type: string, text?: string): boolean => {
          return actions.some((action: BillAction) => {
            const actionType = (action.type || '').toLowerCase();
            const actionText = (action.text || '').toLowerCase();
            return actionType.includes(type.toLowerCase()) && (!text || actionText.includes(text.toLowerCase()));
          });
        };

        if (hasAction('floor', 'passed senate') && hasAction('floor', 'passed house')) {
          return 85; // Vetoed after passing both chambers
        }
        if (hasAction('floor', 'passed senate') || hasAction('floor', 'passed house')) {
          return 70; // Vetoed after passing one chamber
        }
        return 50; // Vetoed earlier
      }
      
      default:
        return 10;
    }
  }
} 