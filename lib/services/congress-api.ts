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
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.CONGRESS_API_KEY || '';
    this.baseUrl = 'https://api.congress.gov/v3';
  }

  async fetchBills(limit: number = 10, congress?: number): Promise<Bill[]> {
    try {
      const currentCongress = congress || Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
      console.log(`Fetching bills from Congress ${currentCongress}...`);

      const url = new URL(`${this.baseUrl}/bill/${currentCongress}/hr`);
      url.searchParams.append('api_key', this.apiKey);
      url.searchParams.append('limit', limit.toString());
      url.searchParams.append('format', 'json');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      return this.transformBills(data.bills);
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }
  }

  private transformBills(bills: any[]): Bill[] {
    return bills.map(bill => ({
      id: `${bill.congress}-${bill.type.toLowerCase()}-${bill.number}`,
      title: bill.title || '',
      congressNumber: bill.congress,
      billType: bill.type,
      billNumber: bill.number,
      sponsorName: bill.sponsor?.name || '',
      sponsorState: bill.sponsor?.state || '',
      sponsorParty: bill.sponsor?.party || '',
      sponsorBioguideId: bill.sponsor?.bioguideId || '',
      committeeCount: bill.committees?.length || 0,
      latestActionText: bill.latestAction?.text || '',
      latestActionDate: bill.latestAction?.actionDate || '',
      updateDate: bill.updateDate || '',
      status: this.determineStatus(bill),
      progress: this.calculateProgress(bill),
      summary: bill.summary || '',
      tags: [],
      aiSummary: '',
      lastUpdated: bill.updateDateIncludingText || bill.updateDate || '',
      voteCount: {
        yea: 0,
        nay: 0,
        present: 0,
        notVoting: 0
      },
      originChamber: bill.originChamber || '',
      originChamberCode: bill.originChamberCode || '',
      congressGovUrl: bill.url || '',
      statusHistory: [],
      lastStatusChange: bill.lastStatusChange || '',
      introducedDate: bill.introducedDate || '',
      constitutionalAuthorityText: bill.constitutionalAuthorityStatement || '',
      officialTitle: bill.title || '',
      shortTitle: bill.shortTitle || '',
      cosponsorsCount: bill.cosponsors?.count || 0
    }));
  }

  private determineStatus(bill: any): string {
    if (bill.latestAction?.text?.includes('Became Public Law')) {
      return 'Enacted';
    }
    if (bill.latestAction?.text?.includes('Vetoed')) {
      return 'Vetoed';
    }
    return 'In Progress';
  }

  private calculateProgress(bill: any): number {
    const status = this.determineStatus(bill);
    switch (status) {
      case 'Enacted':
        return 100;
      case 'Vetoed':
        return 90;
      default:
        return 50; // Default progress for bills in progress
    }
  }
} 