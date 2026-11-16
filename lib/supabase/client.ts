import { createBrowserClient } from "@supabase/ssr";

// Supabase's new publishable key (sb_publishable_...) replaces the legacy
// anon key. The legacy NEXT_PUBLIC_SUPABASE_ANON_KEY is kept only as a
// temporary fallback while deployments migrate; remove it once every
// environment sets the publishable key.
function supabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "placeholder-publishable-key"
  );
}

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

// Placeholder values let `next build` succeed with no keys present.
// At runtime, pages check isSupabaseConfigured and show a setup message
// instead of pretending a backend exists. Never put a real key here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    supabaseKey(),
  );
}
