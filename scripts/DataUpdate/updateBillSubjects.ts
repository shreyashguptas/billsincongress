import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { getSupabaseConfig } from '../../lib/utils/supabase/config';
import { BillSubjectsResponse, BILL_SUBJECTS_TABLE_NAME } from '../../lib/types/BillSubjects';

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
const CONGRESSES_TO_PROCESS = [119]; // Add more Congress numbers as needed
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

// Function to fetch bill subjects
async function fetchBillSubjects(congress: number, billType: string, billNumber: string): Promise<BillSubjectsResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/subjects?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill subjects: ${response.statusText}`);
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

// Function to verify subject was inserted/updated
async function verifySubjectUpdate(billId: string, policyAreaName: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(BILL_SUBJECTS_TABLE_NAME)
    .select('*')
    .eq('id', billId)
    .eq('policy_area_name', policyAreaName)
    .single();

  if (error) {
    console.error(`Failed to verify subject update: ${error.message}`);
    return false;
  }

  return !!data;
}

// Function to process a single bill's subjects with retries
async function processBillSubjects(bill: any, congress: number, billType: string, retryCount: number = 0): Promise<void> {
  const billId = `${bill.number}${billType}${congress}`;
  
  try {
    // Fetch current subject for this bill
    const { data: existingSubject, error: fetchError } = await supabaseAdmin
      .from(BILL_SUBJECTS_TABLE_NAME)
      .select('policy_area_name, policy_area_update_date')
      .eq('id', billId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" error
      throw new Error(`Failed to fetch existing subject: ${fetchError.message}`);
    }

    // Fetch new subjects from API
    console.log(`Fetching subjects for bill ${billId}...`);
    const subjectsData = await fetchBillSubjects(congress, billType, bill.number.toString());
    
    // Skip if no policy area is available
    if (!subjectsData.subjects.policyArea?.name) {
      console.log(`No policy area found for bill ${billId}`);
      progress.skipped++;
      return;
    }

    const newPolicyArea = subjectsData.subjects.policyArea.name;
    const newUpdateDate = subjectsData.subjects.policyArea.updateDate;

    // Skip if data hasn't changed
    if (existingSubject && 
        existingSubject.policy_area_name === newPolicyArea && 
        existingSubject.policy_area_update_date >= newUpdateDate) {
      console.log(`No updates needed for bill ${billId}`);
      progress.skipped++;
      return;
    }

    // Update or insert the subject
    const { error: upsertError } = await supabaseAdmin
      .from(BILL_SUBJECTS_TABLE_NAME)
      .upsert({
        id: billId,
        policy_area_name: newPolicyArea,
        policy_area_update_date: newUpdateDate,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (upsertError) {
      throw new Error(`Failed to upsert subject: ${upsertError.message}`);
    }

    // Verify the update
    const verified = await verifySubjectUpdate(billId, newPolicyArea);
    if (!verified) {
      throw new Error('Failed to verify subject update');
    }

    console.log(`Successfully ${existingSubject ? 'updated' : 'inserted'} subject for bill ${billId}`);
    progress.success++;

    // If this was a retry and it succeeded, remove from failed bills
    progress.failedBills = progress.failedBills.filter(fb => fb.id !== billId);

  } catch (error: any) {
    const { type, message } = categorizeError(error);
    console.error(`Error processing bill ${billId} (${type}):`, message);
    
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
      const backoffDelay = RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`Retrying bill ${billId} in ${backoffDelay/1000} seconds... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await delay(backoffDelay);
      return processBillSubjects(bill, congress, billType, retryCount + 1);
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
        congress: parseInt(congress)
      };
      
      console.log(`\nRetrying failed bill ${failedBill.id} (previous error: ${failedBill.errorType})`);
      await processBillSubjects(bill, parseInt(congress), billType, failedBill.retryCount);
      await delay(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(`Failed to retry bill ${failedBill.id}`);
    }
  }
}

// Main function to process all bills
async function main() {
  try {
    console.log('🚀 Starting bill subjects update process...');
    
    // Test database connection
    const { error: testError } = await supabaseAdmin
      .from(BILL_SUBJECTS_TABLE_NAME)
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
                await processBillSubjects(bill, congress, billType);
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
      const failedBillsLog = `failed_bills_subjects_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
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