import { createClient } from '@supabase/supabase-js';
import { BillText, BillTextResponse, BILL_TEXT_TABLE_NAME } from '../lib/types/BillText';
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

async function fetchBillText(congress: number, billType: string, billNumber: string, retries = 0): Promise<BillTextResponse> {
  try {
    const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/text?api_key=${CONGRESS_API_KEY}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch bill text: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(`Retrying bill text fetch for ${billType}${billNumber} (attempt ${retries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      return fetchBillText(congress, billType, billNumber, retries + 1);
    }
    throw error;
  }
}

function transformBillText(data: BillTextResponse, billId: string): BillText[] {
  return data.textVersions.map(version => ({
    id: billId,
    date: version.date,
    formats_url_txt: version.formats.find(f => f.type === 'Formatted Text')?.url || '',
    formats_url_pdf: version.formats.find(f => f.type === 'PDF')?.url || '',
    type: version.type
  }));
}

async function insertBillText(texts: BillText[]) {
  if (texts.length === 0) return;

  const { error } = await supabaseAdmin
    .from(BILL_TEXT_TABLE_NAME)
    .upsert(texts, {
      onConflict: 'id,date,type'
    });

  if (error) {
    throw new Error(`Failed to insert bill text: ${error.message}`);
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
          console.log(`Processing text for ${billType.toUpperCase()} ${billNumber}...`);
          
          const billId = `${billNumber}${billType}${congress}`;
          const textData = await fetchBillText(congress, billType, billNumber);
          const transformedTexts = transformBillText(textData, billId);
          
          if (transformedTexts.length > 0) {
            await insertBillText(transformedTexts);
            console.log(`Successfully processed ${transformedTexts.length} text versions for ${billType.toUpperCase()} ${billNumber}`);
          } else {
            console.log(`No text versions found for ${billType.toUpperCase()} ${billNumber}`);
          }
          
          totalProcessed++;
          
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

  console.log(`\nCompleted processing text for ${totalProcessed} ${billType.toUpperCase()} bills`);
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