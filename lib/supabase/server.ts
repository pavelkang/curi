import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

export function isServerSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Next 16: cookies() is async. Callers must await createServerSupabaseClient().
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    supabaseKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component where setting cookies is not
            // allowed; the middleware/session-refresh path handles it.
          }
        },
      },
    },
  );
}
