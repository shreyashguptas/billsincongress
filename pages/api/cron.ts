import { NextApiRequest, NextApiResponse } from 'next';
import { syncBillsWithSummaries } from '../../scripts/sync-bills-with-summaries';

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

    // Configure sync options for 2,000 records
    const syncOptions = {
      maxRecords: 2000,
      billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
      isHistorical: false
    };

    console.log('Starting bills sync...');
    console.log(`Trigger type: ${isVercelRequest ? 'Vercel Cron' : 'Manual'}`);
    console.log('Sync options:', JSON.stringify(syncOptions, null, 2));

    await syncBillsWithSummaries(syncOptions);

    console.log('Sync completed successfully');
    return res.status(200).json({ 
      success: true, 
      message: 'Bills sync completed',
      trigger: isVercelRequest ? 'vercel-cron' : 'manual',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in sync process:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 