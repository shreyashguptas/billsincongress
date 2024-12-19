import { NextApiRequest, NextApiResponse } from 'next';
import { syncBillsWithSummaries } from '../../scripts/sync-bills-with-summaries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify request method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed', message: 'Only GET requests are allowed' });
    }

    // Verify that the request is coming from Vercel Cron
    if (process.env.VERCEL_ENV === 'production' && req.headers['x-vercel-cron'] !== 'true') {
      console.error('Unauthorized: Not a Vercel Cron request');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'This endpoint can only be called by Vercel Cron' 
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