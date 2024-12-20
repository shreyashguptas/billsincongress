import { createClient } from '@supabase/supabase-js';
import { BillSubject, BillSubjectsResponse, BILL_SUBJECTS_TABLE_NAME } from '../lib/types/BillSubjects';
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

async function fetchBillSubjects(congress: number, billType: string, billNumber: string): Promise<BillSubjectsResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/subjects?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill subjects: ${response.statusText}`);
  }
  
  return response.json();
}

function transformBillSubjects(data: BillSubjectsResponse, billId: string): BillSubject {
  return {
    id: billId,
    policy_area_name: data.subjects.policyArea.name,
    policy_area_update_date: data.subjects.policyArea.updateDate
  };
}

async function insertBillSubject(subject: BillSubject) {
  const { error } = await supabaseAdmin
    .from(BILL_SUBJECTS_TABLE_NAME)
    .upsert(subject, {
      onConflict: 'id'
    });

  if (error) {
    throw new Error(`Failed to insert bill subject: ${error.message}`);
  }
}

async function main() {
  try {
    // Example: Fetch subjects for 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching subjects for bill ${billNumber}...`);
        const billId = `${billNumber}${billType}${congress}`;
        const subjectsData = await fetchBillSubjects(congress, billType, billNumber);
        const transformedSubject = transformBillSubjects(subjectsData, billId);
        await insertBillSubject(transformedSubject);
        console.log(`Successfully processed subjects for bill ${billNumber}`);
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