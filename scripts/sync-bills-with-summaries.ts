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
  batchSize?: number;
  fromDateTime?: string;
  toDateTime?: string;
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

export async function syncBillsWithSummaries(options: SyncOptions = {}) {
  const {
    isHistorical = false,
    billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
    maxRecords = Number.MAX_SAFE_INTEGER,
    billIds = [],
    offset = 0,
    batchSize = 20,
    fromDateTime,
    toDateTime
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
        const bills = await congressApi.fetchBills(1, billInfo.congress, billInfo.type, 0, {
          fromDateTime,
          toDateTime
        });

        if (bills && bills.length > 0) {
          await storage.storeBills(bills);
          console.log(`✓ Successfully updated bill ${billId}`);
        } else {
          console.log(`✗ No updates found for bill ${billId}`);
        }
      } catch (error) {
        console.error(`Error processing bill ${billId}:`, error);
      }
    }
    
    console.log('\nFinished processing specific bills');
    return;
  }

  // Regular sync logic for when no specific bills are provided
  const currentCongress = await getCurrentCongress();
  const startCongress = options.startCongress || (isHistorical ? currentCongress - 2 : currentCongress);
  const endCongress = options.endCongress || currentCongress;
  let totalRecordsFetched = 0;

  const syncType = isHistorical ? 'historical' : (fromDateTime ? 'daily' : 'full');
  console.log(`Starting ${syncType} sync for Congresses ${startCongress} to ${endCongress}`);
  
  if (fromDateTime) {
    console.log(`Fetching bills updated between ${fromDateTime} and ${toDateTime || 'now'}`);
  }
  
  for (let congress = endCongress; congress >= startCongress; congress--) {
    for (const billType of billTypes) {
      let currentOffset = offset;
      let hasMoreRecords = true;

      while (hasMoreRecords) {
        console.log(`\nFetching batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${currentOffset}, size ${batchSize}`);
        console.log(`Progress: ${totalRecordsFetched} records fetched`);

        try {
          const bills = await congressApi.fetchBills(batchSize, congress, billType, currentOffset, {
            fromDateTime,
            toDateTime
          });

          if (!bills || bills.length === 0) {
            console.log(`No more ${billType.toUpperCase()} bills found for Congress ${congress}`);
            hasMoreRecords = false;
            break;
          }

          await storage.storeBills(bills);
          totalRecordsFetched += bills.length;
          currentOffset += batchSize;

          console.log(`Successfully stored ${bills.length} bills`);
          console.log(`Total progress: ${totalRecordsFetched} records`);

          // If this is a daily sync (has fromDateTime), continue until no more records
          // For historical sync, respect the maxRecords limit
          if (!fromDateTime && totalRecordsFetched >= maxRecords) {
            console.log(`Reached target of ${maxRecords} records. Stopping sync.`);
            return;
          }

          // If we got fewer records than the batch size, we've reached the end
          if (bills.length < batchSize) {
            hasMoreRecords = false;
          }

        } catch (error) {
          console.error(`Error processing batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${currentOffset}`, error);
          throw error;
        }
      }
    }
  }

  console.log('\nSync completed successfully');
  console.log(`Total records fetched: ${totalRecordsFetched}`);
}

// Export for use in different contexts
export { getCurrentCongress };

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