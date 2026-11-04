"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, PlayCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Course, Lesson, Section, SectionDependency } from "@/lib/content";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const demoMode = !isSupabaseConfigured;

// Course detail (client): sections in order, lessons in order, and section
// dependencies shown as "Suggested next" ONLY. Nothing locks.
// Demo seeding was removed 2026-11-03: with no backend connected this
// renders "Course not found", never a fake course. Rendered by the
// server route page, which awaits params (Next 16) and passes the plain
// course id in as a prop.
export default function CourseDetail({ courseId: id }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [deps, setDeps] = useState<SectionDependency[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    (async () => {
      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .select("id, creator_id, title, description, published, created_at")
        .eq("id", id)
        .single();
      if (courseError || !courseData) {
        setError("Course not found, or you do not have access to it.");
        setLoading(false);
        return;
      }
      setCourse(courseData as Course);
      const { data: sectionData } = await supabase
        .from("sections")
        .select("id, course_id, title, position")
        .eq("course_id", id)
        .order("position", { ascending: true });
      const secs = (sectionData ?? []) as Section[];
      setSections(secs);
      if (secs.length > 0) {
        const { data: lessonData } = await supabase
          .from("lessons")
          .select("id, section_id, title, position, content")
          .in("section_id", secs.map((s) => s.id))
          .order("position", { ascending: true });
        setLessons((lessonData ?? []) as Lesson[]);
      }
      const { data: depData } = await supabase
        .from("section_dependencies")
        .select("id, course_id, from_section_id, to_section_id")
        .eq("course_id", id);
      setDeps((depData ?? []) as SectionDependency[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!isSupabaseConfigured || lessons.length === 0) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await supabase
        .from("lesson_progress")
        .select("lesson_id, done")
        .in("lesson_id", lessons.map((l) => l.id))
        .eq("user_id", data.user.id);
      const map: Record<string, boolean> = {};
      (rows ?? []).forEach((r: { lesson_id: string; done: boolean }) => { map[r.lesson_id] = r.done; });
      setProgress(map);
    });
  }, [lessons]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-2/3 rounded-lg" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (error || !course) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium text-slate-900">Course not found</p>
          <p className="mt-1 text-sm text-slate-500">{demoMode ? "No backend connected. Connect Supabase to see real courses." : (error || "It may not exist, or you may not have access to it.")}</p>
          <Button variant="outline" asChild className="mt-4"><Link href="/">Back to courses</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const doneCount = lessons.filter((l) => progress[l.id]).length;

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/" className="hover:text-primary">Courses</Link>
        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="font-medium text-slate-900">{course.title}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-slate-900 sm:text-5xl">{course.title}</h1>
          {!course.published && !demoMode && <Badge variant="outline">Draft</Badge>}
        </div>
        {course.description && <p className="max-w-3xl leading-relaxed text-slate-600">{course.description}</p>}
        <p className="text-sm font-medium text-slate-600">
          {sections.length} sections · {lessons.length} lessons
          {!demoMode && lessons.length > 0 && ` · ${doneCount} marked done`}
        </p>
        {!course.published && !demoMode && (
          <p className="text-sm text-slate-500">Draft — only its creator can see this.</p>
        )}
      </header>

      {sections.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-slate-500">No sections yet.</CardContent></Card>
      )}

      <div className="space-y-5">
        {sections.map((section, si) => {
          const sectionLessons = lessons.filter((l) => l.section_id === section.id);
          const suggested = deps
            .filter((d) => d.from_section_id === section.id)
            .map((d) => sectionById.get(d.to_section_id))
            .filter(Boolean) as Section[];
          return (
            <Card key={section.id} className="overflow-hidden">
              <div className="flex items-start gap-4 border-b border-base-200 bg-primary/10 px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {si + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">{section.title}</h2>
                  <p className="text-sm text-slate-500">{sectionLessons.length} {sectionLessons.length === 1 ? "lesson" : "lessons"}</p>
                </div>
              </div>
              {suggested.length > 0 && (
                <div className="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-base-300 bg-secondary px-3.5 py-2.5 text-sm text-primary sm:mx-6">
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span><strong className="font-semibold">Suggested next:</strong> {suggested.map((s) => s.title).join(", ")}</span>
                  <span className="text-primary">— a suggestion only, nothing is locked.</span>
                </div>
              )}
              <CardContent className="px-0 py-2 sm:px-0">
                {sectionLessons.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-500 sm:px-6">No lessons in this section yet.</p>
                ) : (
                  <ul className="divide-y divide-base-200">
                    {sectionLessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          href={`/courses/${course.id}/lessons/${lesson.id}`}
                          className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-primary/10 sm:px-6"
                        >
                          {progress[lesson.id] ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                          ) : (
                            <PlayCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                          )}
                          <span className="flex-1 font-medium text-slate-900 group-hover:text-primary">{lesson.title}</span>
                          {progress[lesson.id] && <Badge variant="secondary">Done</Badge>}
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
