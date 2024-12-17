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
  totalRecordsToFetch: number; // Total number of records to fetch across all bill types
  batchSize: number;          // Number of records per API call (max 250)
  delayBetweenBatches: number; // milliseconds to wait between API calls
}

// Configuration for the sync process
// You can adjust these values based on your needs
const config: SyncConfig = {
  totalRecordsToFetch: 1000, // Change this number to fetch more or fewer records
  batchSize: 250,           // Maximum allowed by the API
  delayBetweenBatches: 1000 // 1 second delay between batches
};

// Helper function to format date for API
function formatDateForAPI(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function historicalSyncBills() {
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

    // Get the current Congress number
    const currentCongress = Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
    
    // Start with current Congress and work backwards if needed
    let congress = currentCongress;
    let totalBillsFetched = 0;

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

    console.log(`Starting historical sync...`);
    console.log(`Target: ${config.totalRecordsToFetch} total records`);
    console.log(`Starting with Congress #${congress}`);

    // Keep fetching until we reach our target or run out of bills
    while (totalBillsFetched < config.totalRecordsToFetch && congress > 0) {
      console.log(`Processing Congress #${congress}...`);

      for (const billType of billTypes) {
        if (totalBillsFetched >= config.totalRecordsToFetch) break;

        let offset = 0;
        let hasMoreBills = true;

        while (hasMoreBills && totalBillsFetched < config.totalRecordsToFetch) {
          try {
            console.log(`Fetching ${billType} bills from Congress ${congress}, offset: ${offset}`);
            
            // Calculate how many more records we need
            const remainingNeeded = config.totalRecordsToFetch - totalBillsFetched;
            const batchSize = Math.min(config.batchSize, remainingNeeded);
            
            // Fetch a batch of bills, sorted by update date descending
            const bills = await congressApi.fetchBills(batchSize, congress);

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
            offset += bills.length;

            // Check if we got a full batch
            hasMoreBills = bills.length === batchSize;

            // Add delay between batches
            await delay(config.delayBetweenBatches);

            // Progress update
            console.log(`Progress: ${totalBillsFetched}/${config.totalRecordsToFetch} total records fetched`);

          } catch (error) {
            console.error(`Error processing ${billType} bills:`, error);
            // If we hit an error, wait for a bit and try again
            await delay(5000);
            continue;
          }
        }
      }

      // Move to previous Congress if we still need more bills
      if (totalBillsFetched < config.totalRecordsToFetch) {
        congress--;
        console.log(`Moving to previous Congress #${congress}`);
      }
    }

    console.log(`Historical bill sync completed successfully`);
    console.log(`Total bills fetched: ${totalBillsFetched}`);
    console.log(`Covered Congress sessions from ${congress} to ${currentCongress}`);
    process.exit(0);
  } catch (error) {
    console.error('Error in historical bill sync:', error);
    process.exit(1);
  }
}

// Run the historical sync
historicalSyncBills(); 