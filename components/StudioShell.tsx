"use client";

// Flat Studio shell: a folder-tree sidebar on the left, the page on the
// right. No cards. The layout preserves this component (and therefore
// the StudioProvider state) across navigation between Studio pages,
// which is what makes standalone lesson pages work in demo mode.
// See lib/studio-store.tsx for the demo browser store.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_STORE_NOTE, useStudio } from "@/lib/studio-store";
import { Button } from "@/components/ui/button";

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const studio = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsedCourses, setCollapsedCourses] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

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
      <aside className="w-full shrink-0 rounded-[20px] border border-base-300 bg-white p-4 sm:p-5 lg:sticky lg:top-20 lg:w-72">
        <div className="border-b border-base-300 pb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Studio</h1>
            {studio.demoMode && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Demo</span>
            )}
          </div>
          {studio.demoMode && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{DEMO_STORE_NOTE}</p>
          )}
          {(studio.demoMode || (studio.hydrated && studio.userId && studio.isCreator)) && (
            <Button size="sm" className="mt-3" onClick={onCreateCourse}>
              + Course
            </Button>
          )}
        </div>

        {!studio.hydrated ? (
          <p className="mt-4 text-sm text-slate-500">Loading Studio…</p>
        ) : !studio.demoMode && !studio.userId ? (
          <p className="mt-4 text-sm text-slate-500">
            <Link href="/auth" className="text-primary underline">Sign in</Link> to use the Studio.
          </p>
        ) : !studio.demoMode && !studio.isCreator ? (
          <p className="mt-4 text-sm text-slate-500">Your account is not flagged as a creator yet.</p>
        ) : (
          <nav aria-label="Courses" className="mt-2 space-y-1">
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
                      className="w-6 shrink-0 text-center text-slate-500 hover:text-primary"
                    >
                      {courseCollapsed ? "▸" : "▾"}
                    </button>
                    <Link
                      href={courseHref}
                      className={`flex-1 truncate rounded px-1 py-1 text-sm font-semibold hover:text-primary ${
                        pathname === courseHref ? "bg-secondary text-primary" : "text-slate-900"
                      }`}
                    >
                      {course.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onCreateSection(course.id)}
                      className="shrink-0 rounded px-1 py-0.5 text-xs font-medium text-primary hover:bg-secondary"
                    >
                      + Section
                    </button>
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
                              className="w-6 shrink-0 text-center text-slate-500 hover:text-primary"
                            >
                              {sectionCollapsed ? "▸" : "▾"}
                            </button>
                            <span className="flex-1 truncate px-1 py-1 text-sm text-slate-700">{section.title}</span>
                            <button
                              type="button"
                              onClick={() => void onCreateLesson(course.id, section.id)}
                              className="shrink-0 rounded px-1 py-0.5 text-xs font-medium text-primary hover:bg-secondary"
                            >
                              + Lesson
                            </button>
                          </div>
                          {!sectionCollapsed &&
                            sectionLessons.map((lesson) => {
                              const lessonHref = `/studio/courses/${course.id}/lessons/${lesson.id}`;
                              return (
                                <Link
                                  key={lesson.id}
                                  href={lessonHref}
                                  className={`ml-7 block truncate rounded px-1 py-1 text-sm hover:text-primary ${
                                    pathname === lessonHref ? "bg-secondary font-medium text-primary" : "text-slate-600"
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
              <p className="mt-2 text-sm text-slate-500">No courses yet. Press + Course.</p>
            )}
          </nav>
        )}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
