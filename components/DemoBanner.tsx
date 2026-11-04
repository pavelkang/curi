// Server component in the layout. Rendered only when Supabase env vars
// are missing, so it can never appear in a live, configured build.
import { Info } from "lucide-react";

export default function DemoBanner() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) return null;
  return (
    <div className="border-b border-base-300 bg-white px-4 py-2.5">
      <p className="mx-auto flex w-full max-w-5xl items-center justify-center gap-2 text-center text-[13px] font-medium text-base-content">
        <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          Demo mode <span className="font-normal text-base-content/70">— no backend connected. Changes here are not saved.</span>
        </span>
      </p>
    </div>
  );
}
