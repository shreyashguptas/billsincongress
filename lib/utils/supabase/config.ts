import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ 
  path: resolve(process.cwd(), '.env.local'),
  override: true 
});

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const missingVars = [];
    if (!url) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!key) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    
    console.error('Current environment variables:', {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10) + '...'
    });
    
    throw new Error(
      `Missing Supabase environment variables: ${missingVars.join(', ')}\n` +
      'Please ensure you have a .env.local file with these variables set.'
    );
  }

  return { url, key };
} 