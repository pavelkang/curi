"use client";

// Standalone lesson page: ONLY this lesson. No course editor, no
// section editor, no cards around it — title at the top, then blocks
// separated by plain dividers. Rename is the title input itself.
// "Move to section" moves the lesson to another section in the same
// course (end of that section); Move up / Move down reorder it inside
// its current section.
//
// Saving: edits autosave 1 s after the last change, and "Save
// lesson" saves now — so a block, a take or a rename can no longer
// vanish on reload or navigation. The page still shows whether
// there are unsaved changes, and leaving with unsaved changes warns
// first (beforeunload). Limit: a reload inside the 1 s autosave
// window can still lose the last keystroke; beforeunload warns then.
// Course title / description use the same "Unsaved changes" /
// "Saved." wording on the course page; section renames save on blur
// (or Enter) and show "Saved." next to the field.
//
// Video in demo mode: a picked file or a recorded take is saved in
// this browser (IndexedDB, lib/local-video.ts) and plays in the
// lesson player. Mux fields live behind one collapsed "Advanced video
// settings" section, in plain words.

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/studio-store";
import { titleFocusHandlers } from "@/lib/title-input";

// TLDraw needs the browser; load whiteboard UI client-only.
const WhiteboardEditor = dynamic(() => import("@/components/WhiteboardEditor"), { ssr: false });
const WhiteboardRecorder = dynamic(() => import("@/components/WhiteboardRecorder"), { ssr: false });
import {
  emptyContent, newId,
  type LessonBlock, type LessonContent,
} from "@/lib/content";
import { deleteLocalVideo, getLocalVideoUrl, LOCAL_VIDEO_NOTE, saveLocalVideo } from "@/lib/local-video";
import { renderMarkdown } from "@/lib/markdown";
import Recorder from "@/components/Recorder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Selector } from "@astryxdesign/core/Selector";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

// Preview of a locally saved take inside the editor.
function LocalTakePreview({ videoId, onRemove }: { videoId: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getLocalVideoUrl(videoId)
      .then((u) => {
        if (!cancelled) {
          objectUrl = u;
          setUrl(u);
        }
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoId]);
  if (!url) return <Text type="supporting">Loading saved take…</Text>;
  return (
    <div className="space-y-2">
      <video src={url} controls className="w-full max-w-2xl rounded-lg" />
      <div>
        <Button label="Remove take" variant="ghost" size="sm" onClick={onRemove} />
      </div>
    </div>
  );
}

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
  const savedRef = useRef("");
  // State (not just the ref) so the first sync re-renders and the
  // "Unsaved changes" indicator clears once the lesson has loaded.
  const [syncedId, setSyncedId] = useState("");
  // Block index currently in record-whiteboard mode, or null. While
  // it is open the inline whiteboard editor is hidden — two editors
  // on the same snapshot would fight over it.
  // NOTE: this hook MUST stay above the early returns below. It was
  // added after them (whiteboard work, 2026-11-11) and React threw
  // "Rendered more hooks than during the previous render" (#310):
  // the first render returns early with 15 hooks, the next renders
  // 16, and the whole lesson page dies. All hooks live up here.
  const [recordingWhiteboard, setRecordingWhiteboard] = useState<number | null>(null);
  // Local mounted flag, not the store's `hydrated` — see StudioShell.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!studio.demoMode) void studio.ensureLessonLoaded(lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  useEffect(() => {
    if (lesson && syncedRef.current !== lesson.id) {
      setTitle(lesson.title);
      setContent(lesson.content);
      savedRef.current = JSON.stringify({ title: lesson.title, content: lesson.content });
      syncedRef.current = lesson.id;
      setSyncedId(lesson.id);
    }
  }, [lesson]);

  // Unsaved changes: title/content differ from the last saved state.
  // Warn on reload / close; in-app navigation has no reliable guard
  // in Next, so autosave (below) is the guard there.
  const dirty =
    mounted &&
    syncedId === lessonId &&
    JSON.stringify({ title, content }) !== savedRef.current;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Latest title/content for commit, read by blur/autosave handlers
  // that run after the state they closed over went stale.
  const latestRef = useRef({ title, content });
  latestRef.current = { title, content };

  // Commit the current edit to the store (no-op when nothing changed).
  // Trims the title like Save does, so the dirty check clears.
  const commit = useCallback(async () => {
    const { title: t, content: c } = latestRef.current;
    const savedTitle = t.trim() || lesson?.title || "Untitled lesson";
    if (JSON.stringify({ title: savedTitle, content: c }) === savedRef.current) return;
    await studio.saveLesson(lessonId, savedTitle, c);
    savedRef.current = JSON.stringify({ title: savedTitle, content: c });
    setTitle(savedTitle);
    setStatus("Saved.");
  }, [lessonId, lesson?.title, studio]);

  // Autosave 1 s after the last edit: blocks, takes and renames are
  // committed without an explicit Save, so they survive reload and
  // navigation. Explicit Save still exists for saving now.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => { void commit(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, commit]);

  if (!mounted) return <Text type="supporting">Loading…</Text>;
  if (!studio.demoMode && !studio.userId) return <Text>Please sign in to use the Studio.</Text>;
  if (!lesson) return <Text>Lesson not found.</Text>;

  const group = section ? studio.lessonsFor(section.id) : [];
  const idx = group.findIndex((l) => l.id === lessonId);

  const save = async () => {
    const savedTitle = title.trim() || lesson.title;
    await studio.saveLesson(lessonId, savedTitle, content);
    savedRef.current = JSON.stringify({ title: savedTitle, content });
    setTitle(savedTitle);
    // A quiz question with no correct answer chosen yet is still
    // saved (it is a draft), but say so plainly instead of a bare
    // "Saved." — the editor also shows "Choose the correct answer"
    // under the question until one is picked.
    const missingAnswer = content.blocks.some(
      (b) => b.kind === "quiz" && b.questions.some((q) => q.correct_index < 0),
    );
    setStatus(missingAnswer ? "Saved. Choose the correct answer for each question." : "Saved.");
  };

  const addBlock = (kind: "video" | "markdown" | "quiz" | "whiteboard") => {
    let block: LessonBlock;
    if (kind === "video") block = { kind, id: newId() };
    else if (kind === "markdown") block = { kind, id: newId(), markdown: "" };
    else if (kind === "whiteboard") block = { kind, id: newId() };
    // New quiz questions start with no correct answer chosen (-1),
    // never a silent default of Option 1.
    else block = { kind, id: newId(), questions: [{ id: newId(), prompt: "", options: ["", "", "", ""], correct_index: -1, explanation: "" }] };
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

  // Attach a video file to this block. Demo mode: saved in this
  // browser (IndexedDB). Live mode: Mux direct upload as before.
  const attachFile = async (blockIndex: number, file: File) => {
    if (studio.demoMode) {
      setError("");
      setUploadStatus("Saving video in this browser…");
      try {
        const localId = await saveLocalVideo(file);
        updateBlock(blockIndex, { local_video_id: localId });
        setUploadStatus("Video saved in this browser.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the video in this browser.");
        setUploadStatus("");
      }
      return;
    }
    setUploadStatus("Creating upload…");
    setError("");
    try {
      const res = await fetch("/api/mux/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (!res.ok) throw new Error(`Upload creation failed (${res.status}): ${await res.text()}`);
      const { uploadUrl } = (await res.json()) as { uploadUrl: string; uploadId: string };
      setUploadStatus("Uploading…");
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setUploadStatus("Uploaded. Processing takes a few minutes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setUploadStatus("");
    }
  };

  // A recorded take, saved in this browser and attached to this block.
  const attachTake = async (blockIndex: number, blob: Blob) => {
    setError("");
    try {
      const localId = await saveLocalVideo(blob);
      updateBlock(blockIndex, { local_video_id: localId });
      setUploadStatus("Take saved in this browser.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the take in this browser.");
    }
  };

  // A whiteboard recording, saved as a NEW video block right after
  // the whiteboard it was recorded from — drawing and talk stay
  // paired, in lesson order. Demo mode: local take in this browser.
  // Live mode: Mux direct upload, same as a file upload; playback
  // appears once Mux processes it and the webhook stores the id.
  const attachWhiteboardTake = async (blockIndex: number, blob: Blob) => {
    setError("");
    try {
      if (studio.demoMode) {
        const localId = await saveLocalVideo(blob);
        setContent((c) => {
          const blocks = [...c.blocks];
          blocks.splice(blockIndex + 1, 0, { kind: "video", id: newId(), local_video_id: localId });
          return { ...c, blocks };
        });
        setUploadStatus("Take saved in this browser as a video block.");
        return;
      }
      setUploadStatus("Creating upload…");
      const res = await fetch("/api/mux/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (!res.ok) throw new Error(`Upload creation failed (${res.status}): ${await res.text()}`);
      const { uploadUrl } = (await res.json()) as { uploadUrl: string; uploadId: string };
      setUploadStatus("Uploading…");
      const put = await fetch(uploadUrl, { method: "PUT", body: blob });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setContent((c) => {
        const blocks = [...c.blocks];
        blocks.splice(blockIndex + 1, 0, { kind: "video", id: newId() });
        return { ...c, blocks };
      });
      setUploadStatus("Uploaded. Processing takes a few minutes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the whiteboard take.");
      setUploadStatus("");
    }
  };

  const removeTake = async (blockIndex: number, localVideoId: string) => {
    try {
      await deleteLocalVideo(localVideoId);
    } catch {
      // The blob may already be gone; clearing the reference is enough.
    }
    updateBlock(blockIndex, { local_video_id: undefined });
  };

  return (
    <VStack gap={6}>
      <VStack gap={3}>
        {/* Select-all while the lesson still has its default title, so
            click-and-type replaces "Untitled lesson" instead of
            appending to it (lib/title-input.ts). Selection only, no
            value change — autosave / blur-commit still store exactly
            what was typed. */}
        <div {...titleFocusHandlers("Untitled lesson")}>
          <Input
            label="Lesson title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setStatus(""); }}
            onBlur={() => void commit()}
            controlClassName="text-2xl font-bold"
          />
        </div>
        <Text type="supporting">
          In section: {section?.title ?? "—"}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Text type="supporting">Move to section</Text>
          <Selector
            label="Move to section"
            isLabelHidden
            value={lesson.section_id}
            onChange={(v) => { void studio.moveLesson(lessonId, v); setStatus(""); }}
            options={courseSections.map((s) => ({ value: s.id, label: s.title }))}
            width={220}
          />
          <Button label="Move up" variant="secondary" size="sm" disabled={idx <= 0} onClick={() => void studio.reorderLesson(lessonId, -1)}>↑</Button>
          <Button label="Move down" variant="secondary" size="sm" disabled={idx < 0 || idx >= group.length - 1} onClick={() => void studio.reorderLesson(lessonId, 1)}>↓</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button label="+ Video block" variant="secondary" onClick={() => addBlock("video")} />
          <Button label="+ Whiteboard block" variant="secondary" onClick={() => addBlock("whiteboard")} />
          <Button label="+ Markdown block" variant="secondary" onClick={() => addBlock("markdown")} />
          <Button label="+ Quiz block" variant="secondary" onClick={() => addBlock("quiz")} />
          <Button label="Save lesson" onClick={() => void save()} />
          <AstryxLink
            href={`/courses/${courseId}/lessons/${lessonId}`}
            target="_blank"
            onClick={() => studio.setPreviewDone(true)}
          >
            Preview as learner ↗
          </AstryxLink>
          {dirty ? (
            <Text weight="semibold">Unsaved changes</Text>
          ) : (
            status && <Text type="supporting">{status}</Text>
          )}
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        {studio.error && <p className="text-sm text-error">{studio.error}</p>}
      </VStack>

      {/* Blur anywhere in a block commits the edit, so tabbing or
          clicking away saves — autosave covers the rest. */}
      <div onBlur={() => void commit()}>
      {content.blocks.map((block, bi) => (
        <section key={block.id} className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Text weight="semibold">{{ video: "Video", markdown: "Text", quiz: "Quiz", whiteboard: "Whiteboard" }[block.kind]}</Text>
            <Button label="Move block up" variant="secondary" size="sm" onClick={() => moveBlock(bi, -1)}>↑</Button>
            <Button label="Move block down" variant="secondary" size="sm" onClick={() => moveBlock(bi, 1)}>↓</Button>
            <Button
              label="Delete block"
              variant="destructive"
              size="sm"
              onClick={() => setContent((c) => ({ ...c, blocks: c.blocks.filter((_, i) => i !== bi) }))}
            >
              Delete
            </Button>
          </div>

          {block.kind === "video" && (
            <div className="space-y-3">
              <Input label="Video title" placeholder="Video title (optional)" value={block.title ?? ""} onChange={(e) => updateBlock(bi, { title: e.target.value })} />
              {block.local_video_id ? (
                <LocalTakePreview
                  videoId={block.local_video_id}
                  onRemove={() => void removeTake(bi, block.local_video_id!)}
                />
              ) : (
                <Text type="supporting">No video attached yet.</Text>
              )}
              <div className="space-y-2">
                {/* Plain div, not Astryx Text: Text styles its element
                    inline even with as="div", which ran this label into
                    the file input on one line. */}
                <div className="font-semibold">Video file</div>
                <Input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void attachFile(bi, f); }} />
                <Text type="supporting">{studio.demoMode ? LOCAL_VIDEO_NOTE : "Uploads for processing. Playback appears in a few minutes."}</Text>
              </div>
              {uploadStatus && <Text type="supporting">{uploadStatus}</Text>}
              <Recorder lessonId={lesson.id} onLocalVideo={studio.demoMode ? (blob) => void attachTake(bi, blob) : undefined} />
              <details className="rounded-lg border border-border px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-primary">Advanced video settings</summary>
                <div className="space-y-3 pt-3">
                  <Input label="Video ID (Mux)" placeholder="Video ID (Mux)" value={block.mux_playback_id ?? ""} onChange={(e) => updateBlock(bi, { mux_playback_id: e.target.value })} />
                  <Input label="Asset ID (Mux, optional)" placeholder="Asset ID (Mux, optional)" value={block.mux_asset_id ?? ""} onChange={(e) => updateBlock(bi, { mux_asset_id: e.target.value })} />
                  <Input label="Caption file URL (optional)" placeholder="Caption file URL (optional)" value={block.caption_track_url ?? ""} onChange={(e) => updateBlock(bi, { caption_track_url: e.target.value })} />
                  <div className="space-y-2">
                    <Textarea
                      label="Captions (optional)"
                      rows={6}
                      value={block.caption_text ?? ""}
                      onChange={(e) => updateBlock(bi, { caption_text: e.target.value })}
                      placeholder="Paste captions here (optional)"
                    />
                  </div>
                  <Text type="supporting">Captions here stay in this lesson; they are not sent to Mux.</Text>
                </div>
              </details>
            </div>
          )}

          {block.kind === "whiteboard" && (
            <div className="space-y-3">
              <Input label="Whiteboard title" placeholder="Whiteboard title (optional)" value={block.title ?? ""} onChange={(e) => updateBlock(bi, { title: e.target.value })} />
              {recordingWhiteboard === bi ? (
                <WhiteboardRecorder
                  snapshot={block.snapshot}
                  onSnapshot={(doc) => updateBlock(bi, { snapshot: doc })}
                  onTake={(blob) => void attachWhiteboardTake(bi, blob)}
                  onClose={() => setRecordingWhiteboard(null)}
                />
              ) : (
                <>
                  <WhiteboardEditor
                    key={block.id}
                    snapshot={block.snapshot}
                    onSnapshot={(doc) => updateBlock(bi, { snapshot: doc })}
                  />
                  <div>
                    <Button label="Record whiteboard" onClick={() => setRecordingWhiteboard(bi)} />
                  </div>
                  <Text type="supporting">Draw, save the lesson, and students see this drawing. Recording adds a video block after it.</Text>
                </>
              )}
            </div>
          )}

          {block.kind === "markdown" && (
            <div className="space-y-3">
              <Textarea label="Markdown" isLabelHidden rows={8} value={block.markdown} onChange={(e) => updateBlock(bi, { markdown: e.target.value })} />
              <Text weight="semibold">Preview</Text>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown) }} />
            </div>
          )}

          {block.kind === "quiz" && (
            <div className="space-y-4">
              <Input label="Quiz title" placeholder="Quiz title (optional)" value={block.title ?? ""} onChange={(e) => updateBlock(bi, { title: e.target.value })} />
              {block.questions.map((q, qi) => (
                <div key={q.id} className="space-y-2 border-t border-border pt-4">
                  <Input label="Question prompt" placeholder="Question prompt" value={q.prompt} onChange={(e) => {
                    const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, prompt: e.target.value } : qq));
                    updateBlock(bi, { questions });
                  }} />
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <Input label={`Option ${oi + 1}`} placeholder={`Option ${oi + 1}`} value={opt} className="flex-1" onChange={(e) => {
                        const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, options: qq.options.map((o, k) => (k === oi ? e.target.value : o)) } : qq));
                        updateBlock(bi, { questions });
                      }} />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1 text-sm text-primary">
                        <input
                          type="radio"
                          name={`correct-${q.id}`}
                          checked={q.correct_index === oi}
                          onChange={() => {
                            const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, correct_index: oi } : qq));
                            updateBlock(bi, { questions });
                          }}
                        />
                        Correct
                      </label>
                    </div>
                  ))}
                  {q.correct_index < 0 && (
                    <Text type="supporting">Choose the correct answer.</Text>
                  )}
                  <Input label="Explanation (shown after answering)" placeholder="Explanation (shown after answering)" value={q.explanation} onChange={(e) => {
                    const questions = block.questions.map((qq, j) => (j === qi ? { ...qq, explanation: e.target.value } : qq));
                    updateBlock(bi, { questions });
                  }} />
                  <Button label="Delete question" variant="secondary" size="sm" onClick={() => {
                    const questions = block.questions.filter((_, j) => j !== qi);
                    updateBlock(bi, { questions });
                  }} />
                </div>
              ))}
              <Button label="+ Add question" variant="secondary" onClick={() => {
                const questions = [...block.questions, { id: newId(), prompt: "", options: ["", "", "", ""], correct_index: -1, explanation: "" }];
                updateBlock(bi, { questions });
              }} />
            </div>
          )}
        </section>
      ))}
      </div>

      {content.blocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button label="Save lesson" onClick={() => void save()} />
          {dirty ? (
            <Text weight="semibold">Unsaved changes</Text>
          ) : (
            status && <span className="text-sm text-secondary">{status}</span>
          )}
        </div>
      )}
    </VStack>
  );
}
