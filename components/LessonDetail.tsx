"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, PlayCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { emptyContent, parseContent, type Lesson, type LessonContent, type Section } from "@/lib/content";
import LessonRenderer from "@/components/LessonRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const demoMode = !isSupabaseConfigured;

// Custom lesson page (client): renders the lesson's JSON blocks in order.
// Completion is self-marked by the learner: a Done toggle only.
// It never gates anything else. Demo seeding was removed 2026-11-03:
// with no backend connected this renders "Lesson not found", never a
// fake lesson.
export default function LessonDetail({ courseId: id, lessonId }: { courseId: string; lessonId: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<LessonContent>(emptyContent());
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [navSections, setNavSections] = useState<Section[]>([]);
  const [navLessons, setNavLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    (async () => {
      const { data: lesson, error: lessonError } = await supabase
        .from("lessons")
        .select("id, title, content")
        .eq("id", lessonId)
        .single();
      if (lessonError || !lesson) {
        setError("Lesson not found, or you do not have access to it.");
        setLoading(false);
        return;
      }
      setTitle(lesson.title as string);
      setContent(parseContent(lesson.content));
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      if (userData.user) {
        const { data: row } = await supabase
          .from("lesson_progress")
          .select("done")
          .eq("user_id", userData.user.id)
          .eq("lesson_id", lessonId)
          .single();
        setDone(Boolean(row?.done));
      }
      // Sidebar navigation: sections + lessons for this course (real rows only).
      const { data: secs } = await supabase
        .from("sections")
        .select("id, course_id, title, position")
        .eq("course_id", id)
        .order("position", { ascending: true });
      const secRows = (secs ?? []) as Section[];
      setNavSections(secRows);
      if (secRows.length > 0) {
        const { data: les } = await supabase
          .from("lessons")
          .select("id, section_id, title, position, content")
          .in("section_id", secRows.map((s) => s.id))
          .order("position", { ascending: true });
        const lesRows = (les ?? []) as Lesson[];
        setNavLessons(lesRows);
        if (userData.user) {
          const { data: rows } = await supabase
            .from("lesson_progress")
            .select("lesson_id, done")
            .in("lesson_id", lesRows.map((l) => l.id))
            .eq("user_id", userData.user.id);
          const map: Record<string, boolean> = {};
          (rows ?? []).forEach((r: { lesson_id: string; done: boolean }) => { map[r.lesson_id] = r.done; });
          setProgress(map);
        }
      }
      setLoading(false);
    })();
  }, [lessonId, id]);

  const toggleDone = async (checked: boolean) => {
    setDone(checked);
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("lesson_progress").upsert(
      { user_id: userId, lesson_id: lessonId, done: checked },
      { onConflict: "user_id,lesson_id" },
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-2/3 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (error) {
    return (
      <Card><CardContent className="py-10 text-center">
        <p className="font-medium text-slate-900">Lesson not found</p>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
        <Button variant="outline" asChild className="mt-4"><Link href={`/courses/${id}`}>Back to course</Link></Button>
      </CardContent></Card>
    );
  }
  if (demoMode) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/courses/${id}`}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to course</Link>
        </Button>
        <p className="font-medium text-slate-900">Lesson not found</p>
        <p className="text-slate-500">No backend connected. Connect Supabase to see real lessons.</p>
      </div>
    );
  }

  const sidebar = (
    <Card className="overflow-hidden rounded-[20px] shadow-none">
      <div className="border-b border-base-300 bg-secondary px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide text-primary">In this course</h2>
      </div>
      <CardContent className="space-y-5 px-3 py-4">
        {navSections.length === 0 && <p className="px-2 text-sm text-slate-500">No sections yet.</p>}
        {navSections.map((section) => (
          <div key={section.id} className="space-y-1">
            <p className="px-2 text-[13px] font-semibold text-slate-900">{section.title}</p>
            <ul className="space-y-0.5">
              {navLessons.filter((l) => l.section_id === section.id).map((lesson) => {
                const isCurrent = lesson.id === lessonId;
                const isDone = isCurrent ? done : Boolean(progress[lesson.id]);
                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/courses/${id}/lessons/${lesson.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                        isCurrent
                          ? "bg-secondary font-semibold text-primary"
                          : "text-slate-700 hover:bg-primary/10 hover:text-primary",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className={cn("h-4 w-4 shrink-0", isCurrent ? "text-white" : "text-primary")} aria-hidden />
                      ) : (
                        <PlayCircle className={cn("h-4 w-4 shrink-0", isCurrent ? "text-white/80" : "text-primary")} aria-hidden />
                      )}
                      <span className="flex-1 leading-snug">{lesson.title}</span>
                      {isCurrent && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-8">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-primary hover:bg-primary/10 hover:text-primary">
            <Link href={`/courses/${id}`}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to course</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-slate-900 sm:text-5xl">{title}</h1>
            {done && <Badge variant="secondary">Done</Badge>}
          </div>
        </div>
        <LessonRenderer content={content} />
        <Card className={done ? "border-primary/30 bg-primary/10" : ""}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <p className="font-semibold text-slate-900">{done ? "Lesson marked done" : "Finished this lesson?"}</p>
              <p className="text-sm text-slate-500">
                {demoMode
                  ? "Demo mode — this is local only and is not saved."
                  : !userId
                    ? "Self-marked by you. Sign in to save your progress."
                    : "Self-marked by you. Nothing is locked by this."}
              </p>
            </div>
            <Button size="lg" variant={done ? "outline" : "default"} onClick={() => void toggleDone(!done)}>
              {done ? "Mark as not done" : "Mark lesson as done"}
            </Button>
          </CardContent>
        </Card>
        {/* Sidebar below content on mobile */}
        <div className="lg:hidden">{sidebar}</div>
      </div>
      <aside className="sticky top-24 hidden lg:block">{sidebar}</aside>
    </div>
  );
}
