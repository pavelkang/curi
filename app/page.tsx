"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { DEMO_STORE_NOTE, useStudio } from "@/lib/studio-store";
import type { Course } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Link } from "@astryxdesign/core/Link";

const demoMode = !isSupabaseConfigured;

// Course list. Demo mode reads the SAME store the Studio uses
// (lib/studio-store.tsx, localStorage `curi-studio-demo-v1`), so a
// demo course a teacher creates — and publishes — shows up here.
// Only published demo courses are listed on the home page; an
// unpublished demo course is still previewable at its own URL.
// Lesson counts are real: counted from sections/lessons rows, never invented.
export default function Home() {
  const studio = useStudio();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({});
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!demoMode);
  const [signedIn, setSignedIn] = useState(false);

  // Demo: counts from the shared store, once it has hydrated from
  // this browser. Until then, show skeletons — not "No courses yet".
  useEffect(() => {
    if (!demoMode || !studio.hydrated) return;
    const sc: Record<string, number> = {};
    const lc: Record<string, number> = {};
    for (const s of studio.sections) sc[s.course_id] = (sc[s.course_id] ?? 0) + 1;
    const secToCourse = new Map(studio.sections.map((s) => [s.id, s.course_id]));
    for (const l of studio.lessons) {
      const cid = secToCourse.get(l.section_id);
      if (cid) lc[cid] = (lc[cid] ?? 0) + 1;
    }
    setSectionCounts(sc);
    setLessonCounts(lc);
  }, [demoMode, studio.hydrated, studio.sections, studio.lessons]);

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
        <Card key={c.id}>
          <VStack gap={2}>
            <Heading level={3}>
              <Link href={`/courses/${c.id}`}>{c.title}</Link>
            </Heading>
            {c.description && <Text type="supporting">{c.description}</Text>}
            <HStack gap={3} vAlign="center">
              <Text type="supporting">
                {sectionCounts[c.id] ?? 0} {(sectionCounts[c.id] ?? 0) === 1 ? "section" : "sections"} · {lessonCounts[c.id] ?? 0} {(lessonCounts[c.id] ?? 0) === 1 ? "lesson" : "lessons"}
              </Text>
              <Button label="Open" variant="secondary" size="sm" href={`/courses/${c.id}`} />
            </HStack>
          </VStack>
        </Card>
      ))}
    </div>
  );

  if (demoMode) {
    const published = studio.courses.filter((c) => c.published);
    return (
      <VStack gap={4}>
        <VStack gap={2}>
          <Text type="supporting">Learn from creators</Text>
          <Heading level={1}>Courses</Heading>
          <Text>Video lessons, notes, and quizzes.</Text>
        </VStack>
        {!studio.hydrated ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Skeleton height={256} />
            <Skeleton height={256} />
          </div>
        ) : published.length === 0 ? (
          <>
            <Text>No courses yet. Create one in the Studio.</Text>
            <Text type="supporting">{DEMO_STORE_NOTE}.</Text>
            <div>
              <Button label="Go to Studio" variant="secondary" href="/studio" />
            </div>
          </>
        ) : (
          <>
            {courseCards(published)}
            <Text type="supporting">{DEMO_STORE_NOTE}.</Text>
          </>
        )}
      </VStack>
    );
  }

  if (!signedIn && !loading) {
    return (
      <VStack gap={4}>
        <VStack gap={2}>
          <Text type="supporting">Learn from creators</Text>
          <Heading level={1}>Curi</Heading>
          <Text>Video lessons, notes, and quizzes from creators you follow.</Text>
        </VStack>
        <div>
          <Button label="Sign in to browse courses" href="/auth" />
        </div>
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1}>Courses</Heading>
        <Text>Pick up where you left off, or start something new.</Text>
      </VStack>
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton height={256} />
          <Skeleton height={256} />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <VStack gap={2}>
            <Text>No published courses yet</Text>
            <div>
              <Button label="Go to Studio" variant="secondary" href="/studio" />
            </div>
          </VStack>
        </Card>
      ) : (
        courseCards(courses)
      )}
    </VStack>
  );
}
