import { createClient } from '@supabase/supabase-js';
import { BillInfo, BillInfoResponse, BILL_INFO_TABLE_NAME } from '../lib/types/BillInfo';
import dotenv from 'dotenv';
import path from 'path';
import { getSupabaseConfig } from '../lib/utils/supabase/config';

// Load environment variables from both .env and .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env.local'),
  override: true 
});

// Debug: Print environment variables (safely)
console.log('Environment variables loaded:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Present' : '✗ Missing');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Present' : '✗ Missing');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✓ Present' : '✗ Missing');
console.log('CONGRESS_API_KEY:', process.env.CONGRESS_API_KEY ? '✓ Present' : '✗ Missing');
console.log('\nEnvironment files checked:');
console.log('.env path:', path.resolve(process.cwd(), '.env'));
console.log('.env.local path:', path.resolve(process.cwd(), '.env.local'));

// Validate required environment variables
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
if (!CONGRESS_API_KEY) {
  console.error('Error: Missing CONGRESS_API_KEY environment variable');
  console.error('Please make sure this variable is set in your .env.local file');
  process.exit(1);
}

// Get Supabase config and create admin client
const { url } = getSupabaseConfig();
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!serviceKey) {
  console.error('Error: Missing SUPABASE_SERVICE_KEY environment variable');
  console.error('Please make sure this variable is set in your .env.local file');
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

const BASE_URL = 'https://api.congress.gov/v3';
const RATE_LIMIT_PER_HOUR = 5000;
const DELAY_BETWEEN_REQUESTS = Math.ceil((3600 * 1000) / RATE_LIMIT_PER_HOUR); // Milliseconds between requests
const MAX_RETRIES = 3;

// All bill types in the 118th Congress
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];

async function fetchBillList(congress: number, billType: string, offset: number = 0): Promise<any> {
  const url = `${BASE_URL}/bill/${congress}/${billType}?offset=${offset}&limit=250&api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill list: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchBillInfo(congress: number, billType: string, billNumber: string, retries = 0): Promise<BillInfoResponse> {
  try {
    const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch bill info: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(`Retrying bill info fetch for ${billType}${billNumber} (attempt ${retries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      return fetchBillInfo(congress, billType, billNumber, retries + 1);
    }
    throw error;
  }
}

interface BillTitlesResponse {
  titles: Array<{
    title: string;
    titleType: string;
  }>;
}

async function fetchBillTitles(congress: number, billType: string, billNumber: string, retries = 0): Promise<BillTitlesResponse> {
  try {
    const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/titles?api_key=${CONGRESS_API_KEY}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch bill titles: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(`Retrying bill titles fetch for ${billType}${billNumber} (attempt ${retries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      return fetchBillTitles(congress, billType, billNumber, retries + 1);
    }
    throw error;
  }
}

function getOfficialTitle(titles: BillTitlesResponse): { title: string; titleWithoutNumber: string } {
  // Find the official title
  const officialTitle = titles.titles.find(t => t.titleType === 'Official Title as Introduced')?.title || 
                       titles.titles[0]?.title || '';

  // Remove bill number prefix if present (e.g., "H.R. 1234 - ")
  const titleWithoutNumber = officialTitle.replace(/^(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+\s*[-–]\s*/, '');

  return {
    title: officialTitle,
    titleWithoutNumber
  };
}

export function transformBillInfo(data: BillInfoResponse): BillInfo {
  const bill = data.bill;
  const billId = `${bill.number}${bill.type.toLowerCase()}${bill.congress}`;

  return {
    id: billId,
    congress: bill.congress,
    bill_type: bill.type.toLowerCase(),
    bill_number: bill.number,
    bill_type_label: getBillTypeLabel(bill.type.toLowerCase()),
    introduced_date: bill.introducedDate,
    title: bill.title || '',
    sponsor_first_name: bill.sponsors[0]?.firstName || '',
    sponsor_last_name: bill.sponsors[0]?.lastName || '',
    sponsor_party: bill.sponsors[0]?.party || '',
    sponsor_state: bill.sponsors[0]?.state || '',
    latest_action_date: bill.updateDate,
    latest_action_text: bill.updateDateIncludingText,
    progress_stage: 20, // Default to "Introduced" stage
    progress_description: 'Introduced'
  };
}

function getBillTypeLabel(type: string): string {
  const labels: { [key: string]: string } = {
    'hr': 'H.R.',
    's': 'S.',
    'hjres': 'H.J.Res.',
    'sjres': 'S.J.Res.',
    'hconres': 'H.Con.Res.',
    'sconres': 'S.Con.Res.',
    'hres': 'H.Res.',
    'sres': 'S.Res.'
  };
  return labels[type.toLowerCase()] || type;
}

async function insertBillInfo(bills: BillInfo[]) {
  if (bills.length === 0) return;

  // Process each bill individually to check update dates
  for (const bill of bills) {
    // Check if we already have this bill version
    const { data: existingData, error: fetchError } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .select('update_date')
      .eq('id', bill.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error(`Failed to check existing bill info: ${fetchError.message}`);
      continue;
    }

    // If record exists and update date is not newer, skip update
    if (existingData && existingData.update_date >= bill.update_date) {
      console.log(`Skipping update for bill ${bill.id} - existing data is current or newer`);
      continue;
    }

    // Perform upsert if data is new or newer
    const { error } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .upsert(bill, {
        onConflict: 'id'
      });

    if (error) {
      console.error(`Failed to update bill info for ${bill.id}: ${error.message}`);
      continue;
    }

    console.log(`Successfully updated bill info for ${bill.id}`);
  }
}

async function processBillType(congress: number, billType: string) {
  console.log(`\nProcessing ${billType.toUpperCase()} bills for Congress ${congress}...`);
  let offset = 0;
  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      console.log(`\nFetching bills offset ${offset}...`);
      const listData = await fetchBillList(congress, billType, offset);
      const bills = listData.bills || [];
      
      if (bills.length === 0) {
        hasMore = false;
        continue;
      }

      for (const bill of bills) {
        const billNumber = bill.number.toString();
        try {
          console.log(`Processing ${billType.toUpperCase()} ${billNumber}...`);
          
          // Fetch both bill info and titles
          const [billData, titlesData] = await Promise.all([
            fetchBillInfo(congress, billType, billNumber),
            fetchBillTitles(congress, billType, billNumber)
          ]);
          
          const transformedInfo = transformBillInfo(billData);
          await insertBillInfo(transformedInfo);
          
          totalProcessed++;
          console.log(`Successfully processed ${billType.toUpperCase()} ${billNumber}`);
          
          // Respect rate limit
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        } catch (error) {
          console.error(`Error processing ${billType.toUpperCase()} ${billNumber}:`, error);
        }
      }

      offset += bills.length;
      
      // If we got less than 250 bills, we've reached the end
      if (bills.length < 250) {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching bill list for ${billType} at offset ${offset}:`, error);
      // Wait a bit longer on error before retrying
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  console.log(`\nCompleted processing ${totalProcessed} ${billType.toUpperCase()} bills`);
}

async function main() {
  try {
    const congress = 118;
    
    for (const billType of BILL_TYPES) {
      await processBillType(congress, billType);
    }
    
    console.log('\nScript completed successfully!');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main(); 