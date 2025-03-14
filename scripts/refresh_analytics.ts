import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function refreshAnalyticsViews() {
  console.log('Starting analytics views refresh...');
  
  try {
    // Call the refresh function
    const { data, error } = await supabaseAdmin.rpc('app_refresh_analytics_views');
    
    if (error) {
      console.error('Error refreshing analytics views:', error);
      return;
    }
    
    // Log the refresh
    const { error: logError } = await supabaseAdmin
      .from('analytics_refresh_log')
      .insert([
        { note: 'Manual refresh via script' }
      ]);
      
    if (logError) {
      console.error('Error logging refresh:', logError);
      return;
    }
    
    console.log('Analytics views refreshed successfully!');
    
    // Get the latest data to verify
    const { data: billsData, error: billsError } = await supabaseAdmin
      .from('app_analytics_bills_by_congress')
      .select('*')
      .order('congress', { ascending: false })
      .limit(5);
      
    if (billsError) {
      console.error('Error fetching bills data:', billsError);
      return;
    }
    
    console.log('Latest analytics data:');
    console.table(billsData);
    
  } catch (error) {
    console.error('Unexpected error during refresh:', error);
  }
}

refreshAnalyticsViews()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  }); 