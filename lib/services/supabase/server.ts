import { createServerClient } from '@supabase/ssr';

// For pages directory (API Routes and getServerSideProps)
export function createClient(cookies?: { [key: string]: string }) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookies?.[name];
        },
      },
    }
  );
} 