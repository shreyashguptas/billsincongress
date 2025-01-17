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
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];

// Utility function to fetch bills that need updates
async function fetchBillsNeedingUpdates(congress: number): Promise<string[]> {
  console.log(`Starting to fetch bills for congress ${congress}...`);
  const billsToUpdate: string[] = [];
  
  for (const billType of BILL_TYPES) {
    console.log(`Checking bills of type: ${billType}`);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = `${BASE_URL}/bill/${congress}/${billType}?offset=${offset}&limit=250&api_key=${CONGRESS_API_KEY}&format=json`;
        console.log(`Fetching bills from: ${url.replace(CONGRESS_API_KEY as string, 'XXXXX')}`);
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`API Response not OK. Status: ${response.status}, Status Text: ${response.statusText}`);
          const errorText = await response.text();
          console.error(`Error response body: ${errorText}`);
          throw new Error(`Failed to fetch bill list: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.bills?.length || 0} bills in response`);
        const bills = data.bills || [];
        
        if (bills.length === 0) {
          console.log('No more bills found for this type');
          hasMore = false;
          continue;
        }

        // Check each bill's update date against our database
        for (const bill of bills) {
          const billId = `${bill.number}${billType}${congress}`;
          const apiUpdateDate = new Date(bill.updateDate);
          
          console.log(`Checking database for bill: ${billId}`);
          const { data: existingBill, error: dbError } = await supabaseAdmin
            .from(BILL_INFO_TABLE_NAME)
            .select('updated_at')
            .eq('id', billId)
            .single();

          if (dbError) {
            // PGRST116 means no rows found - this is expected for new bills
            if (dbError.code === 'PGRST116') {
              console.log(`Bill ${billId} not found in database - will be added`);
              billsToUpdate.push(billId);
            } else {
              console.error(`Database error for bill ${billId}:`, dbError);
            }
            continue;
          }

          if (!existingBill || new Date(existingBill.updated_at) < apiUpdateDate) {
            console.log(`Adding ${billId} to update list - needs update`);
            billsToUpdate.push(billId);
          }
        }

        offset += bills.length;
        if (bills.length < 250) {
          console.log(`Less than 250 bills received, ending pagination for ${billType}`);
          hasMore = false;
        }
        
        // Respect rate limit
        console.log(`Waiting ${DELAY_BETWEEN_REQUESTS}ms before next request...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      } catch (error) {
        console.error(`Error checking updates for ${billType} at offset ${offset}:`, error);
        console.log('Waiting 10 seconds before retrying...');
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
  console.log(`\nFetching bill info from: ${url.replace(CONGRESS_API_KEY as string, 'XXXXX')}`);
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill info: ${response.statusText}`);
  
  const data = await response.json();
  const bill = data.bill;
  const billId = `${billNumber}${billType}${congress}`;
  
  // Get existing bill info to compare changes
  const { data: existingBill, error: fetchError } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .select('*')
    .eq('id', billId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch existing bill info: ${fetchError.message}`);
  }
  
  // Get sponsor info - checking both sponsors array and sponsor object
  const sponsorInfo = bill.sponsors?.[0] || bill.sponsor;
  
  if (!sponsorInfo) {
    console.warn(`⚠️ No sponsor information found for bill ${billId}`);
  } else {
    console.log(`\nSponsor information for ${billId}:`);
    console.log(`  Name: ${sponsorInfo.firstName} ${sponsorInfo.lastName}`);
    console.log(`  Party: ${sponsorInfo.party}`);
    console.log(`  State: ${sponsorInfo.state}`);
  }
  
  // Transform and prepare bill info
  const billInfo = {
    id: billId,
    congress: congress,
    bill_type: billType,
    bill_number: billNumber,
    bill_type_label: bill.type,
    introduced_date: bill.introducedDate,
    title: bill.title || '',
    title_without_number: bill.title?.replace(/^(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+\s*-\s*/, '') || '',
    sponsor_first_name: sponsorInfo?.firstName || null,
    sponsor_last_name: sponsorInfo?.lastName || null,
    sponsor_party: sponsorInfo?.party || null,
    sponsor_state: sponsorInfo?.state || null,
    progress_stage: bill.progressStage,
    progress_description: bill.progressDescription,
    updated_at: new Date().toISOString()
  };

  // Log changes if updating existing record
  if (existingBill) {
    console.log(`\nUpdating existing bill ${billId}:`);
    const changes = Object.entries(billInfo).filter(([key, value]) => {
      return existingBill[key] !== value && key !== 'updated_at';
    });
    
    if (changes.length === 0) {
      console.log('  No changes detected');
    } else {
      changes.forEach(([key, newValue]) => {
        console.log(`  ${key}:`);
        console.log(`    Old: ${existingBill[key]}`);
        console.log(`    New: ${newValue}`);
      });
    }
  } else {
    console.log(`\n📝 Adding new bill ${billId}:`);
    Object.entries(billInfo).forEach(([key, value]) => {
      if (key !== 'id' && value !== null) {
        console.log(`  ${key}: ${value}`);
      }
    });
  }

  const { error } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .upsert(billInfo, {
      onConflict: 'id'
    });

  if (error) {
    console.error(`❌ Failed to update bill info for ${billId}:`, error);
    throw new Error(`Failed to update bill info: ${error.message}`);
  }

  console.log(`✅ Successfully ${existingBill ? 'updated' : 'added'} bill ${billId}`);
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
  console.log(`\nFetching bill actions from: ${url.replace(CONGRESS_API_KEY as string, 'XXXXX')}`);
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill actions: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  console.log(`\nProcessing ${data.actions?.length || 0} actions for bill ${billId}`);
  
  // For each action
  for (const action of data.actions || []) {
    const actionId = `${billId}_${action.actionDate}_${action.actionCode}`;
    
    // Check if action exists
    const { data: existingAction, error: fetchError } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .select('*')
      .eq('id', actionId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error(`❌ Error checking existing action: ${fetchError.message}`);
      continue;
    }

    const actionData = {
      id: actionId,
      bill_id: billId,
      action_code: action.actionCode,
      action_date: action.actionDate,
      source_system_code: action.sourceSystem.code,
      source_system_name: action.sourceSystem.name,
      text: action.text,
      type: action.type,
      updated_at: new Date().toISOString()
    };

    if (existingAction) {
      const changes = Object.entries(actionData).filter(([key, value]) => {
        return existingAction[key] !== value && key !== 'updated_at';
      });
      
      if (changes.length > 0) {
        console.log(`\n🔄 Updating action ${actionId}:`);
        changes.forEach(([key, newValue]) => {
          console.log(`  ${key}:`);
          console.log(`    Old: ${existingAction[key]}`);
          console.log(`    New: ${newValue}`);
        });
      }
    } else {
      console.log(`\n📝 Adding new action for bill ${billId}:`);
      console.log(`  Date: ${action.actionDate}`);
      console.log(`  Type: ${action.type}`);
      console.log(`  Text: ${action.text}`);
    }

    const { error } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .upsert(actionData, {
        onConflict: 'id'
      });

    if (error) {
      console.error(`❌ Failed to update action ${actionId}:`, error);
      throw new Error(`Failed to update bill action: ${error.message}`);
    }

    console.log(`✅ Successfully ${existingAction ? 'updated' : 'added'} action ${actionId}`);
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
  try {
    const congress = parseInt(billId.slice(-3));
    const billType = billId.slice(-5, -3);
    const billNumber = billId.slice(0, -5);

    console.log(`\n🔄 Starting update for bill ${billId}...`);
    console.log('----------------------------------------');
    
    // Update each aspect of the bill
    await updateBillInfo(congress, billType, billNumber);
    await updateBillActions(congress, billType, billNumber);
    await updateBillSummaries(congress, billType, billNumber);
    await updateBillText(congress, billType, billNumber);
    await updateBillTitles(congress, billType, billNumber);
    await updateBillSubjects(congress, billType, billNumber);
    
    console.log('----------------------------------------');
    console.log(`✅ Successfully completed all updates for bill ${billId}`);
  } catch (error: any) {
    console.error(`\n❌ Error updating bill ${billId}:`, error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Main function to run the update
async function main() {
  try {
    // Verify environment and connection
    if (!CONGRESS_API_KEY || !serviceKey) {
      throw new Error('Missing required environment variables');
    }

    // Test database connection
    const { error: testError } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .select('id')
      .limit(1);
      
    if (testError) {
      throw new Error(`Database connection failed: ${testError.message}`);
    }

    const congress = 118; // Current congress
    const billsToUpdate = await fetchBillsNeedingUpdates(congress);
    console.log(`Found ${billsToUpdate.length} bills that need updates`);
    
    for (const billId of billsToUpdate) {
      await updateBill(billId);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
    
    console.log('Update completed successfully');
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

// Run the script
main(); 