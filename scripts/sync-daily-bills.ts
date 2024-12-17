import { CongressApiService } from '../lib/services/congress-api';
import { BillStorageService } from '../lib/services/bill-storage';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

interface SyncConfig {
  requestsPerHour: number;
  batchSize: number;
  delayBetweenBatches: number; // in milliseconds
}

const config: SyncConfig = {
  requestsPerHour: 4500, // Keep some buffer from the 5000 limit
  batchSize: 250, // Maximum allowed by the API
  delayBetweenBatches: 1000, // 1 second delay between batches
};

// Helper function to format date for API
function formatDateForAPI(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

// Helper function to get yesterday's date
function getYesterdayDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Helper function to get today's date
function getTodayDate(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function dailySyncBills() {
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

    // Get yesterday's date range
    const fromDateTime = formatDateForAPI(getYesterdayDate());
    const toDateTime = formatDateForAPI(getTodayDate());

    console.log(`Fetching bills updated between ${fromDateTime} and ${toDateTime}`);

    // Get the current Congress number
    const currentCongress = Math.floor((new Date().getFullYear() - 1789) / 2) + 1;

    // Bill types to fetch
    const billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
    let totalBillsUpdated = 0;

    for (const billType of billTypes) {
      let offset = 0;
      let hasMoreBills = true;

      while (hasMoreBills) {
        try {
          console.log(`Fetching ${billType} bills, offset: ${offset}`);
          
          // Fetch a batch of bills
          const bills = await congressApi.fetchBillsBatch(currentCongress, billType, {
            offset,
            limit: config.batchSize,
            fromDateTime,
            toDateTime
          });

          if (!bills || bills.length === 0) {
            hasMoreBills = false;
            console.log(`No more ${billType} bills to update`);
            continue;
          }

          console.log(`Fetched ${bills.length} ${billType} bills`);

          // Store bills in Supabase
          await storage.storeBills(bills);
          console.log(`Updated ${bills.length} bills in database`);

          totalBillsUpdated += bills.length;

          // Update offset and check if we have more bills
          offset += bills.length;
          hasMoreBills = bills.length === config.batchSize;

          // Add delay between batches to prevent overwhelming the API
          await delay(config.delayBetweenBatches);

        } catch (error) {
          console.error(`Error processing ${billType} bills:`, error);
          // If we hit an error, wait for a bit and try again
          await delay(5000);
        }
      }
    }

    console.log(`Daily bill sync completed successfully. Updated ${totalBillsUpdated} bills.`);
    process.exit(0);
  } catch (error) {
    console.error('Error in daily bill sync:', error);
    process.exit(1);
  }
}

// Run the daily sync
dailySyncBills(); 