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
  billIds?: string[];
  offset?: number;
}

async function getCurrentCongress(): Promise<number> {
  return Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
}

async function parseBillId(billId: string): Promise<{ congress: number; type: string; number: number } | null> {
  try {
    const [congress, type, number] = billId.split('-');
    return {
      congress: parseInt(congress),
      type: type.toLowerCase(),
      number: parseInt(number)
    };
  } catch (error) {
    console.error(`Invalid bill ID format: ${billId}`);
    return null;
  }
}

async function syncBillsWithSummaries(options: SyncOptions = {}) {
  const {
    isHistorical = false,
    billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
    maxRecords = 2000,
    billIds = [],
    offset = 0
  } = options;

  const congressApi = new CongressApiService();
  const storage = new BillStorageService();

  // Handle specific bill IDs first
  if (billIds && billIds.length > 0) {
    console.log(`\nFetching summaries for specific bills: ${billIds.join(', ')}`);
    
    for (const billId of billIds) {
      const billInfo = await parseBillId(billId);
      if (!billInfo) {
        console.error(`Invalid bill ID format: ${billId}`);
        continue;
      }

      console.log(`\nProcessing bill ${billId}...`);
      
      try {
        const summary = await congressApi.fetchBillSummary(
          billInfo.congress,
          billInfo.type,
          billInfo.number
        );

        if (summary) {
          await storage.updateBillSummary(billId, summary);
          console.log(`✓ Successfully updated summary for bill ${billId} (length: ${summary.length} characters)`);
        } else {
          console.log(`✗ No summary found for bill ${billId}`);
        }
      } catch (error) {
        console.error(`Error processing bill ${billId}:`, error);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\nFinished processing specific bills');
    return;
  }

  // Regular sync logic for when no specific bills are provided
  const BATCH_SIZE = 20;
  const currentCongress = await getCurrentCongress();
  const startCongress = options.startCongress || (isHistorical ? currentCongress - 2 : currentCongress);
  const endCongress = options.endCongress || currentCongress;
  let totalRecordsFetched = 0;

  console.log(`Starting ${isHistorical ? 'historical' : 'daily'} sync for Congresses ${startCongress} to ${endCongress}`);
  console.log(`Target: ${maxRecords} records total, processing in batches of ${BATCH_SIZE}`);
  
  for (let congress = endCongress; congress >= startCongress && totalRecordsFetched < maxRecords; congress--) {
    for (const billType of billTypes) {
      let currentOffset = offset;
      let hasMore = true;
      
      while (hasMore && totalRecordsFetched < maxRecords) {
        try {
          // Calculate remaining records to fetch
          const remainingRecords = maxRecords - totalRecordsFetched;
          const batchSize = Math.min(BATCH_SIZE, remainingRecords);
          
          console.log(`\nFetching batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${currentOffset}, size ${batchSize}`);
          console.log(`Progress: ${totalRecordsFetched}/${maxRecords} records fetched`);
          
          // Fetch bills with summaries (rate limited internally)
          const bills = await congressApi.fetchBills(batchSize, congress, billType, currentOffset);
          
          if (bills.length === 0) {
            console.log(`No more ${billType.toUpperCase()} bills found for Congress ${congress}`);
            hasMore = false;
            continue;
          }
          
          // Store bills with their summaries
          await storage.storeBills(bills);
          
          totalRecordsFetched += bills.length;
          console.log(`Processed ${bills.length} ${billType.toUpperCase()} bills from Congress ${congress}, offset ${currentOffset}`);
          console.log(`Total records fetched: ${totalRecordsFetched}/${maxRecords}`);
          
          currentOffset += batchSize;
          
          // Add delay between batches to respect rate limits
          // Each bill requires multiple API calls, so we need a longer delay
          await new Promise(resolve => setTimeout(resolve, 2000));

          if (totalRecordsFetched >= maxRecords) {
            console.log(`Reached maximum record limit of ${maxRecords}`);
            return;
          }
        } catch (error) {
          console.error(`Error processing batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${currentOffset}`, error);
          // Continue with next batch even if one fails
          currentOffset += BATCH_SIZE;
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
    maxRecords: args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1]) : 10,
    billIds: args.includes('--billIds') ? args[args.indexOf('--billIds') + 1].split(',') : [],
    offset: args.includes('--offset') ? parseInt(args[args.indexOf('--offset') + 1]) : 0
  };

  console.log('Running with options:', JSON.stringify(options, null, 2));

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