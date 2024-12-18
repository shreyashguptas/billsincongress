import { CongressApiService } from '../lib/services/congress-api';
import { BillStorageService } from '../lib/services/bill-storage';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ 
  path: resolve(process.cwd(), '.env.local'),
  override: true 
});

interface SyncOptions {
  isHistorical?: boolean;
  startCongress?: number;
  endCongress?: number;
  billTypes?: string[];
  maxRecords?: number;
}

async function getCurrentCongress(): Promise<number> {
  return Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
}

async function syncBillsWithSummaries(options: SyncOptions = {}) {
  const {
    isHistorical = false,
    billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
    maxRecords = 10000
  } = options;

  const congressApi = new CongressApiService();
  const storage = new BillStorageService();
  
  const BATCH_SIZE = 20;
  const currentCongress = await getCurrentCongress();
  
  // For historical sync, we'll go back several congresses
  // For daily sync, we'll just do the current congress
  const startCongress = options.startCongress || (isHistorical ? currentCongress - 2 : currentCongress);
  const endCongress = options.endCongress || currentCongress;
  
  console.log(`Starting ${isHistorical ? 'historical' : 'daily'} sync for Congresses ${startCongress} to ${endCongress}`);
  
  let totalRecordsFetched = 0;

  for (let congress = endCongress; congress >= startCongress && totalRecordsFetched < maxRecords; congress--) {
    for (const billType of billTypes) {
      let offset = 0;
      let hasMore = true;
      
      while (hasMore && totalRecordsFetched < maxRecords) {
        try {
          // Calculate remaining records to fetch
          const remainingRecords = maxRecords - totalRecordsFetched;
          const batchSize = Math.min(BATCH_SIZE, remainingRecords);
          
          // Fetch bills with summaries (rate limited internally)
          const bills = await congressApi.fetchBills(batchSize, congress, billType, offset);
          
          if (bills.length === 0) {
            console.log(`No more ${billType.toUpperCase()} bills found for Congress ${congress}`);
            hasMore = false;
            continue;
          }
          
          // Store bills with their summaries
          await storage.storeBills(bills);
          
          totalRecordsFetched += bills.length;
          console.log(`Processed ${bills.length} ${billType.toUpperCase()} bills from Congress ${congress}, offset ${offset}`);
          console.log(`Total records fetched: ${totalRecordsFetched}/${maxRecords}`);
          
          offset += batchSize;
          
          // Add delay between batches to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));

          if (totalRecordsFetched >= maxRecords) {
            console.log(`Reached maximum record limit of ${maxRecords}`);
            return;
          }
        } catch (error) {
          console.error(`Error processing batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${offset}`, error);
          // Continue with next batch even if one fails
          offset += BATCH_SIZE;
        }
      }
    }
  }
}

// Export for use in different contexts
export { syncBillsWithSummaries, getCurrentCongress };

// Allow direct execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    isHistorical: args.includes('--historical'),
    startCongress: args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1]) : undefined,
    endCongress: args.includes('--end') ? parseInt(args[args.indexOf('--end') + 1]) : undefined,
    billTypes: args.includes('--types') ? args[args.indexOf('--types') + 1].split(',') : undefined,
    maxRecords: args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1]) : 10000
  };

  syncBillsWithSummaries(options)
    .then(() => {
      console.log('Sync completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Sync failed:', error);
      process.exit(1);
    });
} 