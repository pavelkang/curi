"use client";

// Flat Studio shell: a folder-tree sidebar on the left, the page on the
// right. No cards. The layout preserves this component (and therefore
// the StudioProvider state) across navigation between Studio pages,
// which is what makes standalone lesson pages work in demo mode.
// See lib/studio-store.tsx for the demo browser store.
//
// Hydration: the sidebar reads the browser-local demo store, which the
// server can never know. The store's own `hydrated` flag must NOT gate
// this render — the provider sits above the layout's Suspense boundary,
// so its mount effect flips that flag before this streamed boundary
// hydrates, and the server/client trees diverge (hydration error).
// Instead this component gates on its OWN mounted flag: its effect runs
// only after this boundary hydrates, so the first client render matches
// the server (loading text) and the store content appears in a normal
// post-hydration update.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_STORE_NOTE, useStudio } from "@/lib/studio-store";
import { checklistDoneCount, CHECKLIST_TOTAL, computeChecklistSteps } from "@/lib/checklist";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const studio = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [collapsedCourses, setCollapsedCourses] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // Compact get-started progress, shown on course/lesson pages too —
  // the full checklist only exists on /studio, and it vanished once
  // the teacher went deeper. Same count as the checklist itself.
  const inCourseOrLesson = pathname.startsWith("/studio/courses");
  const checklistSteps = computeChecklistSteps(studio.courses, studio.lessons, studio.previewDone);
  const checklistDone = checklistDoneCount(checklistSteps);

  const onCreateCourse = async () => {
    const course = await studio.createCourse();
    router.push(`/studio/courses/${course.id}`);
  };
  const onCreateSection = async (courseId: string) => {
    await studio.createSection(courseId);
    setCollapsedCourses((c) => c.filter((x) => x !== courseId));
  };
  const onCreateLesson = async (courseId: string, sectionId: string) => {
    const lesson = await studio.createLesson(sectionId);
    setCollapsedCourses((c) => c.filter((x) => x !== courseId));
    setCollapsedSections((s) => s.filter((x) => x !== sectionId));
    router.push(`/studio/courses/${courseId}/lessons/${lesson.id}`);
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:sticky lg:top-20 lg:w-72">
        <VStack gap={2}>
          <div className="flex items-center gap-2">
            <Heading level={1}>Studio</Heading>
            {studio.demoMode && <Badge label="Demo" variant="neutral" />}
          </div>
          {studio.demoMode && <Text type="supporting">{DEMO_STORE_NOTE}</Text>}
          {mounted && studio.demoMode && (
            <Link href="/studio">
              Offline drafts: {studio.courses.length + studio.lessons.length} · saved in this browser only
            </Link>
          )}
          {mounted && inCourseOrLesson && (studio.demoMode || (studio.userId && studio.isCreator)) && (
            <Text type="supporting">
              <Link href="/studio">
                Get started: {checklistDone} of {CHECKLIST_TOTAL} done
              </Link>
            </Text>
          )}
          {mounted && (studio.demoMode || (studio.userId && studio.isCreator)) && (
            <Button label="+ Course" variant="primary" size="sm" onClick={onCreateCourse} />
          )}
        </VStack>

        {!mounted ? (
          <Text type="supporting">Loading Studio…</Text>
        ) : !studio.demoMode && !studio.userId ? (
          <Text type="supporting">
            <Link href="/auth">Sign in</Link> to use the Studio.
          </Text>
        ) : !studio.demoMode && !studio.isCreator ? (
          <Text type="supporting">Your account is not flagged as a creator yet.</Text>
        ) : (
          <nav aria-label="Courses" className="mt-4 space-y-1">
            {studio.courses.map((course) => {
              const courseCollapsed = collapsedCourses.includes(course.id);
              const courseSections = studio.sectionsFor(course.id);
              const courseHref = `/studio/courses/${course.id}`;
              return (
                <div key={course.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={courseCollapsed ? `Expand ${course.title}` : `Collapse ${course.title}`}
                      onClick={() => toggle(collapsedCourses, course.id, setCollapsedCourses)}
                      className="w-6 shrink-0 text-center text-secondary hover:text-accent"
                    >
                      {courseCollapsed ? "▸" : "▾"}
                    </button>
                    <Link
                      href={courseHref}
                      className={`flex-1 truncate rounded px-1 py-1 text-sm font-semibold hover:text-accent ${
                        pathname === courseHref ? "bg-accent-muted text-accent" : "text-primary"
                      }`}
                    >
                      {course.title}
                    </Link>
                    <Button label="+ Section" variant="ghost" size="sm" onClick={() => void onCreateSection(course.id)} />
                  </div>
                  {!courseCollapsed &&
                    courseSections.map((section) => {
                      const sectionCollapsed = collapsedSections.includes(section.id);
                      const sectionLessons = studio.lessonsFor(section.id);
                      return (
                        <div key={section.id} className="ml-7">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={sectionCollapsed ? `Expand ${section.title}` : `Collapse ${section.title}`}
                              onClick={() => toggle(collapsedSections, section.id, setCollapsedSections)}
                              className="w-6 shrink-0 text-center text-secondary hover:text-accent"
                            >
                              {sectionCollapsed ? "▸" : "▾"}
                            </button>
                            <span className="flex-1 truncate px-1 py-1 text-sm text-primary">{section.title}</span>
                            <Button label="+ Lesson" variant="ghost" size="sm" onClick={() => void onCreateLesson(course.id, section.id)} />
                          </div>
                          {!sectionCollapsed &&
                            sectionLessons.map((lesson) => {
                              const lessonHref = `/studio/courses/${course.id}/lessons/${lesson.id}`;
                              return (
                                <Link
                                  key={lesson.id}
                                  href={lessonHref}
                                  className={`ml-7 block truncate rounded px-1 py-1 text-sm hover:text-accent ${
                                    pathname === lessonHref ? "bg-accent-muted font-medium text-accent" : "text-secondary"
                                  }`}
                                >
                                  {lesson.title}
                                </Link>
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              );
            })}
            {studio.courses.length === 0 && (
              <Text type="supporting">No courses yet. Press + Course.</Text>
            )}
          </nav>
        )}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
