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

interface BillTitlesResponse {
  titles: Array<{
    title: string;
    titleType: string;
  }>;
}

async function fetchBillTitles(congress: number, billType: string, billNumber: string): Promise<BillTitlesResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/titles?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill titles: ${response.statusText}`);
  }
  
  return response.json();
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

function transformBillInfo(data: BillInfoResponse, billId: string, titles: BillTitlesResponse): BillInfo {
  const sponsor = data.bill.sponsors[0];
  const billTypeLabel = getBillTypeLabel(data.bill.type);
  const { title, titleWithoutNumber } = getOfficialTitle(titles);
  
  return {
    id: billId,
    congress: data.bill.congress,
    bill_type: data.bill.type,
    bill_number: data.bill.number,
    title: title,
    title_without_number: titleWithoutNumber,
    bill_type_label: billTypeLabel,
    introduced_date: data.bill.introducedDate,
    sponsor_first_name: sponsor.firstName,
    sponsor_last_name: sponsor.lastName,
    sponsor_party: sponsor.party,
    sponsor_state: sponsor.state,
    latest_action_code: undefined,
    latest_action_date: undefined,
    latest_action_text: undefined,
    progress_stage: undefined,
    progress_description: undefined,
    created_at: undefined,
    updated_at: undefined
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

async function insertBillInfo(info: BillInfo) {
  const { error } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .upsert(info, {
      onConflict: 'id'
    });

  if (error) {
    throw new Error(`Failed to insert bill info: ${error.message}`);
  }
}

async function main() {
  try {
    // Example: Fetch info for 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching info for bill ${billNumber}...`);
        const billId = `${billNumber}${billType}${congress}`;
        
        // Fetch both bill info and titles
        const [billData, titlesData] = await Promise.all([
          fetchBillInfo(congress, billType, billNumber),
          fetchBillTitles(congress, billType, billNumber)
        ]);
        
        const transformedInfo = transformBillInfo(billData, billId, titlesData);
        await insertBillInfo(transformedInfo);
        console.log(`Successfully processed info for bill ${billNumber}`);
      } catch (error) {
        console.error(`Error processing info for bill ${billNumber}:`, error);
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