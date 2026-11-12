// Get-started checklist progress, shared by the full checklist
// (TeacherChecklist) and the compact sidebar indicator (StudioShell),
// so the two can never disagree about the count.
//
// Steps 1, 2, 3 and 5 are auto-detected from real Studio state.
// Step 2 ticks ONLY when a lesson has a playable video — a Mux
// playback id or a locally saved take — never for an empty video
// block. Step 4 (Preview as learner) is recorded, not manual-only:
// clicking a "Preview as learner" link records it, and visiting a
// learner course/lesson page in demo mode records it too (in demo
// mode this browser IS the teacher's browser). The circle toggle
// remains for un-ticking it by hand.
//
// Which course the checklist names: the last-touched course — the
// one the teacher most recently created, renamed, published, or
// edited a section/lesson in (localStorage
// `curi-studio-last-course-v1`, kept in the Studio store). An empty
// just-created draft does not steal the naming from a course with
// real work: the last-touched course WITH a section/lesson (or
// published) wins. Fallback is the first course. Naming the first
// course misled as soon as a second course existed (it named an
// empty "Untitled course" while the real course was published).

import { isPlayableVideoBlock, type Course, type Lesson } from "@/lib/content";

export const CHECKLIST_TOTAL = 5;
export const CHECKLIST_STORAGE_KEY = "curi-teacher-checklist-v1";

export type ChecklistSteps = {
  hasCourse: boolean;
  hasPlayableVideo: boolean;
  hasQuiz: boolean;
  previewDone: boolean;
  isPublished: boolean;
};

export function computeChecklistSteps(
  courses: Course[],
  lessons: Lesson[],
  previewDone: boolean,
): ChecklistSteps {
  return {
    hasCourse: courses.length > 0,
    hasPlayableVideo: lessons.some((l) =>
      l.content.blocks.some((b) => b.kind === "video" && isPlayableVideoBlock(b)),
    ),
    hasQuiz: lessons.some((l) => l.content.blocks.some((b) => b.kind === "quiz")),
    previewDone,
    isPublished: courses.some((c) => c.published),
  };
}

// The course the checklist names and links to: the last-touched
// one if it still exists, else the first course. When a hasContent
// check is given, an empty just-created draft does not steal the
// naming from a course with real work in it — the last-touched
// course WITH content wins, falling back to the last-touched one.
export function relevantCourse(
  courses: Course[],
  lastCourseId: string | null,
  hasContent?: (course: Course) => boolean,
): Course | undefined {
  const lastTouched = courses.find((c) => c.id === lastCourseId);
  if (!hasContent) return lastTouched ?? courses[0];
  if (lastTouched && hasContent(lastTouched)) return lastTouched;
  return courses.find(hasContent) ?? lastTouched ?? courses[0];
}

export function checklistDoneCount(steps: ChecklistSteps): number {
  return [steps.hasCourse, steps.hasPlayableVideo, steps.hasQuiz, steps.previewDone, steps.isPublished].filter(
    Boolean,
  ).length;
}

// The manual step-4 tick, stored in this browser only. Read lazily so
// server rendering never touches window.
export function readPreviewDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { manual?: { preview?: unknown } };
    return Boolean(parsed.manual?.preview);
  } catch {
    return false;
  }
}

export function writePreviewDone(done: boolean): void {
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      CHECKLIST_STORAGE_KEY,
      JSON.stringify({ ...parsed, manual: { preview: done } }),
    );
  } catch {
    // Private mode / quota: the tick still works for this session.
  }
}
