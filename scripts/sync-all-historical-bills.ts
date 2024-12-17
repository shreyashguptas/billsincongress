import { CongressApiService } from '../lib/services/congress-api.js';
import { BillStorageService } from '../lib/services/bill-storage.js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

interface SyncConfig {
  startCongress: number;     // Which Congress to start from (e.g., 93 for 1973-1974)
  endCongress: number;       // Which Congress to end at (current)
  batchSize: number;         // Number of records per API call (max 250)
  delayBetweenBatches: number; // milliseconds to wait between API calls
  maxRetries: number;        // Maximum number of retries for failed requests
  retryDelay: number;        // Delay between retries in milliseconds
}

// Configuration for the sync process
const config: SyncConfig = {
  startCongress: 93,        // Start from 93rd Congress (1973-1974)
  endCongress: Math.floor((new Date().getFullYear() - 1789) / 2) + 1, // Current Congress
  batchSize: 250,           // Maximum allowed by the API
  delayBetweenBatches: 1000,// 1 second delay between batches
  maxRetries: 3,            // Number of times to retry failed requests
  retryDelay: 5000          // 5 seconds between retries
};

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to format number with commas
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function syncAllHistoricalBills() {
  try {
    // Verify environment variables are loaded
    console.log('Checking environment variables...');
    if (!process.env.CONGRESS_API_KEY) {
      throw new Error('Missing CONGRESS_API_KEY environment variable');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    console.log('Environment variables loaded successfully');

    const congressApi = new CongressApiService();
    const storage = new BillStorageService();

    // Bill types to fetch - prioritize major bill types first
    const billTypes = [
      'hr',   // House Bills (most common)
      's',    // Senate Bills (most common)
      'hjres', // House Joint Resolutions
      'sjres', // Senate Joint Resolutions
      'hconres', // House Concurrent Resolutions
      'sconres', // Senate Concurrent Resolutions
      'hres',    // House Simple Resolutions
      'sres'     // Senate Simple Resolutions
    ];

    console.log(`Starting complete historical sync...`);
    console.log(`Fetching bills from Congress ${config.startCongress} to ${config.endCongress}`);
    console.log(`This will attempt to fetch ALL available bills - this could take several hours or days`);
    
    let totalBillsFetched = 0;
    let congressStats: { [key: number]: number } = {};

    // Process each Congress from newest to oldest
    for (let congress = config.endCongress; congress >= config.startCongress; congress--) {
      console.log(`\nProcessing Congress #${congress}...`);
      let billsInThisCongress = 0;

      for (const billType of billTypes) {
        console.log(`\nProcessing ${billType.toUpperCase()} bills for Congress ${congress}`);
        let offset = 0;
        let hasMoreBills = true;

        while (hasMoreBills) {
          let retryCount = 0;
          let success = false;

          while (!success && retryCount < config.maxRetries) {
            try {
              console.log(`Fetching ${billType} bills from Congress ${congress}, offset: ${offset}`);
              
              // Fetch a batch of bills
              const bills = await congressApi.fetchBills(config.batchSize, congress);

              if (!bills || bills.length === 0) {
                console.log(`No more ${billType} bills available for Congress ${congress}`);
                hasMoreBills = false;
                break;
              }

              console.log(`Fetched ${bills.length} ${billType} bills`);

              // Store bills in Supabase
              await storage.storeBills(bills);
              console.log(`Stored ${bills.length} bills in database`);

              // Update counters
              totalBillsFetched += bills.length;
              billsInThisCongress += bills.length;
              offset += bills.length;

              // Check if we got a full batch
              hasMoreBills = bills.length === config.batchSize;

              // Add delay between batches
              await delay(config.delayBetweenBatches);

              // Progress update
              console.log(`Progress for ${billType} in Congress ${congress}: ${offset} bills fetched`);
              console.log(`Total bills fetched across all Congresses: ${formatNumber(totalBillsFetched)}`);

              success = true;
            } catch (error) {
              retryCount++;
              console.error(`Error processing ${billType} bills (attempt ${retryCount}/${config.maxRetries}):`, error);
              if (retryCount < config.maxRetries) {
                console.log(`Retrying in ${config.retryDelay/1000} seconds...`);
                await delay(config.retryDelay);
              } else {
                console.error(`Failed to process ${billType} bills after ${config.maxRetries} attempts. Moving to next batch.`);
                hasMoreBills = false;
                break;
              }
            }
          }
        }
      }

      // Store statistics for this Congress
      congressStats[congress] = billsInThisCongress;
      
      // Print summary for this Congress
      console.log(`\nCompleted Congress #${congress}`);
      console.log(`Bills fetched in this Congress: ${formatNumber(billsInThisCongress)}`);
      console.log(`Total bills fetched so far: ${formatNumber(totalBillsFetched)}`);
    }

    // Print final summary
    console.log('\n=== Final Summary ===');
    console.log(`Total bills fetched: ${formatNumber(totalBillsFetched)}`);
    console.log('\nBills per Congress:');
    Object.entries(congressStats)
      .sort(([a], [b]) => Number(b) - Number(a))
      .forEach(([congress, count]) => {
        console.log(`Congress ${congress}: ${formatNumber(count)} bills`);
      });

    process.exit(0);
  } catch (error) {
    console.error('Error in historical bill sync:', error);
    process.exit(1);
  }
}

// Run the sync
syncAllHistoricalBills(); 