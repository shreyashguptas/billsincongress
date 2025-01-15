import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { getSupabaseConfig } from '../lib/utils/supabase/config';
import { BillInfo, BILL_INFO_TABLE_NAME } from '../lib/types/BillInfo';
import { BillAction, BILL_ACTIONS_TABLE_NAME } from '../lib/types/BillActions';
import { BillSummary, BILL_SUMMARIES_TABLE_NAME } from '../lib/types/BillSummaries';
import { BillText, BILL_TEXT_TABLE_NAME } from '../lib/types/BillText';
import { BillTitle, BILL_TITLES_TABLE_NAME } from '../lib/types/BillTitles';
import { BillSubject, BILL_SUBJECTS_TABLE_NAME } from '../lib/types/BillSubjects';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env.local'),
  override: true 
});

// Validate required environment variables
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
if (!CONGRESS_API_KEY) {
  console.error('Error: Missing CONGRESS_API_KEY environment variable');
  process.exit(1);
}

// Get Supabase config and create admin client
const { url } = getSupabaseConfig();
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!serviceKey) {
  console.error('Error: Missing SUPABASE_SERVICE_KEY environment variable');
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

const BASE_URL = 'https://api.congress.gov/v3';
const RATE_LIMIT_PER_HOUR = 5000;
const DELAY_BETWEEN_REQUESTS = Math.ceil((3600 * 1000) / RATE_LIMIT_PER_HOUR); // Milliseconds between requests
const MAX_RETRIES = 3;
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];

// Utility function to fetch bills that need updates
async function fetchBillsNeedingUpdates(congress: number): Promise<string[]> {
  const billsToUpdate: string[] = [];
  
  for (const billType of BILL_TYPES) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = `${BASE_URL}/bill/${congress}/${billType}?offset=${offset}&limit=250&api_key=${CONGRESS_API_KEY}&format=json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch bill list: ${response.statusText}`);
        
        const data = await response.json();
        const bills = data.bills || [];
        
        if (bills.length === 0) {
          hasMore = false;
          continue;
        }

        // Check each bill's update date against our database
        for (const bill of bills) {
          const billId = `${bill.number}${billType}${congress}`;
          const apiUpdateDate = new Date(bill.updateDate);
          
          const { data: existingBill } = await supabaseAdmin
            .from(BILL_INFO_TABLE_NAME)
            .select('update_date')
            .eq('id', billId)
            .single();

          if (!existingBill || new Date(existingBill.update_date) < apiUpdateDate) {
            billsToUpdate.push(billId);
          }
        }

        offset += bills.length;
        if (bills.length < 250) hasMore = false;
        
        // Respect rate limit
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      } catch (error) {
        console.error(`Error checking updates for ${billType} at offset ${offset}:`, error);
        // Wait longer on error before retrying
        await new Promise(resolve => setTimeout(resolve, 10000));
        hasMore = false;
      }
    }
  }

  return billsToUpdate;
}

// Update functions for each table type
async function updateBillInfo(congress: number, billType: string, billNumber: string): Promise<void> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill info: ${response.statusText}`);
  
  const data = await response.json();
  const bill = data.bill;
  const billId = `${billNumber}${billType}${congress}`;
  
  // Transform and upsert bill info
  const { error } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .upsert({
      id: billId,
      introduced_date: bill.introducedDate,
      sponsor_bioguide_id: bill.sponsor?.bioguideId,
      sponsor_district: bill.sponsor?.district,
      sponsor_first_name: bill.sponsor?.firstName,
      sponsor_last_name: bill.sponsor?.lastName,
      sponsor_party: bill.sponsor?.party,
      sponsor_state: bill.sponsor?.state,
      sponsor_is_by_request: bill.sponsor?.isByRequest ? 'Y' : 'N',
      update_date: bill.updateDate,
      update_date_including_text: bill.updateDateIncludingText,
      latest_action_code: bill.latestAction?.actionCode,
      latest_action_date: bill.latestAction?.actionDate,
      latest_action_text: bill.latestAction?.text,
      progress_stage: bill.progressStage,
      progress_description: bill.progressDescription
    }, {
      onConflict: 'id'
    });

  if (error) throw new Error(`Failed to update bill info: ${error.message}`);
}

async function updateBillSummaries(congress: number, billType: string, billNumber: string): Promise<void> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/summaries?api_key=${CONGRESS_API_KEY}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill summaries: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  // For each summary version
  for (const summary of data.summaries || []) {
    const { data: existingData } = await supabaseAdmin
      .from(BILL_SUMMARIES_TABLE_NAME)
      .select('update_date')
      .eq('id', billId)
      .eq('version_code', summary.versionCode)
      .single();

    // Only insert if it's a new version or has been updated
    if (!existingData || new Date(existingData.update_date) < new Date(summary.updateDate)) {
      const { error } = await supabaseAdmin
        .from(BILL_SUMMARIES_TABLE_NAME)
        .upsert({
          id: billId,
          version_code: summary.versionCode,
          version_name: summary.versionName,
          text: summary.text,
          action_date: summary.actionDate,
          action_desc: summary.actionDesc,
          update_date: summary.updateDate
        }, {
          onConflict: 'id,version_code'
        });

      if (error) throw new Error(`Failed to update bill summary: ${error.message}`);
    }
  }
}

async function updateBillActions(congress: number, billType: string, billNumber: string): Promise<void> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill actions: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  // For each action
  for (const action of data.actions || []) {
    const { data: existingData } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .select('updated_at')
      .eq('id', billId)
      .eq('action_date', action.actionDate)
      .eq('action_code', action.actionCode)
      .single();

    // Only insert if it's a new action or has been updated
    if (!existingData || new Date(existingData.updated_at) < new Date()) {
      const { error } = await supabaseAdmin
        .from(BILL_ACTIONS_TABLE_NAME)
        .upsert({
          id: billId,
          action_code: action.actionCode,
          action_date: action.actionDate,
          source_system_code: action.sourceSystem.code,
          source_system_name: action.sourceSystem.name,
          text: action.text,
          type: action.type,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id,action_date,action_code'
        });

      if (error) throw new Error(`Failed to update bill action: ${error.message}`);
    }
  }
}

async function updateBillText(congress: number, billType: string, billNumber: string): Promise<void> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/text?api_key=${CONGRESS_API_KEY}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill text: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  // For each text version
  for (const text of data.textVersions || []) {
    // Text versions are immutable, so only insert if not exists
    const { data: existingData } = await supabaseAdmin
      .from(BILL_TEXT_TABLE_NAME)
      .select('id')
      .eq('id', billId)
      .eq('date', text.date)
      .eq('type', text.type)
      .single();

    if (!existingData) {
      const { error } = await supabaseAdmin
        .from(BILL_TEXT_TABLE_NAME)
        .upsert({
          id: billId,
          date: text.date,
          type: text.type,
          format: text.formats?.[0]?.type || 'PDF',
          url: text.formats?.[0]?.url || '',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id,date,type'
        });

      if (error) throw new Error(`Failed to insert bill text: ${error.message}`);
    }
  }
}

async function updateBillTitles(congress: number, billType: string, billNumber: string): Promise<void> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/titles?api_key=${CONGRESS_API_KEY}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill titles: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  // For each title
  for (const title of data.titles || []) {
    const { data: existingData } = await supabaseAdmin
      .from(BILL_TITLES_TABLE_NAME)
      .select('update_date')
      .eq('id', billId)
      .eq('title_type_code', title.titleType)
      .eq('title', title.title)
      .single();

    // Only insert if it's a new title or has been updated
    if (!existingData || new Date(existingData.update_date) < new Date(title.updateDate)) {
      const { error } = await supabaseAdmin
        .from(BILL_TITLES_TABLE_NAME)
        .upsert({
          id: billId,
          title_type_code: title.titleType,
          title_type: title.type,
          title: title.title,
          chamber_code: title.chamber?.code,
          chamber_name: title.chamber?.name,
          update_date: title.updateDate
        }, {
          onConflict: 'id,title_type_code,title'
        });

      if (error) throw new Error(`Failed to update bill title: ${error.message}`);
    }
  }
}

async function updateBillSubjects(congress: number, billType: string, billNumber: string): Promise<void> {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/subjects?api_key=${CONGRESS_API_KEY}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill subjects: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  if (data.subjects?.policyArea) {
    const { error } = await supabaseAdmin
      .from(BILL_SUBJECTS_TABLE_NAME)
      .upsert({
        id: billId,
        policy_area_name: data.subjects.policyArea.name,
        policy_area_update_date: data.subjects.policyArea.updateDate
      }, {
        onConflict: 'id'
      });

    if (error) throw new Error(`Failed to update bill subjects: ${error.message}`);
  }
}

// Main update function
async function updateBill(billId: string): Promise<void> {
  const congress = parseInt(billId.slice(-3));
  const billType = billId.slice(-5, -3);
  const billNumber = billId.slice(0, -5);

  try {
    await updateBillInfo(congress, billType, billNumber);
    await updateBillSummaries(congress, billType, billNumber);
    await updateBillActions(congress, billType, billNumber);
    await updateBillText(congress, billType, billNumber);
    await updateBillTitles(congress, billType, billNumber);
    await updateBillSubjects(congress, billType, billNumber);
    
    console.log(`Successfully updated bill ${billId}`);
  } catch (error) {
    console.error(`Error updating bill ${billId}:`, error);
  }
}

// Main function that runs as cron job
async function main() {
  try {
    console.log('Starting bill update cron job...');
    const congress = 118; // Current congress
    
    // Get list of bills that need updates
    const billsToUpdate = await fetchBillsNeedingUpdates(congress);
    console.log(`Found ${billsToUpdate.length} bills that need updates`);
    
    // Update each bill
    for (const billId of billsToUpdate) {
      await updateBill(billId);
      // Respect rate limit
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
    
    console.log('Bill update cron job completed successfully');
  } catch (error) {
    console.error('Cron job failed:', error);
    process.exit(1);
  }
}

// Run the script
main(); 