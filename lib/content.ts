// Curi lesson content model.
// A lesson page is custom-rendered from JSON stored as jsonb in Postgres.
// It is NOT a blob, NOT a generic LMS page, and NOT a file upload.
// Suggested path only: nothing in this model locks a learner out.

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[]; // exactly 4 for MVP
  correct_index: number; // 0..3
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
  title?: string;
};

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

export type LessonBlock = VideoBlock | MarkdownBlock | QuizBlock;

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
        title: typeof raw.title === "string" ? raw.title : undefined,
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
                typeof q.correct_index === "number" && q.correct_index >= 0 && q.correct_index <= 3
                  ? q.correct_index
                  : 0,
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
