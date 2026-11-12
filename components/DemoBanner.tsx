// Server component in the layout. Rendered only when Supabase env vars
// are missing, so it can never appear in a live, configured build.
// One honest line, the same everywhere demo storage is described:
// the demo store IS saved — in this browser only.
import {Banner} from "@astryxdesign/core/Banner";

export default function DemoBanner() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) return null;
  return (
    <Banner
      status="info"
      title="Demo mode"
      description="Saved in this browser only."
      container="section"
    />
  );
}
