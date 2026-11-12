"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, PlayCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useStudio } from "@/lib/studio-store";
import { readLocalProgress } from "@/lib/lesson-progress";
import type { Course, Lesson, Section, SectionDependency } from "@/lib/content";
import { Card } from "@/components/ui/card";
import { Badge } from "@astryxdesign/core/Badge";
import { Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

const demoMode = !isSupabaseConfigured;

// Course detail (client): sections in order, lessons in order, and section
// dependencies shown as "Suggested next" ONLY. Nothing locks.
// Demo mode reads the SAME store the Studio uses, so a demo course is
// previewable here — published or not, since this browser IS the
// teacher's browser. The learner home lists published demo courses
// only; this page shows any demo course by id. Rendered by the server
// route page, which awaits params (Next 16) and passes the plain
// course id in as a prop.
export default function CourseDetail({ courseId: id }: { courseId: string }) {
  const studio = useStudio();
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

  // Demo: course, sections, lessons, deps and done-state all come from
  // the shared store / this browser — no backend, no fake course.
  const demoCourse = demoMode ? studio.courses.find((c) => c.id === id) : undefined;
  const demoSections = demoMode ? studio.sectionsFor(id) : [];
  const demoSectionIds = new Set(demoSections.map((s) => s.id));
  const demoLessons = demoMode
    ? studio.lessons.filter((l) => demoSectionIds.has(l.section_id)).sort((a, b) => a.position - b.position)
    : [];
  const demoDeps = demoMode ? studio.deps.filter((d) => d.course_id === id) : [];
  const demoLoading = demoMode && !studio.hydrated;

  useEffect(() => {
    if (demoMode && studio.hydrated) {
      setProgress(readLocalProgress());
      // Visiting the learner course page in demo mode IS a preview:
      // this browser is the teacher's browser, so it ticks checklist
      // step 4 (the Studio preview link records it the same way).
      if (demoCourse && !studio.previewDone) studio.setPreviewDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, studio.hydrated, demoCourse?.id, studio.previewDone]);

  const shownCourse = demoMode ? (demoCourse ?? null) : course;
  const shownSections = demoMode ? demoSections : sections;
  const shownLessons = demoMode ? demoLessons : lessons;
  const shownDeps = demoMode ? demoDeps : deps;

  if (loading || demoLoading) {
    return (
      <VStack gap={4}>
        <Skeleton height={36} width="66%" />
        <Skeleton height={128} />
        <Skeleton height={128} />
      </VStack>
    );
  }
  if (error || !shownCourse) {
    return (
      <Card>
        <VStack gap={2}>
          <Text weight="semibold">Course not found</Text>
          <Text type="supporting">
            {demoMode ? "No course with this id in this browser." : (error || "It may not exist, or you may not have access to it.")}
          </Text>
          <div>
            <Button label="Back to courses" variant="secondary" href="/" />
          </div>
        </VStack>
      </Card>
    );
  }

  const sectionById = new Map(shownSections.map((s) => [s.id, s]));
  const doneCount = shownLessons.filter((l) => progress[l.id]).length;

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/">Courses</BreadcrumbItem>
        <BreadcrumbItem>{shownCourse.title}</BreadcrumbItem>
      </Breadcrumbs>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={1}>{shownCourse.title}</Heading>
          {!shownCourse.published && <Badge label="Draft" variant="neutral" />}
          {demoMode && <Badge label="Demo" variant="neutral" />}
        </div>
        {/* Description and stats are each in their own block div:
            Astryx Text renders inline, so as siblings they ran
            together on one line ("…from scratch.1 section · …").
            Block wrappers put the stats on their own line below the
            description (the header's space-y-3 supplies the gap). */}
        {shownCourse.description && (
          <div>
            <Text>{shownCourse.description}</Text>
          </div>
        )}
        <div>
          <Text type="supporting">
            {shownSections.length} {shownSections.length === 1 ? "section" : "sections"} · {shownLessons.length} {shownLessons.length === 1 ? "lesson" : "lessons"}
            {shownLessons.length > 0 && ` · ${doneCount} marked done`}
          </Text>
        </div>
      </header>

      {shownSections.length === 0 && (
        <Card><Text type="supporting">No sections yet.</Text></Card>
      )}

      <VStack gap={5}>
        {shownSections.map((section, si) => {
          const sectionLessons = shownLessons.filter((l) => l.section_id === section.id);
          const suggested = shownDeps
            .filter((d) => d.from_section_id === section.id)
            .map((d) => sectionById.get(d.to_section_id))
            .filter(Boolean) as Section[];
          return (
            <Card key={section.id} className="overflow-hidden">
              <div className="flex items-start gap-4 border-b border-border bg-accent-muted px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-bg text-sm font-bold text-on-accent">
                  {si + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Heading level={3}>{section.title}</Heading>
                  <Text type="supporting">{sectionLessons.length} {sectionLessons.length === 1 ? "lesson" : "lessons"}</Text>
                </div>
              </div>
              {suggested.length > 0 && (
                <p className="mx-5 mt-4 text-sm text-accent sm:mx-6">
                  Suggested next: {suggested.map((s) => s.title).join(", ")}
                </p>
              )}
              <div className="px-0 py-2">
                {sectionLessons.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-secondary sm:px-6">No lessons in this section yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {sectionLessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          href={`/courses/${shownCourse.id}/lessons/${lesson.id}`}
                          className="group flex items-center gap-3 px-5 py-3.5 hover:bg-accent-muted sm:px-6"
                        >
                          {progress[lesson.id] ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                          ) : (
                            <PlayCircle className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                          )}
                          <span className="flex-1 font-medium text-primary group-hover:text-accent">{lesson.title}</span>
                          {progress[lesson.id] && <Badge label="Done" variant="success" />}
                          <ChevronRight className="h-4 w-4 shrink-0 text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          );
        })}
      </VStack>
    </VStack>
  );
}
