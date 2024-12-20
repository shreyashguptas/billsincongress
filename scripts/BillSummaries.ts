import { createClient } from '@supabase/supabase-js';
import { BillSummary, BillSummariesResponse, BILL_SUMMARIES_TABLE_NAME } from '../lib/types/BillSummaries';
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

async function fetchBillSummaries(congress: number, billType: string, billNumber: string): Promise<BillSummariesResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/summaries?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill summaries: ${response.statusText}`);
  }
  
  return response.json();
}

function transformBillSummaries(data: BillSummariesResponse, billId: string): BillSummary[] {
  return data.summaries.map(summary => ({
    id: billId,
    action_date: summary.actionDate,
    action_desc: summary.actionDesc,
    text: summary.text,
    update_date: summary.updateDate,
    version_code: summary.versionCode
  }));
}

async function insertBillSummaries(summaries: BillSummary[]) {
  if (summaries.length === 0) return;

  const { error } = await supabaseAdmin
    .from(BILL_SUMMARIES_TABLE_NAME)
    .upsert(summaries, {
      onConflict: 'id,version_code'
    });

  if (error) {
    throw new Error(`Failed to insert bill summaries: ${error.message}`);
  }
}

async function main() {
  try {
    // Example: Fetch summaries for 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching summaries for bill ${billNumber}...`);
        const billId = `${billNumber}${billType}${congress}`;
        const summariesData = await fetchBillSummaries(congress, billType, billNumber);
        const transformedSummaries = transformBillSummaries(summariesData, billId);
        await insertBillSummaries(transformedSummaries);
        console.log(`Successfully processed ${transformedSummaries.length} summaries for bill ${billNumber}`);
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