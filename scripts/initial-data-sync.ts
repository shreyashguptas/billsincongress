import { CongressApiService } from '../lib/services/congress-api';
import { BillStorageService } from '../lib/services/bill-storage';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ 
  path: resolve(process.cwd(), '.env.local'),
  override: true 
});

interface InitialSyncOptions {
  maxRecords?: number;
  billTypes?: string[];
  startCongress?: number;
  endCongress?: number;
  batchSize?: number;
}

async function getCurrentCongress(): Promise<number> {
  return Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
}

export async function initialDataSync(options: InitialSyncOptions = {}): Promise<void> {
  try {
    console.log('Starting initial data sync...');
    
    // Initialize services
    const congressApi = new CongressApiService();
    const storage = new BillStorageService();

    // Set default options
    const currentCongress = await getCurrentCongress();
    const defaultOptions = {
      maxRecords: 2000,
      billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
      startCongress: currentCongress,
      endCongress: currentCongress,
      batchSize: 20
    };

    const syncOptions = { ...defaultOptions, ...options };
    console.log('Sync options:', JSON.stringify(syncOptions, null, 2));

    let totalFetched = 0;
    const targetRecords = syncOptions.maxRecords;

    // Process each congress
    for (let congress = syncOptions.startCongress; congress <= syncOptions.endCongress; congress++) {
      console.log(`\nProcessing Congress ${congress}...`);

      // Process each bill type
      for (const billType of syncOptions.billTypes) {
        if (totalFetched >= targetRecords) {
          console.log(`Reached target of ${targetRecords} records. Stopping sync.`);
          return;
        }

        let offset = 0;
        let recordsForType = 0;
        const remainingRecords = targetRecords - totalFetched;

        while (recordsForType < remainingRecords) {
          const batchSize = Math.min(syncOptions.batchSize, remainingRecords - recordsForType);
          console.log(`\nFetching batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${offset}, size ${batchSize}`);
          console.log(`Progress: ${totalFetched}/${targetRecords} records fetched`);

          try {
            const bills = await congressApi.fetchBills(batchSize, congress, billType, offset);
            if (!bills || bills.length === 0) {
              console.log(`No more ${billType.toUpperCase()} bills found for Congress ${congress}`);
              break;
            }

            await storage.storeBills(bills);
            
            recordsForType += bills.length;
            totalFetched += bills.length;
            offset += batchSize;

            console.log(`Successfully stored ${bills.length} bills`);
            console.log(`Total progress: ${totalFetched}/${targetRecords} records`);

          } catch (error) {
            console.error(`Error processing batch: Congress ${congress}, ${billType.toUpperCase()}, offset ${offset}`, error);
            throw error;
          }
        }
      }
    }

    console.log('\nInitial data sync completed successfully');
    console.log(`Total records fetched: ${totalFetched}`);
  } catch (error) {
    console.error('Error in initial data sync:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  initialDataSync()
    .then(() => {
      console.log('Initial data sync completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error running initial data sync:', error);
      process.exit(1);
    });
} 