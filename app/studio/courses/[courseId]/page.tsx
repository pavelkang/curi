"use client";

// Course overview: plain, flat. Title and description are edited here
// (rename happens on this page, not in a dialog). Sections are a plain
// list; lessons under them link to their standalone pages. Suggested
// path is a plain list too — suggestions only, nothing locks a learner.

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useStudio } from "@/lib/studio-store";
import { titleFocusHandlers } from "@/lib/title-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Heading } from "@astryxdesign/core/Heading";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

function SectionRename({
  title,
  onRename,
}: {
  title: string;
  onRename: (v: string) => void;
}) {
  const [value, setValue] = useState(title);
  // "Saved." after a blur-commit, like the lesson editor's indicator
  // — a silent blur-save lost renames with no feedback.
  const [saved, setSaved] = useState(false);
  const commit = () => {
    const v = value.trim();
    if (v && v !== title) {
      onRename(v);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    }
  };
  return (
    <span className="flex items-center gap-2">
      {/* Select-all while the section still has its default title, so
          click-and-type replaces "Untitled section" instead of
          appending to it (lib/title-input.ts). */}
      <span className="block max-w-xs" {...titleFocusHandlers("Untitled section")}>
        <Input
          label={`Rename section ${title}`}
          isLabelHidden
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          onBlur={commit}
          onKeyDown={(e) => {
            // Enter commits the rename instead of waiting for a blur
            // that may never come before navigating away.
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="max-w-xs"
        />
      </span>
      {saved && <span className="text-sm text-secondary">Saved.</span>}
    </span>
  );
}

export default function StudioCoursePage() {
  const params = useParams();
  const courseId = String(params.courseId);
  const studio = useStudio();
  const course = studio.courses.find((c) => c.id === courseId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [syncedFor, setSyncedFor] = useState("");
  const [depFrom, setDepFrom] = useState("");
  const [depTo, setDepTo] = useState("");
  const [saved, setSaved] = useState("");
  // Local mounted flag, not the store's `hydrated` — see StudioShell.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!studio.demoMode) void studio.ensureCourseLoaded(courseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (course && syncedFor !== course.id) {
      setTitle(course.title);
      setDescription(course.description ?? "");
      setSyncedFor(course.id);
    }
  }, [course, syncedFor]);

  if (!mounted) return <Text type="supporting">Loading…</Text>;
  if (!studio.demoMode && !studio.userId) return <Text>Please sign in to use the Studio.</Text>;
  if (!course) return <Text>Course not found.</Text>;

  const sections = studio.sectionsFor(courseId);
  const courseDeps = studio.deps.filter((d) => d.course_id === courseId);
  const lessonCount = sections.reduce((n, s) => n + studio.lessonsFor(s.id).length, 0);

  // Same wording as the lesson page: show whether title/description
  // edits are saved yet. Section renames save on blur (or Enter) and
  // show "Saved." next to the field, like the lesson editor.
  const courseDirty =
    syncedFor === course.id &&
    (title !== course.title || description !== (course.description ?? ""));

  const save = async () => {
    await studio.renameCourse(courseId, title.trim() || course.title, description.trim() || null);
    setSaved("Saved.");
  };

  const publish = async () => {
    if (!course.published && lessonCount === 0) {
      const ok = window.confirm("This course has no lessons yet. Publish it anyway?");
      if (!ok) return;
    }
    await studio.togglePublish(courseId);
  };

  return (
    <VStack gap={6}>
      <VStack gap={3}>
        {/* Select-all while the course still has its default title, so
            click-and-type replaces "Untitled course" instead of
            appending to it (lib/title-input.ts). No autosave here —
            Save course still commits — so selection changes nothing
            about when the title is stored. */}
        <div {...titleFocusHandlers("Untitled course")}>
          <Input
            label="Course title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setSaved(""); }}
            controlClassName="text-2xl font-bold"
          />
        </div>
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(""); }}
        />
        <div className="flex items-center gap-3">
          <Button label="Save course" onClick={() => void save()} />
          <Button
            label={course.published ? "Unpublish" : "Publish"}
            variant="secondary"
            onClick={() => void publish()}
          />
          <AstryxLink
            href={`/courses/${courseId}`}
            target="_blank"
            onClick={() => studio.setPreviewDone(true)}
          >
            Preview as learner ↗
          </AstryxLink>
          <Text type="supporting">{course.published ? "published" : "draft"}</Text>
          {courseDirty ? (
            <Text weight="semibold">Unsaved changes</Text>
          ) : (
            saved && <Text type="supporting">{saved}</Text>
          )}
        </div>
      </VStack>

      <hr className="border-border" />

      <VStack gap={4}>
        <Heading level={3}>Sections and lessons</Heading>
        {sections.length === 0 && (
          <Text type="supporting">No sections yet. Press + Section next to this course in the sidebar.</Text>
        )}
        {sections.map((section) => (
          <div key={section.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">{section.title}</span>
              <span className="text-sm text-secondary">— rename:</span>
              <SectionRename title={section.title} onRename={(v) => void studio.renameSection(section.id, v)} />
            </div>
            <ul className="ml-4 space-y-1">
              {studio.lessonsFor(section.id).map((lesson) => (
                <li key={lesson.id}>
                  <AstryxLink href={`/studio/courses/${courseId}/lessons/${lesson.id}`}>
                    {lesson.title}
                  </AstryxLink>
                </li>
              ))}
              {studio.lessonsFor(section.id).length === 0 && (
                <li className="text-sm text-secondary">No lessons yet — press + Lesson under this section in the sidebar.</li>
              )}
            </ul>
          </div>
        ))}
      </VStack>

      {/* Suggested path only makes sense once there are at least two
          sections to connect — before that it is empty dropdowns. */}
      {sections.length >= 2 && (
        <>
          <hr className="border-border" />

          <VStack gap={3}>
            <Heading level={3}>Suggested path</Heading>
            <Text type="supporting">Suggestions only. Nothing locks a learner.</Text>
            <div className="flex flex-wrap items-center gap-2">
              <Selector
                label="From section"
                isLabelHidden
                value={depFrom}
                onChange={setDepFrom}
                options={[{ value: "", label: "From section…" }, ...sections.map((s) => ({ value: s.id, label: s.title }))]}
                width={220}
              />
              <span className="text-sm text-secondary">→</span>
              <Selector
                label="To section"
                isLabelHidden
                value={depTo}
                onChange={setDepTo}
                options={[{ value: "", label: "To section…" }, ...sections.map((s) => ({ value: s.id, label: s.title }))]}
                width={220}
              />
              <Button
                label="Add suggestion"
                variant="secondary"
                onClick={() => { void studio.addDependency(courseId, depFrom, depTo); setDepFrom(""); setDepTo(""); }}
              />
            </div>
            <ul className="space-y-1">
              {courseDeps.map((d) => {
                const from = sections.find((s) => s.id === d.from_section_id);
                const to = sections.find((s) => s.id === d.to_section_id);
                return (
                  <li key={d.id} className="text-sm text-secondary">
                    {from?.title ?? "?"} → suggested next: {to?.title ?? "?"}
                  </li>
                );
              })}
            </ul>
          </VStack>
        </>
      )}
      {studio.error && <p className="text-sm text-error">{studio.error}</p>}
    </VStack>
  );
}
