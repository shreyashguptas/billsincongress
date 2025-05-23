import { createClient } from '@supabase/supabase-js';
import { BillAction, BillActionsResponse, BILL_ACTIONS_TABLE_NAME } from '../lib/types/BillActions';
import dotenv from 'dotenv';
import path from 'path';
import { getSupabaseConfig } from '../lib/services/supabase/config';

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

async function fetchBillActions(congress: number, billType: string, billNumber: string, retries = 0): Promise<BillActionsResponse> {
  try {
    const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch bill actions: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(`Retrying bill actions fetch for ${billType}${billNumber} (attempt ${retries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      return fetchBillActions(congress, billType, billNumber, retries + 1);
    }
    throw error;
  }
}

function transformBillActions(data: BillActionsResponse, billId: string): BillAction[] {
  // Filter out actions without actionCode and deduplicate based on composite key
  const uniqueActions = new Map<string, BillAction>();

  const now = new Date().toISOString();

  data.actions.forEach(action => {
    if (!action.actionCode) return; // Skip actions without actionCode

    const key = `${billId}-${action.actionCode}-${action.actionDate}`;
    if (!uniqueActions.has(key)) {
      uniqueActions.set(key, {
        id: billId,
        action_code: action.actionCode,
        action_date: action.actionDate,
        source_system_code: action.sourceSystem.code,
        source_system_name: action.sourceSystem.name,
        text: action.text,
        type: action.type,
        created_at: now,
        updated_at: now
      });
    }
  });

  return Array.from(uniqueActions.values());
}

async function insertBillActions(actions: BillAction[]) {
  if (actions.length === 0) return;

  const now = new Date().toISOString();

  // Process each action individually to check update dates
  for (const action of actions) {
    // Check if we already have this action
    const { data: existingData, error: fetchError } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .select('updated_at, created_at')
      .eq('id', action.id)
      .eq('action_date', action.action_date)
      .eq('action_code', action.action_code)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error(`Failed to check existing action: ${fetchError.message}`);
      continue;
    }

    // If record exists and update date is not newer, skip update
    if (existingData && existingData.updated_at >= now) {
      console.log(`Skipping update for action ${action.id} date ${action.action_date} code ${action.action_code} - existing data is current or newer`);
      continue;
    }

    // Update the timestamps
    const actionWithTimestamps = {
      ...action,
      updated_at: now,
      created_at: existingData?.created_at || now
    };

    // Perform upsert if data is new or newer
    const { error } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .upsert(actionWithTimestamps, {
        onConflict: 'id,action_date,action_code'
      });

    if (error) {
      console.error(`Failed to update action for ${action.id} date ${action.action_date} code ${action.action_code}: ${error.message}`);
      continue;
    }

    console.log(`Successfully updated action for ${action.id} date ${action.action_date} code ${action.action_code}`);
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
          console.log(`Processing actions for ${billType.toUpperCase()} ${billNumber}...`);
          
          const billId = `${billNumber}${billType}${congress}`;
          const actionsData = await fetchBillActions(congress, billType, billNumber);
          const transformedActions = transformBillActions(actionsData, billId);
          
          if (transformedActions.length > 0) {
            await insertBillActions(transformedActions);
            console.log(`Successfully processed ${transformedActions.length} actions for ${billType.toUpperCase()} ${billNumber}`);
          } else {
            console.log(`No actions found for ${billType.toUpperCase()} ${billNumber}`);
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

  console.log(`\nCompleted processing actions for ${totalProcessed} ${billType.toUpperCase()} bills`);
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