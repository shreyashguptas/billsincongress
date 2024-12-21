import { BillInfoResponse } from '@/lib/types/BillInfo';

export class CongressApiService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!process.env.CONGRESS_API_KEY) {
      throw new Error('Congress API key is not configured');
    }
    this.apiKey = process.env.CONGRESS_API_KEY;
    this.baseUrl = 'https://api.congress.gov/v3';
  }

  async fetchBills(limit: number = 10, congress?: number): Promise<BillInfoResponse[]> {
    try {
      const currentCongress = congress || this.getCurrentCongress();
      const url = `${this.baseUrl}/bill/${currentCongress}?api_key=${this.apiKey}&limit=${limit}&format=json`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch bills: ${response.statusText}`);
      }

      const data = await response.json();
      return data.bills || [];
    } catch (error) {
      console.error('Error fetching bills from Congress API:', error);
      throw error;
    }
  }

  private getCurrentCongress(): number {
    const currentYear = new Date().getFullYear();
    return Math.floor((currentYear - 1789) / 2) + 1;
  }
} 