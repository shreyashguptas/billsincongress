// import { CongressApiService } from '../lib/services/congress-api';
// import { BillStorageService } from '../lib/services/bill-storage';
// import * as dotenv from 'dotenv';
// import { resolve } from 'path';

// // Load environment variables from .env.local
// dotenv.config({ path: resolve(__dirname, '../.env.local') });

// interface SyncConfig {
//   requestsPerHour: number;
//   batchSize: number;
//   delayBetweenBatches: number; // in milliseconds
// }

// const config: SyncConfig = {
//   requestsPerHour: 4500, // Keep some buffer from the 5000 limit
//   batchSize: 250, // Maximum allowed by the API
//   delayBetweenBatches: 1000, // 1 second delay between batches
// };

// class RateLimiter {
//   private requestCount: number = 0;
//   private resetInterval: NodeJS.Timeout;

//   constructor(private config: SyncConfig) {
//     this.resetInterval = setInterval(() => {
//       console.log('Resetting hourly request count');
//       this.requestCount = 0;
//     }, 3600000); // Reset every hour
//   }

//   async checkRateLimit(): Promise<void> {
//     if (this.requestCount >= this.config.requestsPerHour) {
//       console.log('Approaching rate limit, waiting for next hour window...');
//       await this.delay(3600000); // Wait for 1 hour
//       this.requestCount = 0;
//     }
//   }

//   incrementCount(): void {
//     this.requestCount++;
//   }

//   cleanup(): void {
//     if (this.resetInterval) {
//       clearInterval(this.resetInterval);
//     }
//   }

//   private delay(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
//   }
// }

// async function delay(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// function formatDateForAPI(date: Date): string {
//   // Format date as YYYY-MM-DDThh:mm:ssZ
//   return date.toISOString().split('.')[0] + 'Z';
// }

// async function historicalSyncBills() {
//   const rateLimiter = new RateLimiter(config);

//   try {
//     // Verify environment variables
//     console.log('Checking environment variables...');
//     if (!process.env.CONGRESS_API_KEY) {
//       throw new Error('Missing CONGRESS_API_KEY environment variable');
//     }
//     if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
//       throw new Error('Missing Supabase environment variables');
//     }
//     console.log('Environment variables loaded successfully');

//     const congressApi = new CongressApiService();
//     const storage = new BillStorageService();

//     // Calculate date range (1 year ago from now)
//     const endDate = new Date();
//     const startDate = new Date();
//     startDate.setFullYear(endDate.getFullYear() - 1);

//     // Format dates for API
//     const fromDateTime = formatDateForAPI(startDate);
//     const toDateTime = formatDateForAPI(endDate);

//     console.log(`Fetching bills from ${fromDateTime} to ${toDateTime}`);

//     // Get the current Congress number (roughly)
//     const currentCongress = Math.floor((endDate.getFullYear() - 1789) / 2) + 1;
//     const startCongress = Math.floor((startDate.getFullYear() - 1789) / 2) + 1;

//     // Bill types to fetch
//     const billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];

//     for (let congress = currentCongress; congress >= startCongress; congress--) {
//       console.log(`Processing Congress #${congress}`);

//       for (const billType of billTypes) {
//         let offset = 0;
//         let hasMoreBills = true;

//         while (hasMoreBills) {
//           // Check rate limit before making request
//           await rateLimiter.checkRateLimit();

//           try {
//             console.log(`Fetching ${billType} bills from Congress ${congress}, offset: ${offset}`);
            
//             // Fetch a batch of bills
//             const bills = await congressApi.fetchBillsBatch(congress, billType, {
//               offset,
//               limit: config.batchSize,
//               fromDateTime,
//               toDateTime
//             });

//             rateLimiter.incrementCount();

//             if (!bills || bills.length === 0) {
//               hasMoreBills = false;
//               console.log(`No more ${billType} bills for Congress ${congress}`);
//               continue;
//             }

//             console.log(`Fetched ${bills.length} ${billType} bills from Congress ${congress}`);

//             // Store bills in Supabase
//             await storage.storeBills(bills);
//             console.log(`Stored ${bills.length} bills in database`);

//             // Update offset and check if we have more bills
//             offset += bills.length;
//             hasMoreBills = bills.length === config.batchSize;

//             // Add delay between batches to prevent overwhelming the API
//             await delay(config.delayBetweenBatches);

//           } catch (error) {
//             console.error(`Error processing ${billType} bills for Congress ${congress}:`, error);
//             // If we hit an error, wait for a bit and try again
//             await delay(5000);
//           }
//         }
//       }
//     }

//     console.log('Historical bill sync completed successfully');
//     rateLimiter.cleanup();
//     process.exit(0);
//   } catch (error) {
//     console.error('Error in historical bill sync:', error);
//     rateLimiter.cleanup();
//     process.exit(1);
//   }
// }

// // Run the historical sync
// historicalSyncBills(); 