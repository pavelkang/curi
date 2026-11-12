"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, PlayCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useStudio } from "@/lib/studio-store";
import { readLocalLessonDone, readLocalProgress, writeLocalLessonDone } from "@/lib/lesson-progress";
import { emptyContent, parseContent, type Lesson, type LessonContent, type Section } from "@/lib/content";
import LessonRenderer from "@/components/LessonRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { cn } from "@/lib/utils";

const demoMode = !isSupabaseConfigured;

// Custom lesson page (client): renders the lesson's JSON blocks in order.
// Completion is self-marked by the learner: a Done toggle only.
// It never gates anything else. Demo mode reads the SAME store the
// Studio uses, so a demo lesson is playable here as a learner —
// including a locally saved take (IndexedDB, see lib/local-video.ts).
// Done-state in demo mode is kept in this browser only.
export default function LessonDetail({ courseId: id, lessonId }: { courseId: string; lessonId: string }) {
  const studio = useStudio();
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

  // Demo: lesson, title, content, nav and done-state from the store.
  const demoLesson = demoMode ? studio.lessons.find((l) => l.id === lessonId) : undefined;
  const demoLessonCourse = demoLesson ? studio.courseOfLesson(demoLesson) : undefined;
  const demoNavSections = demoMode ? studio.sectionsFor(id) : [];
  const demoNavSectionIds = new Set(demoNavSections.map((s) => s.id));
  const demoNavLessons = demoMode
    ? studio.lessons.filter((l) => demoNavSectionIds.has(l.section_id)).sort((a, b) => a.position - b.position)
    : [];
  const demoLoading = demoMode && !studio.hydrated;

  useEffect(() => {
    if (demoMode && studio.hydrated) {
      setDone(readLocalLessonDone(lessonId));
      setProgress(readLocalProgress());
      // Visiting the learner lesson page in demo mode IS a preview —
      // same rule as the course page (see CourseDetail).
      if (demoLesson && !studio.previewDone) studio.setPreviewDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, studio.hydrated, lessonId, demoLesson?.id, studio.previewDone]);

  const shownTitle = demoMode ? (demoLesson?.title ?? "") : title;
  // Demo path goes through parseContent too, so a malformed stored
  // snapshot (e.g. a corrupt whiteboard snapshot) degrades to an
  // empty block instead of reaching the renderer raw — same as live.
  const shownContent = demoMode ? parseContent(demoLesson?.content ?? emptyContent()) : content;
  const shownNavSections = demoMode ? demoNavSections : navSections;
  const shownNavLessons = demoMode ? demoNavLessons : navLessons;
  // A demo lesson only counts if it belongs to the course in the URL.
  const demoMismatch = demoMode && studio.hydrated && demoLesson && demoLessonCourse?.id !== id;

  const toggleDone = async (checked: boolean) => {
    setDone(checked);
    if (demoMode) {
      writeLocalLessonDone(lessonId, checked);
      setProgress((p) => ({ ...p, [lessonId]: checked }));
      return;
    }
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("lesson_progress").upsert(
      { user_id: userId, lesson_id: lessonId, done: checked },
      { onConflict: "user_id,lesson_id" },
    );
  };

  if (loading || demoLoading) {
    return (
      <VStack gap={4}>
        <Skeleton height={36} width="66%" />
        <Skeleton height={256} />
        <Skeleton height={128} />
      </VStack>
    );
  }
  if (error || (demoMode && (!demoLesson || demoMismatch))) {
    return (
      <Card>
        <VStack gap={2}>
          <Text weight="semibold">Lesson not found</Text>
          <Text type="supporting">
            {demoMode ? "No lesson with this id in this browser." : error}
          </Text>
          <div>
            <Button label="Back to course" variant="secondary" href={`/courses/${id}`} />
          </div>
        </VStack>
      </Card>
    );
  }

  const sidebar = (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-accent-muted px-5 py-4">
        <Text weight="semibold">In this course</Text>
      </div>
      <div className="space-y-5 px-3 py-4">
        {shownNavSections.length === 0 && <Text type="supporting">No sections yet.</Text>}
        {shownNavSections.map((section) => (
          <div key={section.id} className="space-y-1">
            <p className="px-2 text-[13px] font-semibold text-primary">{section.title}</p>
            <ul className="space-y-0.5">
              {shownNavLessons.filter((l) => l.section_id === section.id).map((lesson) => {
                const isCurrent = lesson.id === lessonId;
                const isDone = isCurrent ? done : Boolean(progress[lesson.id]);
                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/courses/${id}/lessons/${lesson.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-2 text-sm",
                        isCurrent
                          ? "bg-accent-muted font-semibold text-accent"
                          : "text-primary hover:bg-accent-muted hover:text-accent",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                      ) : (
                        <PlayCircle className="h-4 w-4 shrink-0 text-accent" aria-hidden />
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
      </div>
    </Card>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-8">
        <div className="space-y-3">
          <Button label="Back to course" variant="ghost" size="sm" href={`/courses/${id}`} />
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={1}>{shownTitle}</Heading>
            {done && <Badge label="Done" variant="success" />}
            {demoMode && <Badge label="Demo" variant="neutral" />}
          </div>
        </div>
        <LessonRenderer content={shownContent} />
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text weight="semibold">{done ? "Lesson marked done" : "Finished this lesson?"}</Text>
            <Button
              label={done ? "Mark as not done" : "Mark lesson as done"}
              size="lg"
              variant={done ? "secondary" : "default"}
              onClick={() => void toggleDone(!done)}
            />
          </div>
        </Card>
        {/* Sidebar below content on mobile */}
        <div className="lg:hidden">{sidebar}</div>
      </div>
      <aside className="sticky top-24 hidden lg:block">{sidebar}</aside>
    </div>
  );
}
