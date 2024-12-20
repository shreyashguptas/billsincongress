import { createClient } from '@supabase/supabase-js';
import { BillText, BillTextResponse, BILL_TEXT_TABLE_NAME } from '../lib/types/BillText';
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

async function fetchBillText(congress: number, billType: string, billNumber: string): Promise<BillTextResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/text?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill text: ${response.statusText}`);
  }
  
  return response.json();
}

function transformBillText(data: BillTextResponse, billId: string): BillText[] {
  return data.textVersions.map(version => {
    const txtFormat = version.formats.find(f => f.type === 'Formatted Text');
    const pdfFormat = version.formats.find(f => f.type === 'PDF');

    if (!txtFormat || !pdfFormat) {
      throw new Error('Required formats not found');
    }

    return {
      id: billId,
      date: version.date,
      formats_url_txt: txtFormat.url,
      formats_url_pdf: pdfFormat.url,
      type: version.type
    };
  });
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

async function main() {
  try {
    // Example: Fetch text for 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching text for bill ${billNumber}...`);
        const billId = `${billNumber}${billType}${congress}`;
        const textData = await fetchBillText(congress, billType, billNumber);
        const transformedTexts = transformBillText(textData, billId);
        await insertBillText(transformedTexts);
        console.log(`Successfully processed ${transformedTexts.length} text versions for bill ${billNumber}`);
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