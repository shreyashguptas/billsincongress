import { supabase } from '../lib/supabase';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env.local'),
  override: true 
});

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const API_BASE_URL = 'https://api.congress.gov/v3';

interface BillTextVersion {
  date: string | null;
  formats: {
    type: string;
    url: string;
  }[];
  type: string;
}

interface BillTextResponse {
  textVersions: BillTextVersion[];
}

async function fetchBillText(congress: number, billType: string, billNumber: number): Promise<{ textUrl: string | null; pdfUrl: string | null }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/bill/${congress}/${billType}/${billNumber}/text?api_key=${CONGRESS_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const textVersions: BillTextResponse = data;

    // Get the most recent version's URLs
    if (textVersions.textVersions && textVersions.textVersions.length > 0) {
      const latestVersion = textVersions.textVersions[0];
      let textUrl = null;
      let pdfUrl = null;

      for (const format of latestVersion.formats) {
        if (format.type === 'Formatted Text') {
          textUrl = format.url;
        } else if (format.type === 'PDF') {
          pdfUrl = format.url;
        }
      }

      return { textUrl, pdfUrl };
    }

    return { textUrl: null, pdfUrl: null };
  } catch (error) {
    console.error('Error fetching bill text:', error);
    return { textUrl: null, pdfUrl: null };
  }
}

async function fetchBillData(congress: number, billType: string, billNumber: number) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.bill;
  } catch (error) {
    console.error('Error fetching bill data:', error);
    return null;
  }
}

async function populateTestTable() {
  // Sample bills to fetch (10 recent bills)
  const billsToFetch = [
    { congress: 118, type: 'hr', number: 9488 },
    { congress: 118, type: 'hr', number: 9487 },
    { congress: 118, type: 'hr', number: 9486 },
    { congress: 118, type: 'hr', number: 9485 },
    { congress: 118, type: 'hr', number: 9484 },
    { congress: 118, type: 's', number: 4488 },
    { congress: 118, type: 's', number: 4487 },
    { congress: 118, type: 's', number: 4486 },
    { congress: 118, type: 's', number: 4485 },
    { congress: 118, type: 's', number: 4484 },
  ];

  for (const bill of billsToFetch) {
    console.log(`Fetching data for ${bill.type}${bill.number} in Congress ${bill.congress}...`);
    
    const billData = await fetchBillData(bill.congress, bill.type, bill.number);
    if (!billData) continue;

    const { textUrl, pdfUrl } = await fetchBillText(bill.congress, bill.type, bill.number);

    const billRecord = {
      id: `${bill.congress}-${bill.type}-${bill.number}`,
      title: billData.title,
      congress_number: bill.congress,
      bill_type: bill.type,
      bill_number: bill.number,
      sponsor_name: billData.sponsors?.[0]?.name || null,
      sponsor_state: billData.sponsors?.[0]?.state || null,
      sponsor_party: billData.sponsors?.[0]?.party || null,
      sponsor_bioguide_id: billData.sponsors?.[0]?.bioguideId || null,
      committee_count: billData.committees?.length || 0,
      latest_action_text: billData.latestAction?.text || null,
      latest_action_date: billData.latestAction?.actionDate || null,
      update_date: billData.updateDate || null,
      status: billData.status || null,
      progress: billData.progress || 0,
      summary: billData.summary || null,
      tags: billData.policyArea ? [billData.policyArea.name] : [],
      origin_chamber: billData.originChamber || null,
      origin_chamber_code: billData.originChamberCode || null,
      congress_gov_url: billData.congressGovUrl || null,
      introduced_date: billData.introducedDate || null,
      constitutional_authority_text: billData.constitutionalAuthorityText || null,
      official_title: billData.officialTitle || billData.title,
      short_title: billData.shortTitle || null,
      cosponsors_count: billData.cosponsors?.count || 0,
      bill_text_url: textUrl,
      bill_pdf_url: pdfUrl,
      last_updated: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('bills_testing')
      .upsert(billRecord, {
        onConflict: 'id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error inserting bill record:', error);
    } else {
      console.log(`Successfully inserted bill ${billRecord.id}`);
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Run the script
populateTestTable()
  .then(() => {
    console.log('Finished populating test table');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error running script:', error);
    process.exit(1);
  }); 