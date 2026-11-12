"use client";

// First-run teacher checklist — progress-first, almost no copy.
//
// Shared web code — lives in ~/workspace/curi, NOT in curi-desktop.
// Electron stays a thin shell and loads this page from the bundled app.
//
// Honesty, in one line each: steps 1, 2, 3 and 5 are auto-detected from
// real Studio state; step 4 (Preview as learner) is recorded when the
// teacher opens the learner view — the step-4 link, a Studio "Preview
// as learner" button, or visiting a learner page in demo mode — and
// the circle still toggles it by hand. Step 2 ticks only for a lesson
// with a playable video (a Mux playback id or a locally saved take),
// never for an empty video block. In demo mode Publish only flips
// the local flag; the step-5 note says so. Steps name the
// last-touched course (lib/checklist.ts), not the first course.
// Progress is computed by lib/checklist.ts, shared with the compact
// sidebar indicator in StudioShell so the two can never disagree.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { isPlayableVideoBlock } from "@/lib/content";
import { checklistDoneCount, CHECKLIST_TOTAL, computeChecklistSteps, relevantCourse } from "@/lib/checklist";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

const CHECKLIST_STORAGE_KEY = "curi-teacher-checklist-v1";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) return false;
    return Boolean((JSON.parse(raw) as { dismissed?: unknown }).dismissed);
  } catch {
    return false;
  }
}

function writeDismissed(dismissed: boolean) {
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      CHECKLIST_STORAGE_KEY,
      JSON.stringify({ ...parsed, dismissed }),
    );
  } catch {
    // Private mode / quota: the panel still works for this session.
  }
}

export default function TeacherChecklist() {
  const studio = useStudio();
  const router = useRouter();
  // Lazy initializer (not a setState-in-effect): the component is
  // loaded with ssr:false from the Studio home page, so window exists
  // here and there is no server/client mismatch to hydrate.
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  // Live mode: load every course's detail so steps 2-3 can be
  // auto-detected from real state. Demo mode already holds all
  // sections/lessons in the store, so this is a no-op there.
  useEffect(() => {
    if (studio.demoMode || !studio.hydrated) return;
    for (const course of studio.courses) void studio.ensureCourseLoaded(course.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio.demoMode, studio.hydrated, studio.courses.length]);

  const dismiss = (next: boolean) => {
    setDismissed(next);
    writeDismissed(next);
  };

  if (!studio.hydrated) return null;

  if (dismissed) {
    return (
      <Button
        label="Show the get-started checklist"
        variant="ghost"
        size="sm"
        onClick={() => dismiss(false)}
      />
    );
  }

  const steps = computeChecklistSteps(studio.courses, studio.lessons, studio.previewDone);
  const doneCount = checklistDoneCount(steps);
  const { hasCourse, hasPlayableVideo, hasQuiz, previewDone, isPublished } = steps;

  // Named course: the last-touched one (see lib/checklist.ts), not
  // the first — with two courses the first can be an empty draft.
  // Steps 2/3 link to lessons of that course when it has any.
  const firstCourse = relevantCourse(studio.courses, studio.lastCourseId, (c) =>
    c.published || studio.sectionsFor(c.id).length > 0,
  );
  const relevantSectionIds = new Set(
    firstCourse ? studio.sectionsFor(firstCourse.id).map((s) => s.id) : [],
  );
  const relevantLessons = studio.lessons.filter((l) => relevantSectionIds.has(l.section_id));
  const lessons = relevantLessons.length > 0 ? relevantLessons : studio.lessons;
  const firstLessonWithVideo =
    lessons.find((l) =>
      l.content.blocks.some((b) => b.kind === "video" && isPlayableVideoBlock(b)),
    ) ??
    lessons.find((l) => l.content.blocks.some((b) => b.kind === "video"));
  const firstLessonWithQuiz = lessons.find((l) =>
    l.content.blocks.some((b) => b.kind === "quiz"),
  );
  const firstLesson = firstLessonWithVideo ?? firstLessonWithQuiz ?? lessons[0];
  const firstLessonCourse = firstLesson ? studio.courseOfLesson(firstLesson) : undefined;
  const lessonHref = (lessonId: string, courseId: string) =>
    `/studio/courses/${courseId}/lessons/${lessonId}`;

  const onCreateCourse = async () => {
    const course = await studio.createCourse();
    router.push(`/studio/courses/${course.id}`);
  };

  // One circle per step, done or not — step 4's toggle is the same
  // circle, not a square checkbox.
  const circle = (done: boolean, onToggle?: () => void) => {
    const inner = (
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-accent-bg text-on-accent" : "border border-border text-secondary"
        }`}
      >
        {done && <Check className="h-4 w-4" aria-hidden />}
      </span>
    );
    if (!onToggle) return inner;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label="Preview as learner done"
        onClick={onToggle}
        className="flex shrink-0 cursor-pointer rounded-full"
      >
        {inner}
      </button>
    );
  };

  const step = (done: boolean, title: string, action: React.ReactNode) => (
    <li className="flex items-center gap-3">
      {circle(done)}
      <span className="min-w-0 flex-1">
        <Text weight="semibold">{title}</Text>
      </span>
      <span className="shrink-0">{action}</span>
    </li>
  );

  return (
    <section aria-label="Get started checklist" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <VStack gap={3}>
        <div className="flex items-start justify-between gap-3">
          <Heading level={3}>Get started</Heading>
          <Button
            label="Dismiss"
            variant="ghost"
            size="sm"
            onClick={() => dismiss(true)}
          />
        </div>
        <ProgressBar
          label="Get started checklist progress"
          value={doneCount}
          max={CHECKLIST_TOTAL}
          isLabelHidden
          hasValueLabel
          formatValueLabel={(v, m) => `${v} of ${m} done`}
        />
        <ol className="space-y-3">
          {step(
            hasCourse,
            "1. Create a course",
            hasCourse && firstCourse ? (
              <AstryxLink href={`/studio/courses/${firstCourse.id}`}>{firstCourse.title}</AstryxLink>
            ) : (
              <Button label="Create a course" size="sm" onClick={() => void onCreateCourse()} />
            ),
          )}
          {step(
            hasPlayableVideo,
            "2. Record a lesson",
            firstLesson && firstLessonCourse ? (
              <AstryxLink href={lessonHref(firstLesson.id, firstLessonCourse.id)}>{firstLesson.title}</AstryxLink>
            ) : firstCourse ? (
              <AstryxLink href={`/studio/courses/${firstCourse.id}`}>{firstCourse.title}</AstryxLink>
            ) : (
              <Text type="supporting">Create a course first</Text>
            ),
          )}
          {step(
            hasQuiz,
            "3. Add a quiz",
            firstLessonWithQuiz && studio.courseOfLesson(firstLessonWithQuiz) ? (
              <AstryxLink
                href={lessonHref(firstLessonWithQuiz.id, studio.courseOfLesson(firstLessonWithQuiz)!.id)}
              >
                {firstLessonWithQuiz.title}
              </AstryxLink>
            ) : firstLesson && firstLessonCourse ? (
              <AstryxLink href={lessonHref(firstLesson.id, firstLessonCourse.id)}>{firstLesson.title}</AstryxLink>
            ) : firstCourse ? (
              <AstryxLink href={`/studio/courses/${firstCourse.id}`}>{firstCourse.title}</AstryxLink>
            ) : (
              <Text type="supporting">Create a course first</Text>
            ),
          )}
          {/* Step 4: the WHOLE row (label + course name) is the preview
              link — previously only the course name on the right was
              clickable, so the affordance was easy to miss. The circle
              stays separate: it is the manual done/undone toggle, not
              part of the link (a button inside a link is invalid, and
              toggling must not open a tab). Plain spans, not Astryx
              Text, so the link colour is not overridden inline. */}
          <li className="flex items-center gap-3">
            {circle(previewDone, () => studio.setPreviewDone(!previewDone))}
            {firstCourse ? (
              <a
                href={`/courses/${firstCourse.id}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Preview ${firstCourse.title} as learner`}
                onClick={() => studio.setPreviewDone(true)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-accent hover:underline"
              >
                <span className="min-w-0 flex-1 font-semibold">4. Preview as learner</span>
                <span className="min-w-0 shrink-0 truncate">{firstCourse.title} ↗</span>
              </a>
            ) : (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="min-w-0 flex-1 font-semibold">4. Preview as learner</span>
                <span className="shrink-0 text-sm text-secondary">Create a course first</span>
              </span>
            )}
          </li>
          {step(
            isPublished,
            "5. Publish",
            firstCourse ? (
              <AstryxLink href={`/studio/courses/${firstCourse.id}`}>{firstCourse.title}</AstryxLink>
            ) : (
              <Text type="supporting">Create a course first</Text>
            ),
          )}
        </ol>
        {studio.demoMode && (
          <Text type="supporting">Demo: publish stays in this browser.</Text>
        )}
      </VStack>
    </section>
  );
}
