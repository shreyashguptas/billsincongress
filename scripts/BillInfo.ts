import { createClient } from '@supabase/supabase-js';
import { BillInfo, BillInfoResponse, BILL_INFO_TABLE_NAME } from '../lib/types/BillInfo';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env.local'),
  override: true 
});

// Create Supabase client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const BASE_URL = 'https://api.congress.gov/v3';

async function fetchBillInfo(congress: number, billType: string, billNumber: string): Promise<BillInfoResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill info: ${response.statusText}`);
  }
  
  return response.json();
}

function transformBillData(data: BillInfoResponse): BillInfo {
  const { bill } = data;
  const sponsor = bill.sponsors[0]; // Get the first sponsor

  return {
    id: `${bill.number}${bill.type.toLowerCase()}${bill.congress}`,
    introduced_date: bill.introducedDate,
    sponsor_bioguide_id: sponsor.bioguideId,
    sponsor_district: sponsor.district,
    sponsor_first_name: sponsor.firstName,
    sponsor_last_name: sponsor.lastName,
    sponsor_party: sponsor.party,
    sponsor_state: sponsor.state,
    sponsor_is_by_request: sponsor.isByRequest,
    update_date: bill.updateDate,
    update_date_including_text: bill.updateDateIncludingText
  };
}

async function insertBillInfo(billInfo: BillInfo) {
  const { error } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .upsert(billInfo, {
      onConflict: 'id'
    });

  if (error) {
    throw new Error(`Failed to insert bill info: ${error.message}`);
  }
}

async function main() {
  try {
    // Example: Fetch 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching bill ${billNumber}...`);
        const billData = await fetchBillInfo(congress, billType, billNumber);
        const transformedData = transformBillData(billData);
        await insertBillInfo(transformedData);
        console.log(`Successfully processed bill ${billNumber}`);
      } catch (error) {
        console.error(`Error processing bill ${billNumber}:`, error);
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main(); 