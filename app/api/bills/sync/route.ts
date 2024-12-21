import { NextRequest, NextResponse } from 'next/server';
import { BillStorageService } from '@/lib/services/bill-storage';

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_API_URL = 'https://api.congress.gov/v3';

async function fetchBillDetails(url: string): Promise<any> {
  try {
    console.log('Fetching bill details from:', url);
    const response = await fetch(`${url}&api_key=${CONGRESS_API_KEY}`);
    if (!response.ok) {
      console.error('Error fetching bill details:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response body:', text);
      throw new Error(`Failed to fetch bill details: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.bill) {
      console.error('No bill data in response:', JSON.stringify(data, null, 2));
      throw new Error('No bill data in response');
    }

    return data.bill;
  } catch (error) {
    console.error('Error in fetchBillDetails:', error);
    throw error;
  }
}

async function fetchBills(): Promise<any[]> {
  try {
    if (!CONGRESS_API_KEY) {
      throw new Error('Congress API key not found');
    }

    const url = `${CONGRESS_API_URL}/bill/118/hr?api_key=${CONGRESS_API_KEY}&limit=20&format=json`;
    console.log('Fetching bills from:', url);

    const response = await fetch(url);
    if (!response.ok) {
      console.error('Error fetching bills:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response body:', text);
      throw new Error(`Failed to fetch bills: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Fetched bills response:', JSON.stringify(data, null, 2));

    if (!data.bills) {
      throw new Error('No bills array in response');
    }

    // Fetch detailed information for each bill
    const detailedBills = await Promise.all(
      data.bills.map(async (bill: any) => {
        try {
          return await fetchBillDetails(bill.url);
        } catch (error) {
          console.error(`Error fetching details for bill ${bill.number}:`, error);
          return null;
        }
      })
    );

    const validBills = detailedBills.filter((bill): bill is any => bill !== null);
    console.log(`Successfully fetched ${validBills.length} detailed bills`);
    return validBills;
  } catch (error) {
    console.error('Error in fetchBills:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('Starting bill sync...');
    const bills = await fetchBills();
    console.log(`Fetched ${bills.length} bills`);

    const billStorage = new BillStorageService();
    let savedCount = 0;

    for (const bill of bills) {
      try {
        console.log('Saving bill:', bill.number);
        await billStorage.saveBill(bill);
        console.log('Successfully saved bill:', bill.number);
        savedCount++;
      } catch (error) {
        console.error('Error saving bill:', bill.number, error);
        // Continue with the next bill instead of throwing
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${savedCount} bills out of ${bills.length} total`
    });
  } catch (error) {
    console.error('Error in sync route:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: error instanceof Error ? error.stack : undefined
    });
  }
} 