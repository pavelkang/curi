"use client";

// Studio landing: deliberately plain. The folder tree on the left is
// the structure; this area is just orientation, not another layer of
// cards. Courses, sections, and lessons are created from the sidebar
// and edited on their own pages.

import Link from "next/link";
import { useStudio } from "@/lib/studio-store";

export default function StudioHomePage() {
  const studio = useStudio();

  if (!studio.hydrated) return <p className="text-slate-500">Loading Studio…</p>;
  if (!studio.demoMode && !studio.userId) {
    return (
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Studio</h2>
        <p className="text-slate-600">
          Please <Link href="/auth" className="text-primary underline">sign in</Link> to use the Studio.
        </p>
      </div>
    );
  }
  if (!studio.demoMode && !studio.isCreator) {
    return (
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Studio</h2>
        <p className="text-slate-600">You are signed in, but your account is not flagged as a creator yet.</p>
        <p className="text-sm text-slate-500">
          Creator access is manual in MVP: run the commented SQL snippet in
          supabase/migrations/20261103_curi_init.sql for your user id, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-3xl font-bold tracking-tight text-slate-900">Studio</h2>
      <p className="leading-relaxed text-slate-600">
        Pick a course in the sidebar, or press + Course to start one. Sections are folders,
        lessons are files inside them. Click a lesson to fill in its page on its own.
      </p>
      {studio.demoMode && (
        <p className="text-sm text-slate-500">
          Demo mode: courses you create here are stored in this browser only, not in Supabase,
          and do not appear on the learner course list.
        </p>
      )}
      {studio.error && <p className="text-sm text-red-700">{studio.error}</p>}
    </div>
  );
}
