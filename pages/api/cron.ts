import { NextApiRequest, NextApiResponse } from 'next';
import { syncBillsWithSummaries } from '../../scripts/sync-bills-with-summaries';
import { supabase } from '../../lib/supabase';

// API rate limit is 5,000 requests per hour
// Each bill requires: 1 list request + 1 detail request + (potentially) 1 summary request
// So we should limit to around 1,500 bills per hour to be safe
const SAFE_HOURLY_BILL_LIMIT = 1500;

async function getLastSyncTime(): Promise<Date | null> {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('last_updated')
      .order('last_updated', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? new Date(data[0].last_updated) : null;
  } catch (error: unknown) {
    console.error('Error getting last sync time:', error);
    return null;
  }
}

async function getBillsWithoutSummaries(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('id, congress_number, bill_type, bill_number')
      .is('summary', null)
      .order('last_updated', { ascending: true });

    if (error) throw error;
    return data?.map(bill => bill.id) || [];
  } catch (error: unknown) {
    console.error('Error getting bills without summaries:', error);
    return [];
  }
}

async function getTotalBillCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch (error: unknown) {
    console.error('Error getting total bill count:', error);
    return 0;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  try {
    // Verify authorization using SYNC_AUTH_TOKEN
    if (req.headers.authorization !== `Bearer ${process.env.SYNC_AUTH_TOKEN}`) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or missing authorization token'
      });
      return;
    }

    const totalBills = await getTotalBillCount();
    const lastSyncTime = await getLastSyncTime();
    const billsWithoutSummaries = await getBillsWithoutSummaries();

    console.log(`Current database status:
      - Total bills: ${totalBills}
      - Last sync: ${lastSyncTime?.toISOString() || 'never'}
      - Bills without summaries: ${billsWithoutSummaries.length}
    `);

    // If database is empty or has very few records, do initial population
    if (totalBills < 100) {
      console.log('Performing initial population...');
      await syncBillsWithSummaries({
        isHistorical: true,
        maxRecords: 2000,
        billTypes: ['hr', 's'] // Start with main bill types for initial population
      });
    } else {
      // Regular daily sync
      console.log('Performing daily sync...');
      
      // Sync recent updates
      await syncBillsWithSummaries({
        isHistorical: false,
        maxRecords: 100, // Limit daily sync to recent bills
        billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres']
      });

      // Try to fetch summaries for bills that don't have them
      // Limit to 50 per run to respect API limits
      if (billsWithoutSummaries.length > 0) {
        console.log(`Attempting to fetch summaries for ${Math.min(50, billsWithoutSummaries.length)} bills...`);
        await syncBillsWithSummaries({
          isHistorical: false,
          maxRecords: 50,
          billTypes: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'],
          onlyMissingSummaries: true,
          billIds: billsWithoutSummaries.slice(0, 50)
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Sync completed successfully',
      stats: {
        totalBills: await getTotalBillCount(),
        billsWithoutSummaries: (await getBillsWithoutSummaries()).length
      }
    });
  } catch (error: unknown) {
    console.error('Cron job failed:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 