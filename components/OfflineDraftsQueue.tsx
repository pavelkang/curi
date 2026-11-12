"use client";

// Offline drafts queue — status, not paragraphs.
//
// Shared web code — lives in ~/workspace/curi, NOT in curi-desktop.
// It reuses the existing Studio store (lib/studio-store.tsx); it does
// NOT create a second content model.
//
// Demo mode (no Supabase connected): every course and lesson created in
// this browser exists only here, listed as "In this browser".
// Live mode (Supabase connected): there is NO offline queue — Studio
// saves straight to Supabase, and this panel says exactly that.
//
// Rule: a published course is NOT a draft. Published courses — and
// their lessons — are excluded from this list; they live on the learner
// home page instead. Only unpublished courses and their lessons (plus
// any orphan lesson with no course) count as offline drafts.

import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useStudio } from "@/lib/studio-store";

function blockSummary(lesson: { content: { blocks: Array<{ kind: string; caption_text?: string }> } }) {
  const blocks = lesson.content.blocks;
  const videos = blocks.filter((b) => b.kind === "video").length;
  const quizzes = blocks.filter((b) => b.kind === "quiz").length;
  const parts = [`${blocks.length} block${blocks.length === 1 ? "" : "s"}`];
  if (videos > 0) parts.push(`${videos} video`);
  if (quizzes > 0) parts.push(`${quizzes} quiz`);
  return parts.join(" · ");
}

export default function OfflineDraftsQueue() {
  const studio = useStudio();

  if (!studio.demoMode) {
    return (
      <section aria-label="Offline drafts queue" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <VStack gap={1}>
          <Heading level={3}>Offline drafts</Heading>
          <Text type="supporting">
            Saved to Supabase — no queue. {studio.courses.length} courses · {studio.lessons.length} lessons in this session.
          </Text>
        </VStack>
      </section>
    );
  }

  // Published is not a draft: exclude published courses and the
  // lessons that belong to them (see header comment). An orphan lesson
  // with no course stays listed — it has nowhere else to be found.
  const draftCourses = studio.courses.filter((c) => !c.published);
  const draftLessons = studio.lessons.filter((l) => {
    const course = studio.courseOfLesson(l);
    return !course || !course.published;
  });
  const queuedCount = draftCourses.length + draftLessons.length;

  return (
    <section aria-label="Offline drafts queue" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <VStack gap={3}>
        <div className="flex items-center gap-2">
          <Heading level={3}>Offline drafts</Heading>
          {queuedCount > 0 && <Badge label={`${queuedCount} in this browser`} variant="neutral" />}
        </div>
        {queuedCount === 0 ? (
          <Text type="supporting">No offline drafts yet.</Text>
        ) : (
          <>
            <Text type="supporting">Saved in this browser only.</Text>
            <ul className="space-y-2">
            {draftCourses.map((course) => (
              <li key={course.id} className="flex items-start justify-between gap-3 border-t border-border pt-2">
                <div className="min-w-0">
                  <Link href={`/studio/courses/${course.id}`}>{course.title}</Link>
                  {/* Plain div, not Astryx Text: Text styles its element
                      inline even with as="div", which ran the meta into
                      the title on one line. */}
                  <div className="text-sm text-secondary">Course · {course.published ? "published" : "draft"}</div>
                </div>
                <Badge label="In this browser" variant="neutral" />
              </li>
            ))}
            {draftLessons.map((lesson) => {
              const course = studio.courseOfLesson(lesson);
              const section = studio.sections.find((s) => s.id === lesson.section_id);
              return (
                <li key={lesson.id} className="flex items-start justify-between gap-3 border-t border-border pt-2">
                  <div className="min-w-0">
                    <Link href={course ? `/studio/courses/${course.id}/lessons/${lesson.id}` : "/studio"}>
                      {lesson.title}
                    </Link>
                    {/* Plain div, not Astryx Text (see course row above). */}
                    <div className="text-sm text-secondary">
                      Lesson{course ? ` · ${course.title}` : ""}
                      {section ? ` · ${section.title}` : ""} · {blockSummary(lesson)}
                    </div>
                  </div>
                  <Badge label="In this browser" variant="neutral" />
                </li>
              );
            })}
            </ul>
          </>
        )}
      </VStack>
    </section>
  );
}
