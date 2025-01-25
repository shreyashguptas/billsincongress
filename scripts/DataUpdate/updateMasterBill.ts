import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { BillInfo, BillInfoResponse, BILL_INFO_TABLE_NAME } from '../../lib/types/BillInfo';
import { BillAction, BillActionsResponse, BILL_ACTIONS_TABLE_NAME } from '../../lib/types/BillActions';
import { BillText, BillTextResponse, BILL_TEXT_TABLE_NAME } from '../../lib/types/BillText';
import { BillTitle, BillTitlesResponse, BILL_TITLES_TABLE_NAME } from '../../lib/types/BillTitles';
import { BillSummary, BillSummariesResponse, BILL_SUMMARIES_TABLE_NAME } from '../../lib/types/BillSummaries';
import { BillSubject, BillSubjectsResponse, BILL_SUBJECTS_TABLE_NAME } from '../../lib/types/BillSubjects';
import { BILL_TYPES } from '../../lib/constants/filters';

// Load environment variables from both .env and .env.local files
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Configuration
// Add or remove congress numbers here to specify which ones to fetch
const CONGRESSES_TO_UPDATE: number[] = [
  119,
  118,
  // 117,
];

// Constants
const BASE_URL = 'https://api.congress.gov/v3';
const RATE_LIMIT_PER_HOUR = 1000; // Reduced from 5000 to be more conservative
const DELAY_BETWEEN_REQUESTS = Math.ceil(3600000 / RATE_LIMIT_PER_HOUR); // Milliseconds between requests
const BURST_SIZE = 5; // Reduced from 10 to be more conservative
const BURST_WINDOW = 2000; // Increased from 1000 to give more breathing room
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 5000; // Increased from 2000 to give more time between retries
const MAX_RETRY_DELAY = 60000; // Increased from 30000 to allow longer waits
const MAX_BILL_NUMBER = 100000;
const CONSECUTIVE_MISSING_THRESHOLD = 50; // Number of consecutive missing bills before stopping
const GAP_TOLERANCE = 20; // Number of missing bills we'll tolerate before resetting the counter

// Validate environment variables
const requiredEnvVars = {
  'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_KEY, // Changed from SUPABASE_SERVICE_ROLE_KEY to match .env.local
  'CONGRESS_API_KEY': process.env.CONGRESS_API_KEY
};

const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  console.error('Error: Missing required environment variables:');
  console.error(missingEnvVars.join(', '));
  console.error('\nPlease ensure these variables are set in your .env.local file at the project root.');
  process.exit(1);
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!; // Changed to match .env.local
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// Enhanced Rate limiter class to manage API requests
class RateLimiter {
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private burstCount: number = 0;
  private burstStartTime: number = 0;
  public waitingForReset: boolean = false;

  async waitForNextRequest(): Promise<void> {
    const now = Date.now();

    // Reset burst counter if burst window has passed
    if (now - this.burstStartTime > BURST_WINDOW) {
      this.burstCount = 0;
      this.burstStartTime = now;
    }

    // If we're waiting for a rate limit reset
    if (this.waitingForReset) {
      console.log('Rate limit reached, waiting for reset...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
      this.waitingForReset = false;
      this.requestCount = 0;
      this.burstCount = 0;
      return;
    }

    // Check burst limit
    if (this.burstCount >= BURST_SIZE) {
      const timeToWait = BURST_WINDOW - (now - this.burstStartTime);
      if (timeToWait > 0) {
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }
      this.burstCount = 0;
      this.burstStartTime = Date.now();
    }

    // Check hourly limit
    this.requestCount++;
    if (this.requestCount >= RATE_LIMIT_PER_HOUR) {
      this.waitingForReset = true;
      return this.waitForNextRequest();
    }

    // Normal delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < DELAY_BETWEEN_REQUESTS) {
      await new Promise(resolve => 
        setTimeout(resolve, DELAY_BETWEEN_REQUESTS - timeSinceLastRequest)
      );
    }

    this.burstCount++;
    this.lastRequestTime = Date.now();
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  resetCounters() {
    this.requestCount = 0;
    this.burstCount = 0;
    this.waitingForReset = false;
  }
}

// Error tracking interfaces
interface FailedBill {
  id: string;
  error: string;
  retryCount: number;
  timestamp: string;
  errorType: ErrorType;
}

type ErrorType = 'API_ERROR' | 'NETWORK_ERROR' | 'RATE_LIMIT_ERROR' | 'DATABASE_ERROR' | 'UNKNOWN_ERROR';

interface UpdateProgress {
  totalBills: number;
  successfulBills: number;
  failedBills: FailedBill[];
  skippedBills: number;
  errorsByType: { [key in ErrorType]: number };
}

// API fetch function with rate limiting and retries
const rateLimiter = new RateLimiter();

// Enhanced API fetch function with better error handling and logging
async function fetchFromAPI(endpoint: string): Promise<any> {
  let retryCount = 0;
  let lastError: Error | null = null;

  // Ensure endpoint starts with a slash
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  while (retryCount < MAX_RETRIES) {
    try {
      await rateLimiter.waitForNextRequest();
      
      const url = `${BASE_URL}${formattedEndpoint}?api_key=${process.env.CONGRESS_API_KEY}&format=json`;
      console.log(`Fetching: ${formattedEndpoint.split('?')[0]}`); // Log the endpoint without API key
      
      const response = await fetch(url);
      
      // Handle rate limiting
      if (response.status === 429) {
        console.log(`Rate limit hit, attempt ${retryCount + 1}/${MAX_RETRIES}`);
        rateLimiter.waitingForReset = true;
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(
          RETRY_DELAY_BASE * Math.pow(2, retryCount),
          MAX_RETRY_DELAY
        );
        console.log(`Waiting ${waitTime/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }

      // Handle 404 (Not Found)
      if (response.status === 404) {
        return null;
      }

      // Handle 500 (Internal Server Error)
      if (response.status === 500) {
        console.log(`Server error (500) received, attempt ${retryCount + 1}/${MAX_RETRIES}`);
        const waitTime = Math.min(
          RETRY_DELAY_BASE * Math.pow(2, retryCount),
          MAX_RETRY_DELAY
        );
        console.log(`Waiting ${waitTime/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }

      // Handle other non-200 responses
      if (!response.ok) {
        const responseText = await response.text();
        console.error(`API Error Response:`, responseText);
        throw new Error(`API_ERROR: ${response.statusText} - ${responseText}`);
      }

      const data = await response.json();
      
      // Validate the response structure
      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error('API_ERROR: Empty or invalid response received');
      }

      return data;

    } catch (error: any) {
      lastError = error;
      
      // Don't retry 404s
      if (error.message.includes('404')) {
        return null;
      }

      // Log detailed error information
      console.error(`Error details for ${formattedEndpoint}:`, {
        message: error.message,
        retryCount: retryCount + 1,
        maxRetries: MAX_RETRIES
      });

      // Exponential backoff for retries
      const waitTime = Math.min(
        RETRY_DELAY_BASE * Math.pow(2, retryCount),
        MAX_RETRY_DELAY
      );
      
      console.log(`Request failed, waiting ${waitTime/1000} seconds before retry ${retryCount + 1}/${MAX_RETRIES}`);
      console.log(`Error: ${error.message}`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      retryCount++;
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError || new Error('MAX_RETRIES_EXCEEDED');
}

// Transform functions for each type of data
function transformBillInfo(bill: any): BillInfo {
  return {
    id: generateBillId(bill),
    congress: bill.congress,
    bill_type: bill.type.toLowerCase(),
    bill_number: bill.number,
    bill_type_label: getBillTypeLabel(bill.type),
    introduced_date: bill.introducedDate,
    title: bill.title,
    sponsor_first_name: bill.sponsors?.[0]?.firstName,
    sponsor_last_name: bill.sponsors?.[0]?.lastName,
    sponsor_party: bill.sponsors?.[0]?.party,
    sponsor_state: bill.sponsors?.[0]?.state
  };
}

function transformBillAction(action: any, billId: string): BillAction | null {
  // Validate required fields
  if (!action.sourceSystem?.code || !action.actionDate || !action.text || !action.type) {
    console.warn(`Skipping action for bill ${billId} due to missing required fields`);
    return null;
  }

  return {
    id: billId,
    action_code: action.actionCode || '',
    action_date: action.actionDate,
    source_system_code: action.sourceSystem.code,
    source_system_name: action.sourceSystem.name || 'Unknown',
    text: action.text,
    type: action.type,
    updated_at: new Date().toISOString()
  };
}

function transformBillText(textVersion: any, billId: string): BillText {
  const txtFormat = textVersion.formats.find((f: any) => f.type === 'Formatted Text');
  const pdfFormat = textVersion.formats.find((f: any) => f.type === 'PDF');
  
  return {
    id: billId,
    date: textVersion.date,
    formats_url_txt: txtFormat?.url || '',
    formats_url_pdf: pdfFormat?.url || '',
    type: textVersion.type
  };
}

function transformBillTitle(title: any, billId: string): BillTitle {
  return {
    id: billId,
    title: title.title,
    title_type: title.titleType,
    title_type_code: title.titleTypeCode,
    update_date: title.updateDate,
    bill_text_version_code: title.billTextVersionCode,
    bill_text_version_name: title.billTextVersionName,
    chamber_code: title.chamberCode,
    chamber_name: title.chamberName
  };
}

function transformBillSummary(summary: any, billId: string): BillSummary {
  return {
    id: billId,
    action_date: summary.actionDate,
    action_desc: summary.actionDesc,
    text: summary.text,
    update_date: summary.updateDate,
    version_code: summary.versionCode
  };
}

function transformBillSubject(subjectsData: any, billId: string): BillSubject | null {
  // Log the raw subject data to understand its structure
  console.debug('Raw subject data:', JSON.stringify(subjectsData, null, 2));

  // Extract policy area data from the full subjects response
  const policyArea = subjectsData?.subjects?.policyArea;
  if (!policyArea) {
    console.warn(`No policy area found for bill ${billId}`);
    return null;
  }

  return {
    id: billId,
    policy_area_name: policyArea.name,
    policy_area_update_date: policyArea.updateDate
  };
}

// Utility functions
function generateBillId(bill: any): string {
  return `${bill.number}${bill.type.toLowerCase()}${bill.congress}`;
}

function getBillTypeLabel(type: string): string {
  return BILL_TYPES[type.toLowerCase() as keyof typeof BILL_TYPES] || type;
}

// Database update functions with error handling
async function updateBillInfoInDB(billInfo: BillInfo): Promise<void> {
  const { error } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .upsert(billInfo, { onConflict: 'id' });
  
  if (error) throw new Error(`DATABASE_ERROR: ${error.message}`);
}

async function updateBillActionsInDB(actions: BillAction[]): Promise<void> {
  if (!actions.length) return;
  
  // Process actions in chunks to avoid conflicts
  const chunkSize = 50;
  for (let i = 0; i < actions.length; i += chunkSize) {
    const chunk = actions.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .upsert(chunk, { 
        onConflict: 'id,action_code,action_date',
        ignoreDuplicates: true
      });
    
    if (error) throw new Error(`DATABASE_ERROR: ${error.message}`);
  }
}

async function updateBillTextInDB(texts: BillText[]): Promise<void> {
  if (!texts.length) return;
  
  const chunkSize = 50;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from(BILL_TEXT_TABLE_NAME)
      .upsert(chunk, { 
        onConflict: 'id,date,type',
        ignoreDuplicates: true
      });
    
    if (error) throw new Error(`DATABASE_ERROR: ${error.message}`);
  }
}

async function updateBillTitlesInDB(titles: BillTitle[]): Promise<void> {
  if (!titles.length) return;
  
  const chunkSize = 50;
  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from(BILL_TITLES_TABLE_NAME)
      .upsert(chunk, { 
        onConflict: 'id,title_type_code,title',
        ignoreDuplicates: true
      });
    
    if (error) throw new Error(`DATABASE_ERROR: ${error.message}`);
  }
}

async function updateBillSummariesInDB(summaries: BillSummary[]): Promise<void> {
  if (!summaries.length) return;
  
  const chunkSize = 50;
  for (let i = 0; i < summaries.length; i += chunkSize) {
    const chunk = summaries.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from(BILL_SUMMARIES_TABLE_NAME)
      .upsert(chunk, { 
        onConflict: 'id,version_code',
        ignoreDuplicates: true
      });
    
    if (error) throw new Error(`DATABASE_ERROR: ${error.message}`);
  }
}

async function updateBillSubjectsInDB(subjects: BillSubject[]): Promise<void> {
  if (!subjects.length) return;
  
  const chunkSize = 50;
  for (let i = 0; i < subjects.length; i += chunkSize) {
    const chunk = subjects.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from(BILL_SUBJECTS_TABLE_NAME)
      .upsert(chunk, { 
        onConflict: 'id',
        ignoreDuplicates: true
      });
    
    if (error) throw new Error(`DATABASE_ERROR: ${error.message}`);
  }
}

// Main update function for a single bill
async function updateBill(congress: number, type: string, number: string): Promise<void> {
  const billId = `${number}${type}${congress}`;
  
  try {
    // First check if the bill exists
    console.log(`\nProcessing bill ${billId}...`);
    const billInfoData = await fetchFromAPI(`/bill/${congress}/${type}/${number}`);
    if (!billInfoData) {
      console.log(`Bill ${billId} does not exist or is not accessible`);
      return;
    }

    // Transform and update bill info first
    const billInfo = transformBillInfo(billInfoData.bill);
    await updateBillInfoInDB(billInfo);
    console.log(`Updated basic info for bill ${billId}`);

    // Add delay between different types of requests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch and update actions
    const actionsData = await fetchFromAPI(`/bill/${congress}/${type}/${number}/actions`);
    const actions = actionsData?.actions
      ?.map((a: any) => transformBillAction(a, billId))
      .filter((a: BillAction | null): a is BillAction => a !== null) || [];
    if (actions.length) {
      await updateBillActionsInDB(actions);
      console.log(`Updated ${actions.length} actions for bill ${billId}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch and update text versions
    const textData = await fetchFromAPI(`/bill/${congress}/${type}/${number}/text`);
    const texts = textData?.textVersions?.map((t: any) => transformBillText(t, billId)) || [];
    if (texts.length) {
      await updateBillTextInDB(texts);
      console.log(`Updated ${texts.length} text versions for bill ${billId}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch and update titles
    const titlesData = await fetchFromAPI(`/bill/${congress}/${type}/${number}/titles`);
    const titles = titlesData?.titles?.map((t: any) => transformBillTitle(t, billId)) || [];
    if (titles.length) {
      await updateBillTitlesInDB(titles);
      console.log(`Updated ${titles.length} titles for bill ${billId}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch and update summaries
    const summariesData = await fetchFromAPI(`/bill/${congress}/${type}/${number}/summaries`);
    const summaries = summariesData?.summaries?.map((s: any) => transformBillSummary(s, billId)) || [];
    if (summaries.length) {
      await updateBillSummariesInDB(summaries);
      console.log(`Updated ${summaries.length} summaries for bill ${billId}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch and update subjects last
    const subjectsData = await fetchFromAPI(`/bill/${congress}/${type}/${number}/subjects`);
    let subjects: BillSubject[] = [];
    try {
      if (subjectsData) {
        const subject = transformBillSubject(subjectsData, billId);
        if (subject) {
          subjects = [subject];
          await updateBillSubjectsInDB(subjects);
          console.log(`Updated subjects for bill ${billId}`);
        }
      }
    } catch (error) {
      console.error(`Error transforming subjects for bill ${billId}:`, error);
    }

    console.log(`\nCompleted processing bill ${billId}`);

  } catch (error: any) {
    if (error.message === 'Bill does not exist') {
      return;
    }
    throw new Error(`Failed to update bill ${billId}: ${error.message}`);
  }
}

// Main function to process all bills
async function updateAllBills(congress: number, options: {
  billTypes?: string[],
  startNumber?: number,
  endNumber?: number
} = {}): Promise<UpdateProgress> {
  const progress: UpdateProgress = {
    totalBills: 0,
    successfulBills: 0,
    failedBills: [],
    skippedBills: 0,
    errorsByType: {
      API_ERROR: 0,
      NETWORK_ERROR: 0,
      RATE_LIMIT_ERROR: 0,
      DATABASE_ERROR: 0,
      UNKNOWN_ERROR: 0
    }
  };

  const billTypes = options.billTypes || Object.keys(BILL_TYPES);
  const startNumber = options.startNumber || 1;
  const endNumber = options.endNumber || MAX_BILL_NUMBER;

  for (const type of billTypes) {
    let consecutiveMissingBills = 0;
    let lastFoundBill = 0;

    for (let number = startNumber; number <= endNumber; number++) {
      progress.totalBills++;
      
      try {
        // Check if bill exists first
        const billInfoData = await fetchFromAPI(`/bill/${congress}/${type}/${number}`);
        
        if (!billInfoData) {
          consecutiveMissingBills++;
          
          // If we've found bills before and hit our threshold, stop processing this bill type
          if (lastFoundBill > 0 && consecutiveMissingBills >= CONSECUTIVE_MISSING_THRESHOLD) {
            console.log(`\nStopping processing of ${type} bills for Congress ${congress}`);
            console.log(`No bills found after bill number ${lastFoundBill} for ${CONSECUTIVE_MISSING_THRESHOLD} consecutive attempts`);
            console.log(`Last successful bill: ${lastFoundBill}${type}${congress}\n`);
            break;
          }
          
          progress.skippedBills++;
          continue;
        }

        // If we found a bill, update our tracking
        consecutiveMissingBills = 0;
        lastFoundBill = number;

        // Process the bill
        await updateBill(congress, type, number.toString());
        progress.successfulBills++;
        console.log(`Successfully updated bill ${number}${type}${congress}`);
        
      } catch (error: any) {
        // If it's a "Bill does not exist" error, handle it like a missing bill
        if (error.message.includes('Bill does not exist')) {
          consecutiveMissingBills++;
          
          // If we've found bills before and hit our threshold, stop processing this bill type
          if (lastFoundBill > 0 && consecutiveMissingBills >= CONSECUTIVE_MISSING_THRESHOLD) {
            console.log(`\nStopping processing of ${type} bills for Congress ${congress}`);
            console.log(`No bills found after bill number ${lastFoundBill} for ${CONSECUTIVE_MISSING_THRESHOLD} consecutive attempts`);
            console.log(`Last successful bill: ${lastFoundBill}${type}${congress}\n`);
            break;
          }
          
          progress.skippedBills++;
          continue;
        }

        // Handle other errors as before
        const errorType = determineErrorType(error);
        const failedBill: FailedBill = {
          id: `${number}${type}${congress}`,
          error: error.message,
          retryCount: 0,
          timestamp: new Date().toISOString(),
          errorType
        };
        
        progress.failedBills.push(failedBill);
        progress.errorsByType[errorType]++;
        console.error(`Failed to update bill ${number}${type}${congress}:`, error.message);
      }
    }

    // Log summary for this bill type
    console.log(`\nCompleted processing ${type} bills for Congress ${congress}`);
    console.log(`Last successful bill number: ${lastFoundBill}`);
    console.log(`Total bills processed: ${progress.successfulBills}`);
    console.log(`Skipped bills: ${progress.skippedBills}\n`);
  }

  // Retry failed bills
  await retryFailedBills(progress);

  // Save progress report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    timestamp,
    congress,
    totalProcessed: progress.totalBills,
    successful: progress.successfulBills,
    failed: progress.failedBills.length,
    skipped: progress.skippedBills,
    errorsByType: progress.errorsByType,
    failedBills: progress.failedBills
  };

  await saveProgressReport(report);
  return progress;
}

// Main function to process multiple congresses
async function updateMultipleCongresses(congresses: number[]): Promise<void> {
  const startTime = Date.now();
  
  for (const congress of congresses) {
    const congressStartTime = Date.now();
    console.log(`\nStarting update for Congress ${congress}`);
    try {
      const progress = await updateAllBills(congress);
      const congressDuration = (Date.now() - congressStartTime) / 60000; // Convert to minutes
      
      console.log(`\nCompleted Congress ${congress}:`);
      console.log(`- Total bills processed: ${progress.totalBills}`);
      console.log(`- Successfully updated: ${progress.successfulBills}`);
      console.log(`- Failed: ${progress.failedBills.length}`);
      console.log(`- Skipped: ${progress.skippedBills}`);
      console.log(`- Time taken: ${congressDuration.toFixed(2)} minutes`);
      console.log('-----------------------------------');
    } catch (error) {
      console.error(`Failed to update Congress ${congress}:`, error);
    }
  }

  const totalDuration = (Date.now() - startTime) / 60000; // Convert to minutes
  console.log(`\n=== Total Execution Summary ===`);
  console.log(`Total time taken: ${totalDuration.toFixed(2)} minutes`);
  console.log(`Average time per Congress: ${(totalDuration / congresses.length).toFixed(2)} minutes`);
  console.log(`===========================\n`);
}

// Helper functions
function determineErrorType(error: Error): ErrorType {
  const message = error.message.toUpperCase();
  if (message.includes('RATE_LIMIT')) return 'RATE_LIMIT_ERROR';
  if (message.includes('API_ERROR')) return 'API_ERROR';
  if (message.includes('NETWORK')) return 'NETWORK_ERROR';
  if (message.includes('DATABASE_ERROR')) return 'DATABASE_ERROR';
  return 'UNKNOWN_ERROR';
}

async function retryFailedBills(progress: UpdateProgress): Promise<void> {
  const billsToRetry = progress.failedBills.filter(bill => bill.retryCount < MAX_RETRIES);
  
  for (const bill of billsToRetry) {
    try {
      const match = bill.id.match(/(\d+)([a-z]+)(\d+)/);
      if (!match) {
        console.error(`Invalid bill ID format: ${bill.id}`);
        continue;
      }
      
      const [, number, type, congress] = match;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_BASE * (bill.retryCount + 1)));
      await updateBill(parseInt(congress), type, number);
      
      // Remove from failed bills and update counts
      progress.failedBills = progress.failedBills.filter(b => b.id !== bill.id);
      progress.successfulBills++;
      progress.errorsByType[bill.errorType]--;
      
      console.log(`Successfully retried bill ${bill.id}`);
    } catch (error: any) {
      bill.retryCount++;
      bill.error = error.message;
      bill.timestamp = new Date().toISOString();
      console.error(`Retry failed for bill ${bill.id}:`, error.message);
    }
  }
}

async function saveProgressReport(report: any): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const filename = path.join(reportsDir, `update_report_${report.timestamp}.json`);
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
}

// Export both functions
export { updateAllBills, updateMultipleCongresses };

// Update the CLI interface
if (require.main === module) {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  let congressesToUpdate: number[];

  if (args.length === 0) {
    console.log('No congress numbers provided as arguments, using configured list:', CONGRESSES_TO_UPDATE);
    congressesToUpdate = CONGRESSES_TO_UPDATE;
  } else {
    congressesToUpdate = args.map(arg => parseInt(arg, 10));
    if (congressesToUpdate.some(isNaN)) {
      console.error('All arguments must be valid congress numbers');
      process.exit(1);
    }
  }

  if (congressesToUpdate.length === 0) {
    console.error('No congress numbers specified in CONGRESSES_TO_UPDATE or as arguments');
    process.exit(1);
  }

  updateMultipleCongresses(congressesToUpdate)
    .then(() => {
      const totalDuration = (Date.now() - startTime) / 60000;
      console.log(`\nScript completed successfully!`);
      console.log(`Total execution time: ${totalDuration.toFixed(2)} minutes`);
      process.exit(0);
    })
    .catch(error => {
      const totalDuration = (Date.now() - startTime) / 60000;
      console.error('Failed to update congresses:', error);
      console.log(`\nScript failed after running for ${totalDuration.toFixed(2)} minutes`);
      process.exit(1);
    });
} 