import { NextApiRequest, NextApiResponse } from 'next';
import { syncBillsWithSummaries } from '../../scripts/sync-bills-with-summaries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify the cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Configure sync options for 2,000 records
    const syncOptions = {
      maxRecords: 2000, // Fetch 2,000 records
      billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
      isHistorical: false // Only fetch recent bills
    };

    console.log('Starting cron job to sync bills with summaries...');
    console.log('Sync options:', JSON.stringify(syncOptions, null, 2));

    await syncBillsWithSummaries(syncOptions);

    console.log('Cron job completed successfully');
    return res.status(200).json({ success: true, message: 'Bills sync completed' });
  } catch (error) {
    console.error('Error in cron job:', error);
    return res.status(500).json({ error: 'Internal server error', details: error });
  }
} 