import { Suspense } from "react";
import StudioShell from "@/components/StudioShell";

// Nested Studio layout (Next 16 layouts preserve state on navigation):
// the sidebar shell stays mounted while the main area swaps between
// the course overview and standalone lesson pages. The StudioProvider
// lives in the root providers (app/providers.tsx) so learner pages
// share the same demo store — it must NOT be re-created here, or the
// Studio and learner views would hold two different stores.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading Studio…</p>}>
      <StudioShell>{children}</StudioShell>
    </Suspense>
  );
}
