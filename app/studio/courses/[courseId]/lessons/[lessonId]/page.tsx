"use client";

// Standalone lesson page: ONLY this lesson. No course editor, no
// section editor, no cards around it — title at the top, then blocks
// separated by plain dividers. Rename is the title input itself.
// "Move to section" moves the lesson to another section in the same
// course (end of that section); Move up / Move down reorder it inside
// its current section. Edits are local until Save lesson.

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEMO_STORE_NOTE, useStudio } from "@/lib/studio-store";
import {
  emptyContent, newId,
  type LessonBlock, type LessonContent,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import Recorder from "@/components/Recorder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectClass = "select select-bordered select-sm bg-white shadow-none";

export default function StudioLessonPage() {
  const params = useParams();
  const courseId = String(params.courseId);
  const lessonId = String(params.lessonId);
  const studio = useStudio();
  const lesson = studio.lessons.find((l) => l.id === lessonId);
  const section = lesson ? studio.sections.find((s) => s.id === lesson.section_id) : undefined;
  const courseSections = studio.sectionsFor(courseId);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState<LessonContent>(emptyContent());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const syncedRef = useRef("");

  useEffect(() => {
    if (!studio.demoMode) void studio.ensureLessonLoaded(lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  useEffect(() => {
    if (lesson && syncedRef.current !== lesson.id) {
      setTitle(lesson.title);
      setContent(lesson.content);
      syncedRef.current = lesson.id;
    }
  }, [lesson]);

  if (!studio.hydrated) return <p className="text-slate-500">Loading…</p>;
  if (!studio.demoMode && !studio.userId) return <p className="text-slate-600">Please sign in to use the Studio.</p>;
  if (!lesson) return <p className="text-slate-600">Lesson not found.</p>;

  const group = section ? studio.lessonsFor(section.id) : [];
  const idx = group.findIndex((l) => l.id === lessonId);

  const save = async () => {
    await studio.saveLesson(lessonId, title.trim() || lesson.title, content);
    setStatus(studio.demoMode ? DEMO_STORE_NOTE : "Lesson saved.");
  };

  const addBlock = (kind: "video" | "markdown" | "quiz") => {
    let block: LessonBlock;
    if (kind === "video") block = { kind, id: newId() };
    else if (kind === "markdown") block = { kind, id: newId(), markdown: "" };
    else block = { kind, id: newId(), questions: [{ id: newId(), prompt: "", options: ["", "", "", ""], correct_index: 0, explanation: "" }] };
    setContent((c) => ({ ...c, blocks: [...c.blocks, block] }));
    setStatus("");
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    setContent((c) => {
      const blocks = [...c.blocks];
      const j = index + dir;
      if (j < 0 || j >= blocks.length) return c;
      [blocks[index], blocks[j]] = [blocks[j], blocks[index]];
      return { ...c, blocks };
    });
  };

  const updateBlock = (index: number, patch: Partial<LessonBlock>) => {
    setContent((c) => ({
      ...c,
      blocks: c.blocks.map((b, i) => (i === index ? ({ ...b, ...patch } as LessonBlock) : b)),
    }));
  };

  const uploadFile = async (file: File) => {
    if (studio.demoMode) {
      setError("Demo mode: video upload needs Mux and Supabase. Changes here are not saved.");
      setUploadStatus("");
      return;
    }
    setUploadStatus("Creating Mux upload…");
    setError("");
    try {
      const res = await fetch("/api/mux/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (!res.ok) throw new Error(`Upload creation failed (${res.status}): ${await res.text()}`);
      const { uploadUrl } = (await res.json()) as { uploadUrl: string; uploadId: string };
      setUploadStatus("Uploading to Mux…");
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`Mux upload failed (${put.status})`);
      setUploadStatus("Uploaded. Mux is processing. Playback will appear after the webhook stores it, or paste the playback id manually below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setUploadStatus("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="lesson-title">Lesson title</Label>
        <Input
          id="lesson-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setStatus(""); }}
          className="text-2xl font-bold"
        />
        <p className="text-sm text-slate-500">
          In section: {section?.title ?? "—"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600" htmlFor="move-to-section">Move to section</label>
          <select
            id="move-to-section"
            aria-label="Move to section"
            value={lesson.section_id}
            onChange={(e) => { void studio.moveLesson(lessonId, e.target.value); setStatus(""); }}
            className={selectClass}
          >
            {courseSections.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" disabled={idx <= 0} onClick={() => void studio.reorderLesson(lessonId, -1)}>
            Move up
          </Button>
          <Button variant="outline" size="sm" disabled={idx < 0 || idx >= group.length - 1} onClick={() => void studio.reorderLesson(lessonId, 1)}>
            Move down
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => addBlock("video")}>+ Video block</Button>
          <Button variant="outline" onClick={() => addBlock("markdown")}>+ Markdown block</Button>
          <Button variant="outline" onClick={() => addBlock("quiz")}>+ Quiz block</Button>
          <Button onClick={() => void save()}>Save lesson</Button>
          {status && <span className="text-sm text-slate-500">{status}</span>}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {studio.error && <p className="text-sm text-red-700">{studio.error}</p>}
      </div>

      {content.blocks.map((block, bi) => (
        <section key={block.id} className="space-y-4 border-t border-base-300 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold capitalize text-slate-900">{block.kind} block</h3>
            <Button variant="outline" size="sm" onClick={() => moveBlock(bi, -1)}>↑</Button>
            <Button variant="outline" size="sm" onClick={() => moveBlock(bi, 1)}>↓</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setContent((c) => ({ ...c, blocks: c.blocks.filter((_, i) => i !== bi) }))}
            >
              Delete
            </Button>
          </div>

          {block.kind === "video" && (
            <div className="space-y-3">
              <Input placeholder="Video title (optional)" value={block.title ?? ""} onChange={(e) => updateBlock(bi, { title: e.target.value })} />
              <Input placeholder="Mux playback id (paste manually, or filled by webhook)" value={block.mux_playback_id ?? ""} onChange={(e) => updateBlock(bi, { mux_playback_id: e.target.value })} />
              <Input placeholder="Mux asset id (optional)" value={block.mux_asset_id ?? ""} onChange={(e) => updateBlock(bi, { mux_asset_id: e.target.value })} />
              <Input placeholder="Caption file URL (optional, public VTT/SRT)" value={block.caption_track_url ?? ""} onChange={(e) => updateBlock(bi, { caption_track_url: e.target.value })} />
              <div className="space-y-2">
                <Label>Edited captions (WebVTT text, optional)</Label>
                <Textarea
                  rows={6}
                  value={block.caption_text ?? ""}
                  onChange={(e) => updateBlock(bi, { caption_text: e.target.value })}
                  placeholder={"WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello."}
                />
              </div>
              <p className="text-sm text-slate-500">
                Edited VTT text is stored in this lesson and played from the lesson page.
                It is not automatically pushed to Mux, because Mux&apos;s track API needs a public VTT URL. See README.
              </p>
              <div className="space-y-2">
                <Label>Upload your own video file</Label>
                <Input type="file" accept="video/*" disabled={studio.demoMode} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }} />
                {studio.demoMode && <p className="text-sm text-slate-500">Upload is disabled in demo mode.</p>}
              </div>
              {uploadStatus && <p className="text-sm text-slate-500">{uploadStatus}</p>}
              <Recorder lessonId={lesson.id} />
            </div>
          )}

          {block.kind === "markdown" && (
            <div className="space-y-3">
              <Textarea rows={8} value={block.markdown} onChange={(e) => updateBlock(bi, { markdown: e.target.value })} />
              <p className="text-sm font-medium">Preview</p>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown) }} />
            </div>
          )}

          {block.kind === "quiz" && (
            <div className="space-y-4">
              <Input placeholder="Quiz title (optional)" value={block.title ?? ""} onChange={(e) => updateBlock(bi, { title: e.target.value })} />
              {block.questions.map((q, qi) => (
                <div key={q.id} className="space-y-2 border-t border-base-200 pt-4">
                  <Input placeholder="Question prompt" value={q.prompt} onChange={(e) => {
                    const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, prompt: e.target.value } : qq));
                    updateBlock(bi, { questions });
                  }} />
                  {q.options.map((opt, oi) => (
                    <Input key={oi} placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => {
                      const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, options: qq.options.map((o, k) => (k === oi ? e.target.value : o)) } : qq));
                      updateBlock(bi, { questions });
                    }} />
                  ))}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600" htmlFor={`correct-${block.id}-${qi}`}>Correct option</label>
                    <select
                      id={`correct-${block.id}-${qi}`}
                      value={String(q.correct_index)}
                      onChange={(e) => {
                        const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, correct_index: Number(e.target.value) } : qq));
                        updateBlock(bi, { questions });
                      }}
                      className={selectClass}
                    >
                      {[0, 1, 2, 3].map((n) => <option key={n} value={n}>Option {n + 1}</option>)}
                    </select>
                  </div>
                  <Input placeholder="Explanation (shown after answering)" value={q.explanation} onChange={(e) => {
                    const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, explanation: e.target.value } : qq));
                    updateBlock(bi, { questions });
                  }} />
                  <Button variant="outline" size="sm" onClick={() => {
                    const questions = block.questions.filter((_, j) => j !== qi);
                    updateBlock(bi, { questions });
                  }}>Delete question</Button>
                </div>
              ))}
              <Button variant="outline" onClick={() => {
                const questions = [...block.questions, { id: newId(), prompt: "", options: ["", "", "", ""], correct_index: 0, explanation: "" }];
                updateBlock(bi, { questions });
              }}>+ Add question (MCQ only)</Button>
            </div>
          )}
        </section>
      ))}

      {content.blocks.length > 0 && (
        <div className="border-t border-base-300 pt-6">
          <Button onClick={() => void save()}>Save lesson</Button>
          {status && <span className="ml-3 text-sm text-slate-500">{status}</span>}
        </div>
      )}
    </div>
  );
}
