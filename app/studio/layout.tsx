import { Suspense } from "react";
import { StudioProvider } from "@/lib/studio-store";
import StudioShell from "@/components/StudioShell";

// Nested Studio layout (Next 16 layouts preserve state on navigation):
// the provider + sidebar shell stay mounted while the main area swaps
// between the course overview and standalone lesson pages, so demo
// state is shared instead of living in a single page component.
// Suspense is required around the shell because it reads usePathname()
// (active sidebar link), which is only available at runtime — the same
// reason the root layout wraps Nav in Suspense.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioProvider>
      <Suspense fallback={<p className="text-slate-500">Loading Studio…</p>}>
        <StudioShell>{children}</StudioShell>
      </Suspense>
    </StudioProvider>
  );
}
