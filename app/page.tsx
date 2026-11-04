"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Layers, PlayCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Course } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const demoMode = !isSupabaseConfigured;

// Course list. Demo seeding was removed 2026-11-03 (Kai: nuke demo
// courses, building-MVP mode): with no backend connected this page
// shows an empty state, never a fake course. In live mode, published
// courses only, per RLS (authenticated users).
// Lesson counts are real: counted from sections/lessons rows, never invented.
export default function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({});
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!demoMode);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setSignedIn(Boolean(userData.user));
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("courses")
        .select("id, creator_id, title, description, published, created_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Course[];
      setCourses(list);
      if (list.length > 0) {
        const { data: secs } = await supabase
          .from("sections")
          .select("id, course_id")
          .in("course_id", list.map((c) => c.id));
        const secRows = (secs ?? []) as { id: string; course_id: string }[];
        const sc: Record<string, number> = {};
        secRows.forEach((s) => { sc[s.course_id] = (sc[s.course_id] ?? 0) + 1; });
        setSectionCounts(sc);
        if (secRows.length > 0) {
          const { data: les } = await supabase
            .from("lessons")
            .select("id, section_id")
            .in("section_id", secRows.map((s) => s.id));
          const secToCourse = new Map(secRows.map((s) => [s.id, s.course_id]));
          const lc: Record<string, number> = {};
          ((les ?? []) as { id: string; section_id: string }[]).forEach((l) => {
            const cid = secToCourse.get(l.section_id);
            if (cid) lc[cid] = (lc[cid] ?? 0) + 1;
          });
          setLessonCounts(lc);
        }
      }
      setLoading(false);
    })();
  }, []);

  const courseCards = (coursesToRender: Course[]) => (
    <div className="grid gap-5 sm:grid-cols-2">
      {coursesToRender.map((c) => (
        <Card key={c.id} className="group overflow-hidden">
          <div className="flex h-28 items-center justify-between bg-secondary px-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
              <BookOpen className="h-6 w-6" aria-hidden />
            </span>
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg leading-snug">
              <Link href={`/courses/${c.id}`} className="group-hover:text-primary group-hover:underline group-hover:decoration-primary/40 group-hover:underline-offset-4">
                {c.title}
              </Link>
            </CardTitle>
            {c.description && <CardDescription className="leading-relaxed">{c.description}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-4 text-[13px] font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary" aria-hidden />{sectionCounts[c.id] ?? 0} sections</span>
              <span className="inline-flex items-center gap-1.5"><PlayCircle className="h-4 w-4 text-primary" aria-hidden />{lessonCounts[c.id] ?? 0} lessons</span>
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/courses/${c.id}`}>Open <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  if (demoMode) {
    return (
      <div className="space-y-6">
        <section className="rounded-[20px] border border-base-300 bg-white px-6 py-10 shadow-none sm:px-10 sm:py-12">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary">Learn from creators</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] text-slate-900 sm:text-5xl">Courses</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Video lessons, notes, and quizzes — organised as sections with a suggested path, never a locked one.
          </p>
        </section>
        <p className="text-slate-600">No courses yet. Create one in the Studio.</p>
        <p className="text-sm text-slate-500">
          No backend connected. Connect Supabase to see real courses, or use the Studio&apos;s
          browser-only mode to start building — that content is not in Supabase and does not
          appear here.
        </p>
        <Button variant="outline" asChild><Link href="/studio">Go to Studio</Link></Button>
      </div>
    );
  }

  if (!signedIn && !loading) {
    return (
      <div className="space-y-6">
        <section className="rounded-[20px] border border-base-300 bg-white px-6 py-10 shadow-none sm:px-10 sm:py-12">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-primary">Learn from creators</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] text-slate-900 sm:text-5xl">Curi</h1>
          <p className="mt-2 max-w-2xl leading-relaxed text-slate-600">
            Video lessons, notes, and quizzes from creators you follow.
          </p>
          <Button asChild className="mt-5">
            <Link href="/auth">Sign in to browse courses</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-slate-900 sm:text-5xl">Courses</h1>
        <p className="leading-relaxed text-slate-600">Pick up where you left off, or start something new.</p>
      </div>
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="font-medium text-slate-900">No published courses yet</p>
            <p className="text-sm text-slate-500">Creators can create one in the Studio.</p>
            <Button variant="outline" asChild><Link href="/studio">Go to Studio</Link></Button>
          </CardContent>
        </Card>
      ) : (
        courseCards(courses)
      )}
    </div>
  );
}
