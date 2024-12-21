import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

const { url, key } = getSupabaseConfig();

export const supabase = createClient(url, key, {
  auth: {
    persistSession: false
  }
}); 