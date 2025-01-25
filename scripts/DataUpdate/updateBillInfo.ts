import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { getSupabaseConfig } from '../../lib/utils/supabase/config';
import { BillInfo, BILL_INFO_TABLE_NAME } from '../../lib/types/BillInfo';
import { BillStages, BillStageDescriptions, getStageFromDescription } from '../../lib/utils/bill-stages';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env.local'),
  override: true 
});

// Constants
const BASE_URL = 'https://api.congress.gov/v3';
const RATE_LIMIT_PER_HOUR = 5000;
const DELAY_BETWEEN_REQUESTS = Math.ceil((3600 * 1000) / RATE_LIMIT_PER_HOUR); // Milliseconds between requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
// Configure which Congresses to process, in order from newest to oldest
const CONGRESSES_TO_PROCESS = [118, 119]; // Add more Congress numbers as needed
// Configure bill number range and empty response handling
const MAX_EMPTY_RESPONSES = 50; // Stop after this many consecutive empty responses
const BATCH_SIZE = 250; // Number of bills to request per API call

// Progress tracking
interface FailedBill {
  id: string;
  error: string;
  errorType: 'API_ERROR' | 'NETWORK_ERROR' | 'RATE_LIMIT' | 'DATABASE_ERROR' | 'UNKNOWN';
  timestamp: string;
  retryCount: number;
}

interface UpdateProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
  skipped: number;
  failedBills: FailedBill[];
  currentCongress: number;
  currentBillType: string;
  lastProcessedBillNumber: number;
}

let progress: UpdateProgress = {
  total: 0,
  current: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  failedBills: [],
  currentCongress: CONGRESSES_TO_PROCESS[0],
  currentBillType: BILL_TYPES[0],
  lastProcessedBillNumber: 0
};

// Validate environment variables
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
if (!CONGRESS_API_KEY) {
  console.error('Error: Missing CONGRESS_API_KEY environment variable');
  process.exit(1);
}

// Get Supabase config and create admin client
const { url } = getSupabaseConfig();
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!serviceKey) {
  console.error('Error: Missing SUPABASE_SERVICE_KEY environment variable');
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

// Utility function for controlled delays
async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// Utility function to calculate bill stage
function calculateBillStage(bill: any): { stage: number; description: string } {
  // Default to INTRODUCED
  let stage: number = BillStages.INTRODUCED;
  let description = BillStageDescriptions[BillStages.INTRODUCED as keyof typeof BillStageDescriptions];

  if (!bill.actions || !Array.isArray(bill.actions)) {
    return { stage, description };
  }

  // Sort actions by date in descending order
  const sortedActions = [...bill.actions].sort((a, b) => 
    new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime()
  );

  // Track chamber passages
  let passedHouse = false;
  let passedSenate = false;

  // Check the actions
  for (const action of sortedActions) {
    const actionText = action.text.toLowerCase();
    const actionType = action.type?.toLowerCase() || '';
    
    // Check for law status first (highest priority)
    if (actionText.includes('became public law') || actionText.includes('became private law') ||
        actionType === 'becamelaw' || action.actionCode === '36000' || action.actionCode === 'E40000') {
      return { 
        stage: BillStages.BECAME_LAW, 
        description: BillStageDescriptions[BillStages.BECAME_LAW as keyof typeof BillStageDescriptions]
      };
    }
    
    // Check for presidential signature
    if (actionText.includes('signed by president') || actionType === 'signedbypresident' ||
        action.actionCode === '29000' || action.actionCode === 'E30000') {
      return { 
        stage: BillStages.SIGNED_BY_PRESIDENT, 
        description: BillStageDescriptions[BillStages.SIGNED_BY_PRESIDENT as keyof typeof BillStageDescriptions]
      };
    }
    
    // Check if sent to president
    if (actionText.includes('to president') || actionText.includes('presented to president') ||
        action.actionCode === '28000' || action.actionCode === 'E20000') {
      return { 
        stage: BillStages.TO_PRESIDENT, 
        description: BillStageDescriptions[BillStages.TO_PRESIDENT as keyof typeof BillStageDescriptions]
      };
    }

    // Track passage through each chamber
    if (actionText.includes('passed house') || actionType === 'passedhouse' || 
        action.actionCode === 'H32500') {
      passedHouse = true;
    }
    if (actionText.includes('passed senate') || actionType === 'passedsenate' || 
        action.actionCode === 'S32500') {
      passedSenate = true;
    }

    // If we've found both chamber passages, we can return immediately
    if (passedHouse && passedSenate) {
      return {
        stage: BillStages.PASSED_BOTH_CHAMBERS,
        description: BillStageDescriptions[BillStages.PASSED_BOTH_CHAMBERS as keyof typeof BillStageDescriptions]
      };
    }

    // Check for committee action
    if (actionText.includes('referred to') || actionText.includes('committee') ||
        action.actionCode === '5000' || action.actionCode === '14000' ||
        action.actionCode === 'H11100' || action.actionCode === 'S11100') {
      stage = BillStages.IN_COMMITTEE;
      description = BillStageDescriptions[BillStages.IN_COMMITTEE as keyof typeof BillStageDescriptions];
      // Don't return here - keep checking for higher stages
    }
  }

  // After checking all actions, if we found passage through one chamber
  if (passedHouse || passedSenate) {
    return {
      stage: BillStages.PASSED_ONE_CHAMBER,
      description: BillStageDescriptions[BillStages.PASSED_ONE_CHAMBER as keyof typeof BillStageDescriptions]
    };
  }

  // If we got here and stage is still IN_COMMITTEE
  if (stage === BillStages.IN_COMMITTEE) {
    return { stage, description };
  }

  // Default to INTRODUCED if no other stage was determined
  return { stage, description };
}

// Utility function to transform API response to our database schema
function transformBillInfo(bill: any): BillInfo {
  return {
    id: `${bill.number}${bill.type.toLowerCase()}${bill.congress}`,
    congress: parseInt(bill.congress),
    bill_type: bill.type.toLowerCase(),
    bill_number: bill.number.toString(),
    bill_type_label: getBillTypeLabel(bill.type),
    introduced_date: bill.introducedDate,
    title: bill.title || '',
    title_without_number: bill.title?.replace(/^(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+\s*[-–]\s*/, '') || '',
    sponsor_first_name: bill.sponsors?.[0]?.firstName || null,
    sponsor_last_name: bill.sponsors?.[0]?.lastName || null,
    sponsor_party: bill.sponsors?.[0]?.party || null,
    sponsor_state: bill.sponsors?.[0]?.state || null,
    // Let the database trigger determine the progress stage and description
    progress_stage: undefined,
    progress_description: undefined,
    updated_at: new Date().toISOString()
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

// Function to fetch bills from Congress API
async function fetchBillList(congress: number, billType: string, offset: number = 0): Promise<any> {
  const url = `${BASE_URL}/bill/${congress}/${billType}?offset=${offset}&limit=${BATCH_SIZE}&api_key=${CONGRESS_API_KEY}&format=json`;
  console.log(`Fetching bills from: ${url.replace(String(CONGRESS_API_KEY), 'XXXXX')}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill list: ${response.statusText}`);
  }
  
  return response.json();
}

// Function to fetch detailed bill info
async function fetchBillInfo(congress: number, billType: string, billNumber: string): Promise<any> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill info: ${response.statusText}`);
  }
  
  return response.json();
}

// Utility function to categorize errors
function categorizeError(error: any): { type: FailedBill['errorType']; message: string } {
  if (error.message?.includes('rate limit')) {
    return { type: 'RATE_LIMIT', message: 'API rate limit exceeded' };
  }
  if (error.message?.includes('fetch failed') || error.message?.includes('network')) {
    return { type: 'NETWORK_ERROR', message: 'Network connectivity issue' };
  }
  if (error.code === 'PGRST') {
    return { type: 'DATABASE_ERROR', message: error.message };
  }
  if (error.message?.includes('api_key') || error.message?.includes('404')) {
    return { type: 'API_ERROR', message: error.message };
  }
  return { type: 'UNKNOWN', message: error.message || 'Unknown error occurred' };
}

// Function to process a single bill with retries
async function processBill(bill: any, congress: number, billType: string, retryCount: number = 0): Promise<void> {
  const billId = `${bill.number}${billType}${congress}`;
  const apiUpdateDate = new Date(bill.updateDate);
  
  try {
    // Check if bill exists and compare update dates
    const { data: existingBill, error: fetchError } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .select('updated_at')
      .eq('id', billId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing bill: ${fetchError.message}`);
    }

    // Skip if bill exists and is up to date
    if (existingBill && new Date(existingBill.updated_at) >= apiUpdateDate) {
      console.log(`Skipping bill ${billId} - already up to date`);
      progress.skipped++;
      return;
    }

    // Fetch detailed bill info
    console.log(`Fetching details for bill ${billId}...`);
    const billData = await fetchBillInfo(congress, billType, bill.number.toString());
    const transformedBill = transformBillInfo(billData.bill);

    // Update or insert the bill
    const { error: upsertError } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .upsert(transformedBill, {
        onConflict: 'id'
      });

    if (upsertError) {
      throw new Error(`Failed to upsert bill: ${upsertError.message}`);
    }

    console.log(`Successfully ${existingBill ? 'updated' : 'inserted'} bill ${billId}`);
    progress.success++;

    // If this was a retry and it succeeded, remove from failed bills
    progress.failedBills = progress.failedBills.filter(fb => fb.id !== billId);

  } catch (error: any) {
    const { type, message } = categorizeError(error);
    console.error(`Error processing bill ${billId} (${type}):`, message);
    
    // Add to failed bills if max retries reached
    if (retryCount >= MAX_RETRIES) {
      progress.failed++;
      progress.failedBills.push({
        id: billId,
        error: message,
        errorType: type,
        timestamp: new Date().toISOString(),
        retryCount
      });
    } else {
      // Retry with exponential backoff
      const backoffDelay = RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`Retrying bill ${billId} in ${backoffDelay/1000} seconds... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await delay(backoffDelay);
      return processBill(bill, congress, billType, retryCount + 1);
    }
  }
}

// Function to retry failed bills
async function retryFailedBills(): Promise<void> {
  if (progress.failedBills.length === 0) return;

  console.log('\n🔄 Retrying failed bills...');
  const failedBills = [...progress.failedBills];
  progress.failedBills = []; // Clear the list for new failures

  for (const failedBill of failedBills) {
    try {
      const match = failedBill.id.match(/(\d+)([a-z]+)(\d+)/);
      if (!match) {
        console.error(`Invalid bill ID format: ${failedBill.id}`);
        continue;
      }
      const [, billNumber, billType, congress] = match;
      const bill = {
        number: billNumber,
        type: billType.toUpperCase(),
        congress: parseInt(congress),
        updateDate: new Date().toISOString() // Force update
      };
      
      console.log(`\nRetrying failed bill ${failedBill.id} (previous error: ${failedBill.errorType})`);
      await processBill(bill, parseInt(congress), billType, failedBill.retryCount);
      await delay(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(`Failed to retry bill ${failedBill.id}`);
    }
  }
}

// Main function to process all bills
async function main() {
  try {
    console.log('🚀 Starting bill info update process...');
    
    // Test database connection
    const { error: testError } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .select('id')
      .limit(1);
      
    if (testError) {
      throw new Error(`Database connection failed: ${testError.message}`);
    }

    // Process each Congress sequentially
    for (const congress of CONGRESSES_TO_PROCESS) {
      console.log(`\n📋 Processing Congress ${congress}...`);
      progress.currentCongress = congress;
      
      for (const billType of BILL_TYPES) {
        console.log(`\nProcessing ${billType.toUpperCase()} bills for Congress ${congress}...`);
        progress.currentBillType = billType;
        progress.lastProcessedBillNumber = 0;
        
        let consecutiveEmptyResponses = 0;
        let offset = 0;

        while (consecutiveEmptyResponses < MAX_EMPTY_RESPONSES) {
          try {
            const data = await fetchBillList(congress, billType, offset);
            const bills = data.bills || [];
            
            if (bills.length === 0) {
              consecutiveEmptyResponses++;
              console.log(`No bills found at offset ${offset}. Empty responses: ${consecutiveEmptyResponses}/${MAX_EMPTY_RESPONSES}`);
              offset += BATCH_SIZE;
              await delay(DELAY_BETWEEN_REQUESTS);
              continue;
            }

            // Reset counter when we find bills
            consecutiveEmptyResponses = 0;
            console.log(`Processing ${bills.length} bills...`);
            progress.total += bills.length;

            // Process bills sequentially to respect rate limits
            for (const bill of bills) {
              progress.current++;
              progress.lastProcessedBillNumber = parseInt(bill.number);
              try {
                await processBill(bill, congress, billType);
              } catch (error) {
                console.error(`Failed to process bill:`, error);
              }
              await delay(DELAY_BETWEEN_REQUESTS);
            }

            offset += bills.length;

          } catch (error) {
            console.error(`Error fetching bill list for ${billType} at offset ${offset}:`, error);
            await delay(RETRY_DELAY);
            // Increment empty responses counter on error
            consecutiveEmptyResponses++;
          }
        }

        console.log(`\nCompleted processing ${billType.toUpperCase()} bills for Congress ${congress}`);
        console.log(`Last processed bill number: ${progress.lastProcessedBillNumber}`);
      }
      
      // After completing a Congress, retry failed bills for that Congress
      await retryFailedBills();
    }

    // Final summary with categorized errors
    console.log('\n🏁 Update process completed for all Congresses');
    console.log('----------------------------------------');
    console.log(`Total bills processed: ${progress.total}`);
    console.log(`✅ Successful updates: ${progress.success}`);
    console.log(`❌ Failed updates: ${progress.failed}`);
    console.log(`⏭️ Skipped updates: ${progress.skipped}`);
    
    if (progress.failedBills.length > 0) {
      console.log('\n❌ Failed Bills Summary:');
      console.log('----------------------------------------');
      
      // Group failures by error type
      const groupedFailures = progress.failedBills.reduce((acc, fail) => {
        acc[fail.errorType] = acc[fail.errorType] || [];
        acc[fail.errorType].push(fail);
        return acc;
      }, {} as Record<FailedBill['errorType'], FailedBill[]>);

      // Print grouped failures
      for (const [errorType, bills] of Object.entries(groupedFailures)) {
        console.log(`\n${errorType} (${bills.length} bills):`);
        bills.forEach(fail => {
          console.log(`  - Bill ${fail.id}:`);
          console.log(`    Error: ${fail.error}`);
          console.log(`    Time: ${fail.timestamp}`);
          console.log(`    Retry attempts: ${fail.retryCount}`);
        });
      }

      // Save detailed failure report
      const fs = require('fs');
      const failedBillsLog = `failed_bills_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      fs.writeFileSync(failedBillsLog, JSON.stringify({
        summary: {
          total: progress.total,
          success: progress.success,
          failed: progress.failed,
          skipped: progress.skipped,
          errorTypes: Object.fromEntries(
            Object.entries(groupedFailures).map(([type, bills]) => [type, bills.length])
          )
        },
        failedBills: progress.failedBills,
        lastProcessedCongress: progress.currentCongress,
        lastProcessedBillType: progress.currentBillType,
        lastProcessedBillNumber: progress.lastProcessedBillNumber
      }, null, 2));
      console.log(`\nDetailed failure report saved to: ${failedBillsLog}`);
    }

  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main(); 