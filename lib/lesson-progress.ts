// Learner "mark done" state in demo mode (no backend): kept in this
// browser only, keyed by lesson id. Live mode still uses Supabase
// (lesson_progress) and never touches this.

const PROGRESS_KEY = "curi-lesson-progress-v1";

function readAll(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function readLocalProgress(): Record<string, boolean> {
  return readAll();
}

export function readLocalLessonDone(lessonId: string): boolean {
  return Boolean(readAll()[lessonId]);
}

export function writeLocalLessonDone(lessonId: string, done: boolean): void {
  try {
    const all = readAll();
    if (done) all[lessonId] = true;
    else delete all[lessonId];
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Private mode / quota: the toggle still works for this page view.
  }
}
