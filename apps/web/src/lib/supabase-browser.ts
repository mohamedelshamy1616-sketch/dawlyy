import { createBrowserClient } from '@supabase/ssr';

/** Browser Supabase client. NEXT_PUBLIC_* values are inlined at build time, so they are read directly here. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
}
