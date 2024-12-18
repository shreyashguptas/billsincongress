import { syncBillsWithSummaries } from './sync-bills-with-summaries';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ 
  path: resolve(process.cwd(), '.env.local'),
  override: true 
});

async function runDailySync() {
  const startTime = new Date();
  console.log(`Starting daily bills and summaries sync at ${startTime.toISOString()}`);
  
  try {
    await syncBillsWithSummaries({
      isHistorical: false,
      billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres']
    });
    
    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`Daily sync completed successfully at ${endTime.toISOString()}`);
    console.log(`Total duration: ${duration} seconds`);
  } catch (error) {
    console.error('Daily sync failed:', error);
    throw error;
  }
}

// Export for use in different contexts
export { runDailySync };

// Allow direct execution
if (require.main === module) {
  runDailySync()
    .then(() => {
      console.log('Scheduled sync completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Scheduled sync failed:', error);
      process.exit(1);
    });
} 