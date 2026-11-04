"use client";

// Course overview: plain, flat. Title and description are edited here
// (rename happens on this page, not in a dialog). Sections are a plain
// list; lessons under them link to their standalone pages. Suggested
// path is a plain list too — suggestions only, nothing locks a learner.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useStudio } from "@/lib/studio-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  if (!studio.hydrated) return <p className="text-slate-500">Loading…</p>;
  if (!studio.demoMode && !studio.userId) return <p className="text-slate-600">Please sign in to use the Studio.</p>;
  if (!course) return <p className="text-slate-600">Course not found.</p>;

  const sections = studio.sectionsFor(courseId);
  const courseDeps = studio.deps.filter((d) => d.course_id === courseId);

  const save = async () => {
    await studio.renameCourse(courseId, title.trim() || course.title, description.trim() || null);
    setSaved("Saved.");
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="course-title">Course title</Label>
        <Input
          id="course-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSaved(""); }}
          className="text-2xl font-bold"
        />
        <div className="space-y-2">
          <Label htmlFor="course-description">Description</Label>
          <Textarea
            id="course-description"
            rows={3}
            value={description}
            onChange={(e) => { setDescription(e.target.value); setSaved(""); }}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()}>Save course</Button>
          <Button variant="outline" onClick={() => void studio.togglePublish(courseId)}>
            {course.published ? "Unpublish" : "Publish"}
          </Button>
          <span className="text-sm text-slate-500">{course.published ? "published" : "draft"}</span>
          {saved && <span className="text-sm text-slate-500">{saved}</span>}
        </div>
      </div>

      <hr className="border-base-300" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Sections and lessons</h2>
        {sections.length === 0 && (
          <p className="text-sm text-slate-500">No sections yet. Press + Section next to this course in the sidebar.</p>
        )}
        {sections.map((section) => (
          <div key={section.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{section.title}</span>
              <span className="text-sm text-slate-500">— rename:</span>
              <Input
                aria-label={`Rename section ${section.title}`}
                defaultValue={section.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== section.title) void studio.renameSection(section.id, v);
                }}
                className="max-w-xs"
              />
            </div>
            <ul className="ml-4 space-y-1">
              {studio.lessonsFor(section.id).map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/studio/courses/${courseId}/lessons/${lesson.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {lesson.title}
                  </Link>
                </li>
              ))}
              {studio.lessonsFor(section.id).length === 0 && (
                <li className="text-sm text-slate-500">No lessons yet — press + Lesson under this section in the sidebar.</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <hr className="border-base-300" />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Suggested path</h2>
        <p className="text-sm text-slate-500">Suggestions only. Nothing locks a learner.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600" htmlFor="dep-from">From section</label>
          <select
            id="dep-from"
            value={depFrom}
            onChange={(e) => setDepFrom(e.target.value)}
            className="select select-bordered select-sm bg-white shadow-none"
          >
            <option value="">From section…</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <span className="text-sm text-slate-500">→ suggested next →</span>
          <label className="text-sm text-slate-600" htmlFor="dep-to">To section</label>
          <select
            id="dep-to"
            value={depTo}
            onChange={(e) => setDepTo(e.target.value)}
            className="select select-bordered select-sm bg-white shadow-none"
          >
            <option value="">To section…</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <Button
            variant="outline"
            onClick={() => { void studio.addDependency(courseId, depFrom, depTo); setDepFrom(""); setDepTo(""); }}
          >
            Add suggestion
          </Button>
        </div>
        <ul className="space-y-1">
          {courseDeps.map((d) => {
            const from = sections.find((s) => s.id === d.from_section_id);
            const to = sections.find((s) => s.id === d.to_section_id);
            return (
              <li key={d.id} className="text-sm text-slate-600">
                {from?.title ?? "?"} → suggested next: {to?.title ?? "?"}
              </li>
            );
          })}
        </ul>
      </div>
      {studio.error && <p className="text-sm text-red-700">{studio.error}</p>}
    </div>
  );
}
