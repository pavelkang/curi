// Curi lesson content model.
// A lesson page is custom-rendered from JSON stored as jsonb in Postgres.
// It is NOT a blob, NOT a generic LMS page, and NOT a file upload.
// Suggested path only: nothing in this model locks a learner out.

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[]; // exactly 4 for MVP
  // 0..3, or -1 = no correct answer chosen yet. A new question
  // starts at -1 so a quiz can never silently ship with Option 1
  // marked correct by default; the editor shows a per-option
  // "Correct" marker and a "Choose the correct answer" hint until
  // one is picked.
  correct_index: number;
  explanation: string;
};

export type VideoBlock = {
  kind: "video";
  id: string;
  mux_asset_id?: string;
  mux_playback_id?: string;
  caption_track_url?: string;
  // Edited caption text (WebVTT) stored in the lesson block itself.
  // See README "Caption editing gap": Mux's create-track API takes a
  // publicly hosted VTT *URL*, not raw text, so edited text saved here
  // is rendered by the player from a blob URL. It is NOT automatically
  // pushed to Mux as a track. That push is an explicit gap, not faked.
  caption_text?: string;
  // Demo-mode local take: id of the webm blob in IndexedDB
  // (lib/local-video.ts). Set when a file is picked or a recorded take
  // is saved in this browser; the blob itself is NOT in this JSON.
  // In live mode this field is ignored for playback.
  local_video_id?: string;
  title?: string;
};

// A video block counts as playable only when there is something to
// play: a Mux playback id, or a locally stored take. An empty video
// block (no playback id, no local take) is not a recorded lesson.
export function isPlayableVideoBlock(b: VideoBlock): boolean {
  return Boolean(b.mux_playback_id) || Boolean(b.local_video_id);
}

export type MarkdownBlock = {
  kind: "markdown";
  id: string;
  markdown: string;
};

export type QuizBlock = {
  kind: "quiz";
  id: string;
  title?: string;
  questions: QuizQuestion[];
};

// Whiteboard block: a TLDraw drawing stored as a store snapshot in
// this lesson's JSON (jsonb), NOT a blob and NOT a screenshot. The
// snapshot is the `document` part of tldraw's getSnapshot() output
// ({ store, schema }); the session part (camera, selection) is never
// stored. A student sees the teacher's actual drawing, rendered
// read-only from this snapshot. A recorded whiteboard lesson is a
// separate video block (local take / Mux), paired with this block.
export type WhiteboardBlock = {
  kind: "whiteboard";
  id: string;
  title?: string;
  snapshot?: unknown;
};

// A stored snapshot is valid only if it looks like a TLDraw store
// snapshot: a plain object with a `store` record. Anything else is
// dropped on parse (the block survives, empty) so a malformed
// snapshot can never break the lesson page.
export function isValidWhiteboardSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const store = (value as Record<string, unknown>).store;
  return Boolean(store) && typeof store === "object" && !Array.isArray(store);
}

export type LessonBlock = VideoBlock | MarkdownBlock | QuizBlock | WhiteboardBlock;

export type LessonContent = {
  version: 1;
  blocks: LessonBlock[];
};

export function emptyContent(): LessonContent {
  return { version: 1, blocks: [] };
}

export function parseContent(value: unknown): LessonContent {
  if (!value || typeof value !== "object") return emptyContent();
  const v = value as { version?: unknown; blocks?: unknown };
  if (!Array.isArray(v.blocks)) return emptyContent();
  const blocks: LessonBlock[] = [];
  for (const raw of v.blocks as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== "object" || typeof raw.kind !== "string") continue;
    if (raw.kind === "video") {
      blocks.push({
        kind: "video",
        id: String(raw.id ?? newId()),
        mux_asset_id: typeof raw.mux_asset_id === "string" ? raw.mux_asset_id : undefined,
        mux_playback_id: typeof raw.mux_playback_id === "string" ? raw.mux_playback_id : undefined,
        caption_track_url: typeof raw.caption_track_url === "string" ? raw.caption_track_url : undefined,
        caption_text: typeof raw.caption_text === "string" ? raw.caption_text : undefined,
        local_video_id: typeof raw.local_video_id === "string" ? raw.local_video_id : undefined,
        title: typeof raw.title === "string" ? raw.title : undefined,
      });
    } else if (raw.kind === "whiteboard") {
      // Malformed snapshot → keep the block, drop the snapshot.
      blocks.push({
        kind: "whiteboard",
        id: String(raw.id ?? newId()),
        title: typeof raw.title === "string" ? raw.title : undefined,
        snapshot: isValidWhiteboardSnapshot(raw.snapshot) ? raw.snapshot : undefined,
      });
    } else if (raw.kind === "markdown") {
      blocks.push({
        kind: "markdown",
        id: String(raw.id ?? newId()),
        markdown: typeof raw.markdown === "string" ? raw.markdown : "",
      });
    } else if (raw.kind === "quiz") {
      const questions = Array.isArray(raw.questions)
        ? (raw.questions as Array<Record<string, unknown>>)
            .filter((q) => q && typeof q.prompt === "string")
            .map((q) => ({
              id: String(q.id ?? newId()),
              prompt: String(q.prompt),
              options: Array.isArray(q.options)
                ? (q.options as unknown[]).map(String).slice(0, 4)
                : ["", "", "", ""],
              correct_index:
                typeof q.correct_index === "number" && q.correct_index >= -1 && q.correct_index <= 3
                  ? q.correct_index
                  : -1,
              explanation: typeof q.explanation === "string" ? q.explanation : "",
            }))
            // MCQ only: enforce exactly 4 options, padding with "" if short.
            .map((q) => ({ ...q, options: [...q.options, "", "", "", ""].slice(0, 4) }))
        : [];
      blocks.push({
        kind: "quiz",
        id: String(raw.id ?? newId()),
        title: typeof raw.title === "string" ? raw.title : undefined,
        questions,
      });
    }
  }
  return { version: 1, blocks };
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type Course = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  published: boolean;
  created_at: string;
};

export type Section = {
  id: string;
  course_id: string;
  title: string;
  position: number;
};

export type Lesson = {
  id: string;
  section_id: string;
  title: string;
  position: number;
  content: LessonContent;
};

export type SectionDependency = {
  id: string;
  course_id: string;
  from_section_id: string;
  to_section_id: string;
};
