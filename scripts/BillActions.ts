import { createClient } from '@supabase/supabase-js';
import { BillAction, BillActionsResponse, BILL_ACTIONS_TABLE_NAME } from '../lib/types/BillActions';
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

async function fetchBillActions(congress: number, billType: string, billNumber: string): Promise<BillActionsResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill actions: ${response.statusText}`);
  }
  
  return response.json();
}

function transformBillActions(data: BillActionsResponse, billId: string): BillAction[] {
  return data.actions.map(action => ({
    id: billId,
    action_code: action.actionCode,
    action_date: action.actionDate,
    source_system_code: action.sourceSystem.code,
    source_system_name: action.sourceSystem.name,
    text: action.text,
    type: action.type
  }));
}

async function insertBillActions(actions: BillAction[]) {
  if (actions.length === 0) return;

  const { error } = await supabaseAdmin
    .from(BILL_ACTIONS_TABLE_NAME)
    .upsert(actions, {
      onConflict: 'id,action_code,action_date'
    });

  if (error) {
    throw new Error(`Failed to insert bill actions: ${error.message}`);
  }
}

async function main() {
  try {
    // Example: Fetch actions for 10 bills from congress 118, type HR, numbers 1-10
    const congress = 118;
    const billType = 'hr';
    const billNumbers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

    for (const billNumber of billNumbers) {
      try {
        console.log(`Fetching actions for bill ${billNumber}...`);
        const billId = `${billNumber}${billType}${congress}`;
        const actionsData = await fetchBillActions(congress, billType, billNumber);
        const transformedActions = transformBillActions(actionsData, billId);
        await insertBillActions(transformedActions);
        console.log(`Successfully processed ${transformedActions.length} actions for bill ${billNumber}`);
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