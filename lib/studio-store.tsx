"use client";

// Shared Studio store: one flat source of truth for courses, sections,
// lessons, and section dependencies across all Studio routes.
//
// Why this exists: the old Studio kept everything in one page component,
// so a standalone lesson route would have lost demo-created courses.
// Demo mode now lives here (React context) AND in browser localStorage,
// demo mode only, so demo courses survive navigation and reloads in
// this browser. Live mode never touches that store: it loads/saves via
// Supabase directly, with RLS as the enforcement layer, exactly as
// the old Studio did. Demo data is never claimed to be in Supabase.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  emptyContent, newId, parseContent,
  type Course, type Lesson, type LessonBlock, type LessonContent, type Section, type SectionDependency,
} from "@/lib/content";
export const demoMode = !isSupabaseConfigured;

// Demo seeding was removed 2026-11-03 (Kai: nuke demo courses, we are
// in building-MVP mode). The demo store starts EMPTY. Old browser
// snapshots that still contain the demo course are filtered on load.
const NUKED_IDS = new Set(["demo-course", "demo-section-1", "demo-section-2", "demo-lesson-1", "demo-lesson-2", "demo-lesson-3", "demo-dep-1"]);
const DEMO_STORAGE_KEY = "curi-studio-demo-v1";
export const DEMO_STORE_NOTE = "Demo — stored in this browser only, not in Supabase";

type DemoSnapshot = {
  courses: Course[];
  sections: Section[];
  lessons: Lesson[];
  deps: SectionDependency[];
};

function isValidSnapshot(v: unknown): v is DemoSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.courses) && Array.isArray(s.sections) && Array.isArray(s.lessons) && Array.isArray(s.deps);
}

// Renumber one section's lessons 0..n in the order they appear in the
// list, after the caller has already placed the moved lesson where it
// belongs (at the end of its new section, or swapped with a neighbour).
function renumberSection(all: Lesson[], sectionId: string): Lesson[] {
  let pos = 0;
  return all.map((l) => (l.section_id === sectionId ? { ...l, position: pos++ } : l));
}

export type StudioContextValue = {
  demoMode: boolean;
  hydrated: boolean;
  userId: string | null;
  isCreator: boolean;
  error: string;
  courses: Course[];
  sections: Section[];
  lessons: Lesson[];
  deps: SectionDependency[];
  sectionsFor: (courseId: string) => Section[];
  lessonsFor: (sectionId: string) => Lesson[];
  courseOfLesson: (lesson: Lesson) => Course | undefined;
  createCourse: () => Promise<Course>;
  createSection: (courseId: string) => Promise<Section>;
  createLesson: (sectionId: string) => Promise<Lesson>;
  renameCourse: (courseId: string, title: string, description: string | null) => Promise<void>;
  renameSection: (sectionId: string, title: string) => Promise<void>;
  saveLesson: (lessonId: string, title: string, content: LessonContent) => Promise<void>;
  moveLesson: (lessonId: string, targetSectionId: string) => Promise<void>;
  reorderLesson: (lessonId: string, dir: -1 | 1) => Promise<void>;
  togglePublish: (courseId: string) => Promise<void>;
  addDependency: (courseId: string, fromSectionId: string, toSectionId: string) => Promise<void>;
  ensureCourseLoaded: (courseId: string) => Promise<void>;
  ensureLessonLoaded: (lessonId: string) => Promise<string | null>;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside StudioProvider");
  return ctx;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(demoMode ? "demo" : null);
  const [isCreator, setIsCreator] = useState(demoMode);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [deps, setDeps] = useState<SectionDependency[]>([]);
  const [loadedCourseIds, setLoadedCourseIds] = useState<string[]>([]);
  const supabase = useMemo(() => createClient(), []);
  const loadedRef = useRef<string[]>([]);
  loadedRef.current = loadedCourseIds;

  // Demo: restore the browser store once, after mount (never during
  // render, so the first paint matches and the seed is not written
  // over the stored snapshot before it is read).
  useEffect(() => {
    if (!demoMode) return;
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidSnapshot(parsed)) {
          // Nuke any demo course that a previous version stored here.
          setCourses(parsed.courses.filter((c) => !NUKED_IDS.has(c.id)));
          setSections(parsed.sections.filter((s) => !NUKED_IDS.has(s.id) && !NUKED_IDS.has(s.course_id)));
          setLessons(parsed.lessons.filter((l) => !NUKED_IDS.has(l.id) && !NUKED_IDS.has(l.section_id)));
          setDeps(parsed.deps.filter((d) => !NUKED_IDS.has(d.id) && !NUKED_IDS.has(d.course_id)));
        }
      }
    } catch {
      // Corrupt snapshot: fall back to the demo seed.
    }
    setHydrated(true);
  }, []);

  // Demo: persist on every change, only after the restore above.
  useEffect(() => {
    if (!demoMode || !hydrated) return;
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ courses, sections, lessons, deps }));
    } catch {
      // Private mode / quota: demo still works for this session.
    }
  }, [demoMode, hydrated, courses, sections, lessons, deps]);

  // Live: auth + creator flag + course list.
  useEffect(() => {
    if (demoMode) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setUserId(user?.id ?? null);
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("is_creator").eq("id", user.id).single();
        setIsCreator(Boolean(profile?.is_creator));
        const { data: courseData } = await supabase
          .from("courses")
          .select("id, creator_id, title, description, published, created_at")
          .eq("creator_id", user.id)
          .order("created_at", { ascending: false });
        setCourses((courseData ?? []) as Course[]);
      }
      setHydrated(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sectionsFor = useCallback(
    (courseId: string) =>
      sections.filter((s) => s.course_id === courseId).sort((a, b) => a.position - b.position),
    [sections],
  );

  const lessonsFor = useCallback(
    (sectionId: string) =>
      lessons.filter((l) => l.section_id === sectionId).sort((a, b) => a.position - b.position),
    [lessons],
  );

  const courseOfLesson = useCallback(
    (lesson: Lesson) => {
      const section = sections.find((s) => s.id === lesson.section_id);
      return section ? courses.find((c) => c.id === section.course_id) : undefined;
    },
    [sections, courses],
  );

  const loadCourseDetailLive = useCallback(
    async (courseId: string) => {
      const { data: secData } = await supabase
        .from("sections")
        .select("id, course_id, title, position")
        .eq("course_id", courseId)
        .order("position", { ascending: true });
      const secs = (secData ?? []) as Section[];
      let les: Lesson[] = [];
      if (secs.length > 0) {
        const { data: lesData } = await supabase
          .from("lessons")
          .select("id, section_id, title, position, content")
          .in("section_id", secs.map((s) => s.id))
          .order("position", { ascending: true });
        les = ((lesData ?? []) as Array<Lesson & { content: unknown }>).map((l) => ({
          ...l,
          content: parseContent(l.content),
        }));
      }
      const { data: depData } = await supabase
        .from("section_dependencies")
        .select("id, course_id, from_section_id, to_section_id")
        .eq("course_id", courseId);
      const secIds = new Set(secs.map((s) => s.id));
      setSections((prev) => [...prev.filter((s) => s.course_id !== courseId), ...secs]);
      setLessons((prev) => [...prev.filter((l) => !secIds.has(l.section_id)), ...les]);
      setDeps((prev) => [...prev.filter((d) => d.course_id !== courseId), ...((depData ?? []) as SectionDependency[])]);
      setLoadedCourseIds((prev) => (prev.includes(courseId) ? prev : [...prev, courseId]));
    },
    [supabase],
  );

  const ensureCourseLoaded = useCallback(
    async (courseId: string) => {
      if (demoMode) return;
      if (loadedRef.current.includes(courseId)) return;
      await loadCourseDetailLive(courseId);
    },
    [demoMode, loadCourseDetailLive],
  );

  const ensureLessonLoaded = useCallback(
    async (lessonId: string): Promise<string | null> => {
      if (demoMode) return null;
      const existing = lessons.find((l) => l.id === lessonId);
      if (existing) {
        const section = sections.find((s) => s.id === existing.section_id);
        return section?.course_id ?? null;
      }
      const { data: lessonRow } = await supabase
        .from("lessons")
        .select("id, section_id")
        .eq("id", lessonId)
        .single();
      if (!lessonRow) return null;
      const { data: sectionRow } = await supabase
        .from("sections")
        .select("id, course_id")
        .eq("id", (lessonRow as { section_id: string }).section_id)
        .single();
      if (!sectionRow) return null;
      const courseId = (sectionRow as { course_id: string }).course_id;
      await loadCourseDetailLive(courseId);
      return courseId;
    },
    [demoMode, lessons, sections, supabase, loadCourseDetailLive],
  );

  const createCourse = useCallback(async (): Promise<Course> => {
    if (demoMode) {
      const course: Course = {
        id: newId(), creator_id: "demo", title: "Untitled course",
        description: null, published: false, created_at: new Date().toISOString(),
      };
      setCourses((cs) => [course, ...cs]);
      return course;
    }
    if (!userId) throw new Error("Not signed in");
    const { data, error: err } = await supabase
      .from("courses")
      .insert({ creator_id: userId, title: "Untitled course", description: null, published: false })
      .select()
      .single();
    if (err) { setError(err.message); throw new Error(err.message); }
    const course = data as Course;
    setCourses((cs) => [course, ...cs]);
    return course;
  }, [demoMode, supabase, userId]);

  const createSection = useCallback(
    async (courseId: string): Promise<Section> => {
      if (demoMode) {
        const section: Section = {
          id: newId(), course_id: courseId, title: "Untitled section",
          position: sectionsFor(courseId).length,
        };
        setSections((ss) => [...ss, section]);
        return section;
      }
      const { data, error: err } = await supabase.from("sections").insert({
        course_id: courseId, title: "Untitled section", position: sectionsFor(courseId).length,
      }).select().single();
      if (err) { setError(err.message); throw new Error(err.message); }
      const section = data as Section;
      setSections((ss) => [...ss, section]);
      return section;
    },
    [demoMode, sectionsFor, supabase],
  );

  const createLesson = useCallback(
    async (sectionId: string): Promise<Lesson> => {
      if (demoMode) {
        const lesson: Lesson = {
          id: newId(), section_id: sectionId, title: "Untitled lesson",
          position: lessonsFor(sectionId).length, content: emptyContent(),
        };
        setLessons((ls) => [...ls, lesson]);
        return lesson;
      }
      const { data, error: err } = await supabase.from("lessons").insert({
        section_id: sectionId, title: "Untitled lesson",
        position: lessonsFor(sectionId).length, content: emptyContent(),
      }).select().single();
      if (err) { setError(err.message); throw new Error(err.message); }
      const lesson = { ...(data as Lesson), content: parseContent((data as { content: unknown }).content) };
      setLessons((ls) => [...ls, lesson]);
      return lesson;
    },
    [demoMode, lessonsFor, supabase],
  );

  const renameCourse = useCallback(
    async (courseId: string, title: string, description: string | null) => {
      if (demoMode) {
        setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, title, description } : c)));
        return;
      }
      const { error: err } = await supabase.from("courses").update({ title, description }).eq("id", courseId);
      if (err) { setError(err.message); return; }
      setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, title, description } : c)));
    },
    [demoMode, supabase],
  );

  const renameSection = useCallback(
    async (sectionId: string, title: string) => {
      if (demoMode) {
        setSections((ss) => ss.map((s) => (s.id === sectionId ? { ...s, title } : s)));
        return;
      }
      const { error: err } = await supabase.from("sections").update({ title }).eq("id", sectionId);
      if (err) { setError(err.message); return; }
      setSections((ss) => ss.map((s) => (s.id === sectionId ? { ...s, title } : s)));
    },
    [demoMode, supabase],
  );

  const saveLesson = useCallback(
    async (lessonId: string, title: string, content: LessonContent) => {
      if (demoMode) {
        setLessons((ls) => ls.map((l) => (l.id === lessonId ? { ...l, title, content } : l)));
        return;
      }
      const { error: err } = await supabase.from("lessons").update({ title, content }).eq("id", lessonId);
      if (err) { setError(err.message); return; }
      setLessons((ls) => ls.map((l) => (l.id === lessonId ? { ...l, title, content } : l)));
    },
    [demoMode, supabase],
  );

  const moveLesson = useCallback(
    async (lessonId: string, targetSectionId: string) => {
      const lesson = lessons.find((l) => l.id === lessonId);
      if (!lesson || lesson.section_id === targetSectionId) return;
      const sourceSectionId = lesson.section_id;
      if (demoMode) {
        // Place the moved lesson at the end of the target section.
        const others = lessons.filter((l) => l.id !== lessonId);
        const target = others.filter((l) => l.section_id === targetSectionId);
        const moved = { ...lesson, section_id: targetSectionId, position: target.length };
        const reordered: Lesson[] = [];
        let inserted = false;
        for (const l of others) {
          reordered.push(l);
          if (!inserted && target.length > 0 && l.id === target[target.length - 1].id) {
            reordered.push(moved);
            inserted = true;
          }
        }
        if (!inserted) reordered.push(moved);
        setLessons(renumberSection(renumberSection(reordered, sourceSectionId), targetSectionId));
        return;
      }
      // Live: move, then renumber both sections in Supabase.
      const { data: targetRows } = await supabase
        .from("lessons").select("id, position").eq("section_id", targetSectionId).order("position", { ascending: true });
      const targetPos = (targetRows ?? []).length;
      const { error: err } = await supabase.from("lessons").update({ section_id: targetSectionId, position: targetPos }).eq("id", lessonId);
      if (err) { setError(err.message); return; }
      const renumber = async (sectionId: string) => {
        const { data: rows } = await supabase
          .from("lessons").select("id").eq("section_id", sectionId).order("position", { ascending: true });
        for (let i = 0; i < (rows ?? []).length; i++) {
          await supabase.from("lessons").update({ position: i }).eq("id", (rows as Array<{ id: string }>)[i].id);
        }
      };
      await renumber(sourceSectionId);
      await renumber(targetSectionId);
      const section = sections.find((s) => s.id === targetSectionId);
      if (section) await loadCourseDetailLive(section.course_id);
    },
    [demoMode, lessons, sections, supabase, loadCourseDetailLive],
  );

  const reorderLesson = useCallback(
    async (lessonId: string, dir: -1 | 1) => {
      const lesson = lessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      const group = lessonsFor(lesson.section_id);
      const idx = group.findIndex((l) => l.id === lessonId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= group.length) return;
      if (demoMode) {
        const swapped = [...group];
        [swapped[idx], swapped[j]] = [swapped[j], swapped[idx]];
        const others = lessons.filter((l) => l.section_id !== lesson.section_id);
        setLessons(renumberSection([...others, ...swapped], lesson.section_id));
        return;
      }
      const swapped = [...group];
      [swapped[idx], swapped[j]] = [swapped[j], swapped[idx]];
      for (let i = 0; i < swapped.length; i++) {
        await supabase.from("lessons").update({ position: i }).eq("id", swapped[i].id);
      }
      const section = sections.find((s) => s.id === lesson.section_id);
      if (section) await loadCourseDetailLive(section.course_id);
    },
    [demoMode, lessons, lessonsFor, sections, supabase, loadCourseDetailLive],
  );

  const togglePublish = useCallback(
    async (courseId: string) => {
      const course = courses.find((c) => c.id === courseId);
      if (!course) return;
      const published = !course.published;
      if (demoMode) {
        setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, published } : c)));
        return;
      }
      const { error: err } = await supabase.from("courses").update({ published }).eq("id", courseId);
      if (err) { setError(err.message); return; }
      setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, published } : c)));
    },
    [demoMode, courses, supabase],
  );

  const addDependency = useCallback(
    async (courseId: string, fromSectionId: string, toSectionId: string) => {
      if (!fromSectionId || !toSectionId || fromSectionId === toSectionId) return;
      if (demoMode) {
        setDeps((ds) => [...ds, { id: newId(), course_id: courseId, from_section_id: fromSectionId, to_section_id: toSectionId }]);
        return;
      }
      const { error: err } = await supabase.from("section_dependencies").insert({
        course_id: courseId, from_section_id: fromSectionId, to_section_id: toSectionId,
      });
      if (err) { setError(err.message); return; }
      await loadCourseDetailLive(courseId);
    },
    [demoMode, supabase, loadCourseDetailLive],
  );

  const value = useMemo(
    () => ({
      demoMode, hydrated, userId, isCreator, error, courses, sections, lessons, deps,
      sectionsFor, lessonsFor, courseOfLesson,
      createCourse, createSection, createLesson, renameCourse, renameSection,
      saveLesson, moveLesson, reorderLesson, togglePublish, addDependency,
      ensureCourseLoaded, ensureLessonLoaded,
    }),
    [
      demoMode, hydrated, userId, isCreator, error, courses, sections, lessons, deps,
      sectionsFor, lessonsFor, courseOfLesson,
      createCourse, createSection, createLesson, renameCourse, renameSection,
      saveLesson, moveLesson, reorderLesson, togglePublish, addDependency,
      ensureCourseLoaded, ensureLessonLoaded,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

// Re-exported so lesson pages can build blocks without importing the
// whole old Studio page. The block model itself lives in lib/content.ts.
export type { LessonBlock };
