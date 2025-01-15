/// @deno-types="./deno.env.d.ts"

// deno-lint-ignore-file no-explicit-any

import { serve } from "std/http/server.ts";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types
interface BillInfo {
  id: string;
  update_date: string;
}

// Constants
const BASE_URL = 'https://api.congress.gov/v3';
const RATE_LIMIT_PER_HOUR = 5000;
const DELAY_BETWEEN_REQUESTS = Math.ceil((3600 * 1000) / RATE_LIMIT_PER_HOUR); // Milliseconds between requests
const MAX_RETRIES = 3;
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];

// Table names
const BILL_INFO_TABLE_NAME = 'bill_info';
const BILL_ACTIONS_TABLE_NAME = 'bill_actions';
const BILL_SUMMARIES_TABLE_NAME = 'bill_summaries';
const BILL_TEXT_TABLE_NAME = 'bill_text';
const BILL_TITLES_TABLE_NAME = 'bill_titles';
const BILL_SUBJECTS_TABLE_NAME = 'bill_subjects';

// Create Supabase client
const supabaseAdmin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);

// Validate environment variables
const CONGRESS_API_KEY = Deno.env.get('CONGRESS_API_KEY');
if (!CONGRESS_API_KEY) {
  console.error('CONGRESS_API_KEY is not set');
  throw new Error('CONGRESS_API_KEY is not set');
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
if (!SUPABASE_URL) {
  console.error('SUPABASE_URL is not set');
  throw new Error('SUPABASE_URL is not set');
}

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
}

// Utility function to fetch bills that need updates
async function fetchBillsNeedingUpdates(congress: number): Promise<string[]> {
  const billsToUpdate: string[] = [];
  
  for (const billType of BILL_TYPES) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = `${BASE_URL}/bill/${congress}/${billType}?offset=${offset}&limit=250&api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
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
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill info: ${response.statusText}`);
  
  const data = await response.json();
  const bill = data.bill;
  const billId = `${billNumber}${billType}${congress}`;
  
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
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/summaries?api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill summaries: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  for (const summary of data.summaries || []) {
    const { data: existingData } = await supabaseAdmin
      .from(BILL_SUMMARIES_TABLE_NAME)
      .select('update_date')
      .eq('id', billId)
      .eq('version_code', summary.versionCode)
      .single();

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
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/actions?api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill actions: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  for (const action of data.actions || []) {
    const { data: existingData } = await supabaseAdmin
      .from(BILL_ACTIONS_TABLE_NAME)
      .select('updated_at')
      .eq('id', billId)
      .eq('action_date', action.actionDate)
      .eq('action_code', action.actionCode)
      .single();

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
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/text?api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill text: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  for (const text of data.textVersions || []) {
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
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/titles?api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch bill titles: ${response.statusText}`);
  
  const data = await response.json();
  const billId = `${billNumber}${billType}${congress}`;
  
  for (const title of data.titles || []) {
    const { data: existingData } = await supabaseAdmin
      .from(BILL_TITLES_TABLE_NAME)
      .select('update_date')
      .eq('id', billId)
      .eq('title_type_code', title.titleType)
      .eq('title', title.title)
      .single();

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
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/subjects?api_key=${Deno.env.get('CONGRESS_API_KEY')}&format=json`;
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

// Main handler for the Edge Function
serve(async (req: Request) => {
  try {
    console.log('Starting bill update cron job...');
    console.log('Environment check passed. All required variables are set.');
    const congress = 118; // Current congress
    
    // Get list of bills that need updates
    console.log('Fetching bills that need updates...');
    const billsToUpdate = await fetchBillsNeedingUpdates(congress);
    console.log(`Found ${billsToUpdate.length} bills that need updates`);
    
    if (billsToUpdate.length === 0) {
      console.log('No bills need updating');
      return new Response(JSON.stringify({ success: true, message: 'No bills need updating' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Update each bill
    let updatedCount = 0;
    for (const billId of billsToUpdate) {
      console.log(`Processing bill ${billId} (${updatedCount + 1}/${billsToUpdate.length})`);
      await updateBill(billId);
      updatedCount++;
      // Respect rate limit
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
    
    console.log(`Bill update cron job completed successfully. Updated ${updatedCount} bills.`);
    return new Response(JSON.stringify({ 
      success: true, 
      billsFound: billsToUpdate.length,
      billsUpdated: updatedCount 
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Cron job failed:', errorMessage);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/update-bills' \
    --header 'Authorization: Bearer ' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
