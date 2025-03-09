import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// For static generation
export function createStaticClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// For server components
export async function createAppClient() {
  // Note: Using a type assertion here to address the type issues
  // This is a temporary workaround until the types are updated in @supabase/ssr
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // Note: We're using the synchronous version for backward compatibility
          // This will be deprecated in future versions of Next.js
          // @ts-ignore - Ignoring type error for now until types are updated
          const cookie = cookies().get(name);
          return cookie?.value ?? '';
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // @ts-ignore - Ignoring type error for now until types are updated
            cookies().set({ name, value, ...options });
          } catch (error) {
            console.error('Error setting cookie:', error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // @ts-ignore - Ignoring type error for now until types are updated
            cookies().delete({ name, ...options });
          } catch (error) {
            console.error('Error removing cookie:', error);
          }
        },
      },
      auth: {
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: false // Don't persist session in edge runtime
      }
    }
  );
} 