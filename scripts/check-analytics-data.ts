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

async function checkAnalyticsData() {
  console.log('Checking analytics data...');
  
  try {
    // Check if the materialized view exists
    const { data: viewInfo, error: viewError } = await supabaseAdmin.rpc(
      'pg_get_matviewdef',
      { view_name: 'app_analytics_bills_by_congress' }
    );
    
    if (viewError) {
      console.error('Error checking materialized view definition:', viewError.message);
    } else {
      console.log('Materialized view exists:', !!viewInfo);
    }
    
    // Get the data from the materialized view
    const { data, error } = await supabaseAdmin
      .from('app_analytics_bills_by_congress')
      .select('*')
      .order('congress', { ascending: false });
      
    if (error) {
      console.error('Error fetching analytics data:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('No data found in the materialized view. Performing a refresh...');
      
      // Refresh the materialized view
      const { error: refreshError } = await supabaseAdmin.rpc('app_refresh_analytics_views');
      
      if (refreshError) {
        console.error('Error refreshing materialized view:', refreshError);
      } else {
        console.log('Materialized view refreshed successfully.');
        
        // Check data again after refresh
        const { data: refreshedData, error: refreshedError } = await supabaseAdmin
          .from('app_analytics_bills_by_congress')
          .select('*')
          .order('congress', { ascending: false });
          
        if (refreshedError) {
          console.error('Error fetching refreshed data:', refreshedError);
        } else {
          console.log('Refreshed data:');
          console.table(refreshedData || []);
        }
      }
    } else {
      console.log('Analytics data found:');
      console.table(data);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkAnalyticsData()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  }); 