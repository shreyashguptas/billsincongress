import { createClient } from '@supabase/supabase-js';
import { BillTitle, BillTitlesResponse, BILL_TITLES_TABLE_NAME } from '../lib/types/BillTitles';
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

async function fetchBillTitles(congress: number, billType: string, billNumber: string): Promise<BillTitlesResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/titles?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill titles: ${response.statusText}`);
  }
  
  return response.json();
}

function transformBillTitles(data: BillTitlesResponse, billId: string): BillTitle[] {
  return data.titles.map(title => ({
    id: billId,
    title: title.title,
    title_type: title.titleType,
    title_type_code: title.titleTypeCode,
    update_date: title.updateDate,
    bill_text_version_code: title.billTextVersionCode,
    bill_text_version_name: title.billTextVersionName,
    chamber_code: title.chamberCode,
    chamber_name: title.chamberName
  }));
}

async function insertBillTitles(titles: BillTitle[]) {
  if (titles.length === 0) return;

  const { error } = await supabaseAdmin
    .from(BILL_TITLES_TABLE_NAME)
    .upsert(titles, {
      onConflict: 'id,title_type_code,title'
    });

  if (error) {
    throw new Error(`Failed to insert bill titles: ${error.message}`);
  }
}

async function main() {
  try {
    // Example: Fetch titles for 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching titles for bill ${billNumber}...`);
        const billId = `${billNumber}${billType}${congress}`;
        const titlesData = await fetchBillTitles(congress, billType, billNumber);
        const transformedTitles = transformBillTitles(titlesData, billId);
        await insertBillTitles(transformedTitles);
        console.log(`Successfully processed ${transformedTitles.length} titles for bill ${billNumber}`);
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