import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { getSupabaseConfig } from '../../lib/utils/supabase/config';
import { BillSummary, BillSummariesResponse, BILL_SUMMARIES_TABLE_NAME } from '../../lib/types/BillSummaries';

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
  newSummaries: number;
  failedBills: FailedBill[];
}

let progress: UpdateProgress = {
  total: 0,
  current: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  newSummaries: 0,
  failedBills: []
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
  const url = `${BASE_URL}/bill/${congress}/${billType}?offset=${offset}&limit=250&api_key=${CONGRESS_API_KEY}&format=json`;
  console.log(`Fetching bills from: ${url.replace(String(CONGRESS_API_KEY), 'XXXXX')}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill list: ${response.statusText}`);
  }
  
  return response.json();
}

// Function to fetch bill summaries
async function fetchBillSummaries(congress: number, billType: string, billNumber: string): Promise<BillSummariesResponse> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/summaries?api_key=${CONGRESS_API_KEY}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill summaries: ${response.statusText}`);
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

// Function to transform summaries data
function transformBillSummaries(data: BillSummariesResponse, billId: string): BillSummary[] {
  const uniqueSummaries = new Map<string, BillSummary>();
  const now = new Date().toISOString();

  data.summaries.forEach(summary => {
    if (!summary.versionCode) return; // Skip summaries without version code

    const key = `${billId}-${summary.versionCode}`;
    if (!uniqueSummaries.has(key)) {
      uniqueSummaries.set(key, {
        id: billId,
        action_date: summary.actionDate,
        action_desc: summary.actionDesc,
        text: summary.text,
        update_date: summary.updateDate,
        version_code: summary.versionCode,
        created_at: now,
        updated_at: now
      });
    }
  });

  return Array.from(uniqueSummaries.values());
}

// Function to verify summary was inserted
async function verifySummaryInsert(billId: string, summary: BillSummary): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(BILL_SUMMARIES_TABLE_NAME)
    .select('*')
    .eq('id', billId)
    .eq('version_code', summary.version_code);

  if (error) {
    console.error(`Failed to verify summary insert: ${error.message}`);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

// Function to process a single bill's summaries with retries
async function processBillSummaries(bill: any, congress: number, billType: string, retryCount: number = 0): Promise<void> {
  const billId = `${bill.number}${billType}${congress}`;
  
  try {
    // Fetch current summaries for this bill
    const { data: existingSummaries, error: fetchError } = await supabaseAdmin
      .from(BILL_SUMMARIES_TABLE_NAME)
      .select('version_code, update_date')
      .eq('id', billId);
    
    if (fetchError) {
      throw new Error(`Failed to fetch existing summaries: ${fetchError.message}`);
    }

    // Create a Map of existing summaries for quick lookup
    const existingSummaryMap = new Map(
      (existingSummaries || []).map(summary => [
        `${billId}-${summary.version_code}`,
        summary.update_date
      ])
    );

    // Fetch new summaries from API
    console.log(`Fetching summaries for bill ${billId}...`);
    const summariesData = await fetchBillSummaries(congress, billType, bill.number.toString());
    const transformedSummaries = transformBillSummaries(summariesData, billId);

    // Filter out summaries that haven't changed
    const newOrUpdatedSummaries = transformedSummaries.filter(summary => {
      const key = `${summary.id}-${summary.version_code}`;
      const existingUpdateDate = existingSummaryMap.get(key);
      return !existingUpdateDate || new Date(summary.update_date) > new Date(existingUpdateDate);
    });

    if (newOrUpdatedSummaries.length === 0) {
      console.log(`No new or updated summaries for bill ${billId}`);
      progress.skipped++;
      return;
    }

    let successfulInserts = 0;
    // Insert or update summaries
    for (const summary of newOrUpdatedSummaries) {
      try {
        const { error: upsertError } = await supabaseAdmin
          .from(BILL_SUMMARIES_TABLE_NAME)
          .upsert(summary, {
            onConflict: 'id,version_code'
          });

        if (upsertError) {
          console.error(`Failed to upsert summary for bill ${billId}:`, upsertError);
          continue;
        }

        // Verify the insert/update
        const verified = await verifySummaryInsert(billId, summary);
        if (!verified) {
          console.error(`Failed to verify summary insert for bill ${billId}`);
          continue;
        }

        successfulInserts++;
      } catch (error) {
        console.error(`Error upserting summary for bill ${billId}:`, error);
      }
    }

    if (successfulInserts > 0) {
      console.log(`Successfully processed ${successfulInserts} summaries for bill ${billId}`);
      progress.success++;
      progress.newSummaries += successfulInserts;
    } else {
      console.log(`No summaries were successfully processed for bill ${billId}`);
      throw new Error('Failed to process any summaries');
    }

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
      return processBillSummaries(bill, congress, billType, retryCount + 1);
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
      await processBillSummaries(bill, parseInt(congress), billType, failedBill.retryCount);
      await delay(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(`Failed to retry bill ${failedBill.id}`);
    }
  }
}

// Main function to process all bills
async function main() {
  try {
    console.log('🚀 Starting bill summaries update process...');
    
    // Test database connection
    const { error: testError } = await supabaseAdmin
      .from(BILL_SUMMARIES_TABLE_NAME)
      .select('id')
      .limit(1);
      
    if (testError) {
      throw new Error(`Database connection failed: ${testError.message}`);
    }

    const congress = 118; // Current congress
    
    for (const billType of BILL_TYPES) {
      console.log(`\nProcessing ${billType.toUpperCase()} bills...`);
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        try {
          const data = await fetchBillList(congress, billType, offset);
          const bills = data.bills || [];
          
          if (bills.length === 0) {
            console.log(`No more ${billType.toUpperCase()} bills to process`);
            hasMore = false;
            continue;
          }

          console.log(`Processing ${bills.length} bills...`);
          progress.total += bills.length;

          // Process bills sequentially to respect rate limits
          for (const bill of bills) {
            progress.current++;
            try {
              await processBillSummaries(bill, congress, billType);
            } catch (error) {
              console.error(`Failed to process bill:`, error);
            }
            await delay(DELAY_BETWEEN_REQUESTS);
          }

          offset += bills.length;
          if (bills.length < 250) {
            hasMore = false;
          }

        } catch (error) {
          console.error(`Error fetching bill list for ${billType} at offset ${offset}:`, error);
          await delay(RETRY_DELAY);
          hasMore = false;
        }
      }
    }

    // After processing all bill types, retry failed bills
    await retryFailedBills();

    // Final summary with categorized errors
    console.log('\n🏁 Update process completed');
    console.log('----------------------------------------');
    console.log(`Total bills processed: ${progress.total}`);
    console.log(`✅ Successful updates: ${progress.success}`);
    console.log(`❌ Failed updates: ${progress.failed}`);
    console.log(`⏭️ Skipped updates: ${progress.skipped}`);
    console.log(`📝 New summaries added: ${progress.newSummaries}`);
    
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
      const failedBillsLog = `failed_bills_summaries_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      fs.writeFileSync(failedBillsLog, JSON.stringify({
        summary: {
          total: progress.total,
          success: progress.success,
          failed: progress.failed,
          skipped: progress.skipped,
          newSummaries: progress.newSummaries,
          errorTypes: Object.fromEntries(
            Object.entries(groupedFailures).map(([type, bills]) => [type, bills.length])
          )
        },
        failedBills: progress.failedBills
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