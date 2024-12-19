import { NextApiRequest, NextApiResponse } from 'next';
import { syncBillsWithSummaries } from '../../scripts/sync-bills-with-summaries';

// Set a reasonable timeout for the sync process
const SYNC_TIMEOUT = 300000; // 5 minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify request method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed', message: 'Only GET requests are allowed' });
    }

    // Check if it's a Vercel cron request
    const isVercelRequest = req.headers['user-agent']?.includes('vercel-cron');
    
    if (!isVercelRequest) {
      // If not a Vercel cron request, check for manual authorization
      const authHeader = req.headers.authorization;
      const syncAuthToken = process.env.SYNC_AUTH_TOKEN;

      if (!authHeader || authHeader !== `Bearer ${syncAuthToken}`) {
        console.error('Unauthorized manual request');
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid authorization token for manual request' 
        });
      }
    }

    // Verify required environment variables
    if (!process.env.CONGRESS_API_KEY) {
      throw new Error('CONGRESS_API_KEY environment variable is not set');
    }

    // Configure sync options for 2,000 records
    const syncOptions = {
      maxRecords: 2000,
      billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
      isHistorical: false,
      batchSize: 20
    };

    console.log('Starting bills sync...');
    console.log(`Trigger type: ${isVercelRequest ? 'Vercel Cron' : 'Manual'}`);
    console.log('Sync options:', JSON.stringify(syncOptions, null, 2));

    // Set up a timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Sync operation timed out')), SYNC_TIMEOUT);
    });

    // Run the sync with a timeout
    const syncPromise = syncBillsWithSummaries(syncOptions);
    await Promise.race([syncPromise, timeoutPromise]);

    console.log('Sync completed successfully');
    return res.status(200).json({ 
      success: true, 
      message: 'Bills sync completed',
      trigger: isVercelRequest ? 'vercel-cron' : 'manual',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Detailed error in sync process:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    // If it's a timeout, return a specific status code
    if (error instanceof Error && error.message === 'Sync operation timed out') {
      return res.status(504).json({
        error: 'Gateway Timeout',
        message: 'The sync operation timed out. The process will continue in the background.',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 