import { createBrowserClient } from "@supabase/ssr";

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Placeholder values let `next build` succeed with no keys present.
// At runtime, pages check isSupabaseConfigured and show a setup message
// instead of pretending a backend exists. Never put a real key here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  );
}
