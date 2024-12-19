import { NextApiRequest, NextApiResponse } from 'next';
import { syncBillsWithSummaries } from '../../scripts/sync-bills-with-summaries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify request method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed', message: 'Only GET requests are allowed' });
    }

    // Verify the cron secret
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set');
      return res.status(500).json({ 
        error: 'Server configuration error', 
        message: 'CRON_SECRET is not configured' 
      });
    }

    if (!authHeader) {
      console.error('No authorization header provided');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No authorization header provided' 
      });
    }

    const expectedAuth = `Bearer ${cronSecret}`;
    if (authHeader !== expectedAuth) {
      console.error('Invalid authorization header');
      console.error(`Expected format: "Bearer <secret>"`);
      console.error(`Received: "${authHeader}"`);
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid authorization header' 
      });
    }

    // Configure sync options for 2,000 records
    const syncOptions = {
      maxRecords: 2000,
      billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
      isHistorical: false
    };

    console.log('Starting cron job to sync bills with summaries...');
    console.log('Sync options:', JSON.stringify(syncOptions, null, 2));

    await syncBillsWithSummaries(syncOptions);

    console.log('Cron job completed successfully');
    return res.status(200).json({ 
      success: true, 
      message: 'Bills sync completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in cron job:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 