import { CongressApiService } from '../lib/services/congress-api.js';
import { BillStorageService } from '../lib/services/bill-storage.js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
const envResult = dotenv.config({ 
  path: resolve(process.cwd(), '.env.local'),
  override: true 
});

if (envResult.error) {
  console.error('Error loading .env.local file:', envResult.error);
  process.exit(1);
}

// Verify environment variables
const requiredEnvVars = {
  'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  'CONGRESS_API_KEY': process.env.CONGRESS_API_KEY,
  'SYNC_AUTH_TOKEN': process.env.SYNC_AUTH_TOKEN
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:');
  Object.entries(requiredEnvVars).forEach(([key, value]) => {
    console.error(`${key}: ${value ? '✓' : '✗'}`);
  });
  process.exit(1);
}

interface SyncConfig {
  totalRecordsToFetch: number;
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
}

// Configuration for the sync process
const config: SyncConfig = {
  totalRecordsToFetch: 3000,
  batchSize: 250,
  delayBetweenBatches: 1000,
  maxRetries: 3,
  retryDelay: 5000
};

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(
  operation: () => Promise<T>,
  retries: number = config.maxRetries,
  delayMs: number = config.retryDelay
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.log(`Operation failed, retrying... (${retries} attempts remaining)`);
      await delay(delayMs);
      return retryOperation(operation, retries - 1, delayMs);
    }
    throw error;
  }
}

async function historicalSyncBills() {
  try {
    console.log('Starting historical bill sync...');
    const congressApi = new CongressApiService();
    const storage = new BillStorageService();

    // Get the current Congress number
    const currentCongress = Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
    let congress = currentCongress;
    let totalBillsFetched = 0;

    // Bill types to fetch
    const billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
    console.log('Will fetch the following bill types:', billTypes.join(', ').toUpperCase());

    while (totalBillsFetched < config.totalRecordsToFetch && congress > 0) {
      console.log(`\nProcessing Congress #${congress}...`);

      for (const billType of billTypes) {
        if (totalBillsFetched >= config.totalRecordsToFetch) break;

        let offset = 0;
        let hasMoreBills = true;

        while (hasMoreBills && totalBillsFetched < config.totalRecordsToFetch) {
          try {
            console.log(`\nFetching ${billType.toUpperCase()} bills from Congress ${congress}, offset: ${offset}`);
            
            const bills = await retryOperation(async () => {
              const fetchedBills = await congressApi.fetchBills(config.batchSize, congress, billType, offset);
              console.log(`Fetched ${fetchedBills.length} ${billType.toUpperCase()} bills`);
              return fetchedBills;
            });

            if (!bills || bills.length === 0) {
              console.log(`No more ${billType.toUpperCase()} bills available for Congress ${congress}`);
              hasMoreBills = false;
              break;
            }

            await retryOperation(async () => {
              await storage.storeBills(bills);
              console.log(`Stored ${bills.length} bills in database`);
            });

            totalBillsFetched += bills.length;
            offset += bills.length;
            hasMoreBills = bills.length === config.batchSize;

            console.log(`Progress: ${totalBillsFetched}/${config.totalRecordsToFetch} bills fetched`);
            
            // Add a delay between batches to avoid rate limiting
            await delay(config.delayBetweenBatches);

          } catch (error) {
            console.error(`Error processing ${billType.toUpperCase()} bills:`, error);
            await delay(config.retryDelay);
          }
        }
      }

      congress--;
    }

    console.log('\nHistorical bill sync completed successfully');
    console.log(`Total bills fetched and stored: ${totalBillsFetched}`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error in historical bill sync:', error);
    process.exit(1);
  }
}

// Run the historical sync
historicalSyncBills(); 