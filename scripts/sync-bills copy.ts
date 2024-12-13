// This codes gets the 20 latest bills from the Congress API and stores them in Supabase

// import { CongressApiService } from '../lib/services/congress-api';
// import { BillStorageService } from '../lib/services/bill-storage';
// import * as dotenv from 'dotenv';
// import { resolve } from 'path';

// // Load environment variables from .env.local
// dotenv.config({ path: resolve(__dirname, '../.env.local') });

// async function syncBills() {
//   try {
//     // Verify environment variables are loaded
//     console.log('Checking environment variables...');
//     if (!process.env.CONGRESS_API_KEY) {
//       throw new Error('Missing CONGRESS_API_KEY environment variable');
//     }
//     if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
//       throw new Error('Missing Supabase environment variables');
//     }
//     console.log('Environment variables loaded successfully');

//     console.log('Starting bill sync process...');
//     const congressApi = new CongressApiService();
//     const storage = new BillStorageService();

//     // Fetch bills from Congress API
//     console.log('Fetching bills from Congress API...');
//     const bills = await congressApi.fetchBills(20);
//     console.log(`Fetched ${bills.length} bills from Congress API`);
    
//     if (bills.length > 0) {
//       console.log('Sample bill:', JSON.stringify(bills[0], null, 2));
//     }

//     // Store bills in Supabase
//     console.log('Storing bills in Supabase...');
//     await storage.storeBills(bills);
//     console.log('Successfully stored bills in Supabase');

//     process.exit(0);
//   } catch (error) {
//     console.error('Error syncing bills:', error);
//     process.exit(1);
//   }
// }

// // Run the sync
// syncBills(); 