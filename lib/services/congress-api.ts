import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ 
  path: resolve(process.cwd(), '.env.local'),
  override: true 
});

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const API_BASE_URL = 'https://api.congress.gov/v3';

// Bill type mapping for database to API conversion
const BILL_TYPE_MAP: Record<string, string> = {
  'House Bill': 'hr',
  'Senate Bill': 's',
  'House Resolution': 'hres',
  'Senate Resolution': 'sres',
  'House Joint Resolution': 'hjres',
  'Senate Joint Resolution': 'sjres',
  'House Concurrent Resolution': 'hconres',
  'Senate Concurrent Resolution': 'sconres',
  // Also include the API values themselves
  'hr': 'hr',
  's': 's',
  'hres': 'hres',
  'sres': 'sres',
  'hjres': 'hjres',
  'sjres': 'sjres',
  'hconres': 'hconres',
  'sconres': 'sconres'
};

interface BillTextFormat {
  type: string;
  url: string;
}

interface BillTextVersion {
  date: string | null;
  formats: BillTextFormat[];
  type: string;
}

interface BillTextResponse {
  textVersions: BillTextVersion[];
}

export class CongressApiService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!CONGRESS_API_KEY) {
      throw new Error('CONGRESS_API_KEY environment variable is not set');
    }
    this.apiKey = CONGRESS_API_KEY;
    this.baseUrl = API_BASE_URL;
  }

  private getApiBillType(billType: string): string {
    return BILL_TYPE_MAP[billType] || billType.toLowerCase();
  }

  async fetchBillText(congress: number, billType: string, billNumber: number): Promise<{ textUrl: string | null; pdfUrl: string | null }> {
    try {
      // Convert the bill type to API format
      const apiBillType = this.getApiBillType(billType);
      
      const apiUrl = `${this.baseUrl}/bill/${congress}/${apiBillType}/${billNumber}/text?api_key=${this.apiKey}`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`No text versions available for bill ${congress}-${apiBillType}-${billNumber}`);
          return { textUrl: null, pdfUrl: null };
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const textVersions: BillTextResponse = data;

      // Get the most recent version's URLs
      if (textVersions.textVersions && textVersions.textVersions.length > 0) {
        const latestVersion = textVersions.textVersions[0];
        let textUrl = null;
        let pdfUrl = null;

        for (const format of latestVersion.formats) {
          if (format.type === 'Formatted Text') {
            textUrl = format.url;
          } else if (format.type === 'PDF') {
            pdfUrl = format.url;
          }
        }

        return { textUrl, pdfUrl };
      }

      return { textUrl: null, pdfUrl: null };
    } catch (error) {
      console.error('Error fetching bill text:', error);
      return { textUrl: null, pdfUrl: null };
    }
  }

  async fetchBills(limit: number, congress: number, billType?: string, offset: number = 0, options: { fromDateTime?: string; toDateTime?: string } = {}) {
    try {
      const { fromDateTime, toDateTime } = options;
      let url = `${this.baseUrl}/bill`;

      if (congress && billType) {
        const apiBillType = this.getApiBillType(billType);
        url += `/${congress}/${apiBillType}`;
      }

      url += `?api_key=${this.apiKey}&limit=${limit}&offset=${offset}&format=json`;

      if (fromDateTime) {
        url += `&fromDateTime=${fromDateTime}`;
      }
      if (toDateTime) {
        url += `&toDateTime=${toDateTime}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.bills || [];
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }
  }
} 