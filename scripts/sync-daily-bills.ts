import { CongressApiService } from '../lib/services/congress-api.js';
import { BillStorageService } from '../lib/services/bill-storage.js';
import { supabase } from '../lib/supabase.js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

interface SyncConfig {
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
}

const config: SyncConfig = {
  batchSize: 250,
  delayBetweenBatches: 1000,
  maxRetries: 3,
  retryDelay: 5000
};

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to format date for API
function formatDateForAPI(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

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

async function getLastUpdateDate(): Promise<Date> {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('update_date')
      .order('update_date', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0 && data[0].update_date) {
      return new Date(data[0].update_date);
    }
  } catch (error) {
    console.warn('Error getting last update date:', error);
  }

  // If no last update found, default to 2 days ago
  const date = new Date();
  date.setDate(date.getDate() - 2);
  return date;
}

async function dailySyncBills() {
  try {
    console.log('Starting daily bill sync...');
    
    // Verify environment variables
    if (!process.env.CONGRESS_API_KEY) {
      throw new Error('Missing CONGRESS_API_KEY environment variable');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase environment variables');
    }

    const congressApi = new CongressApiService();
    const storage = new BillStorageService();

    // Get the last update date from our database
    const lastUpdateDate = await getLastUpdateDate();
    console.log(`Fetching bills updated since: ${lastUpdateDate.toISOString()}`);

    // Get the current Congress number
    const currentCongress = Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
    let totalBillsUpdated = 0;

    // Bill types to fetch
    const billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
    console.log('Will fetch the following bill types:', billTypes.join(', ').toUpperCase());

    for (const billType of billTypes) {
      let offset = 0;
      let hasMoreBills = true;

      while (hasMoreBills) {
        try {
          console.log(`\nFetching ${billType.toUpperCase()} bills from Congress ${currentCongress}, offset: ${offset}`);
          
          const bills = await retryOperation(async () => {
            const fetchedBills = await congressApi.fetchBills(config.batchSize, currentCongress, billType, offset);
            console.log(`Fetched ${fetchedBills.length} ${billType.toUpperCase()} bills`);
            return fetchedBills;
          });

          if (!bills || bills.length === 0) {
            console.log(`No more ${billType.toUpperCase()} bills available`);
            hasMoreBills = false;
            break;
          }

          // Filter bills updated since last sync
          const recentBills = bills.filter(bill => {
            const updateDate = new Date(bill.updateDate);
            return updateDate > lastUpdateDate;
          });

          if (recentBills.length > 0) {
            await retryOperation(async () => {
              await storage.storeBills(recentBills);
              console.log(`Stored ${recentBills.length} updated bills in database`);
            });

            totalBillsUpdated += recentBills.length;
          }

          // If we got fewer bills than the batch size or no recent bills, we're done with this type
          if (bills.length < config.batchSize || recentBills.length === 0) {
            hasMoreBills = false;
          } else {
            offset += bills.length;
            await delay(config.delayBetweenBatches);
          }

        } catch (error) {
          console.error(`Error processing ${billType.toUpperCase()} bills:`, error);
          await delay(config.retryDelay);
        }
      }
    }

    console.log('\nDaily bill sync completed successfully');
    console.log(`Total bills updated: ${totalBillsUpdated}`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error in daily bill sync:', error);
    process.exit(1);
  }
}

// Run the daily sync
dailySyncBills(); 