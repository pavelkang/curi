# Curi UI evaluation log — Astryx migration

Evaluator: a separate agent acting as a first-time non-technical teacher, no instructions.
Round 1 ran against the Astryx-migrated app (screenshots in `screenshots-astryx-eval/`).
Round 2 fixes below were made 2026-11-11. Re-test result is filled in by the evaluator.

## Round 1 → Round 2 fixes

### 1. Learner side blind to demo courses (most blocking)
- **Round 1:** learner home `/` said "No courses yet" and `/courses/[id]` said "Course not found" for demo courses, even after publishing. Checklist step 4 Preview linked to a dead page.
- **Change:** the `StudioProvider` moved from `app/studio/layout.tsx` to the root `app/providers.tsx`, so learner home / course / lesson read the SAME demo store the Studio uses (`lib/studio-store.tsx`, localStorage `curi-studio-demo-v1`). No backend invented. Learner home lists published demo courses only; a course page shows any demo course by id (with a Draft badge when unpublished, since this browser is the teacher's browser). Lesson pages render demo lessons, including locally saved takes, and Done-state is kept in this browser (`lib/lesson-progress.ts`). Home shows skeletons until the store hydrates, never a false "No courses yet".
- **Files:** `app/providers.tsx`, `app/studio/layout.tsx`, `app/page.tsx`, `components/CourseDetail.tsx`, `components/LessonDetail.tsx`, `lib/lesson-progress.ts` (new).
- **Re-test:** _pending re-test_

### 2. No video can be attached in demo mode
- **Round 1:** file upload disabled, "Upload recording to Mux" disabled, and a recorded take (0.4 MB) evaporated on Save/reload — stored video block was empty. Checklist ticked "Record a lesson" for an empty video block.
- **Change:** demo mode now persists video locally in IndexedDB (`lib/local-video.ts`, DB `curi-local-videos`, blob stored as-is, lesson block keeps only `local_video_id` — new optional field on `VideoBlock` in `lib/content.ts`). File input is enabled in demo mode; the Recorder has "Save take in this browser" instead of the disabled Mux button. The lesson player (`components/VideoBlock.tsx`) plays a locally saved take. **Limit, stated in code and UI:** takes over 100 MB are refused with a plain message; the blob lives in this browser only and is lost if site data is cleared. Checklist step 2 now ticks ONLY when a lesson has a playable video (`isPlayableVideoBlock`: Mux playback id or local take) — shared helper in `lib/checklist.ts`.
- **Files:** `lib/local-video.ts` (new), `lib/content.ts`, `lib/checklist.ts` (new), `components/VideoBlock.tsx`, `components/Recorder.tsx`, `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`, `components/TeacherChecklist.tsx`.
- **Re-test:** _pending re-test_

### 3. Silent loss of unsaved lesson work
- **Round 1:** video/quiz blocks and renames vanished on reload/navigation unless "Save lesson" was pressed, with no warning; save semantics differed per surface.
- **Change:** the lesson editor tracks a dirty flag (title/content vs last saved state) and shows "Unsaved changes" next to Save, plus a `beforeunload` warning on reload/close. The course page shows the same "Unsaved changes" / "Saved." wording for title/description. Section rename still saves on blur, immediately — that behaviour is unchanged, but the course page now says so in a comment and the save wording matches. Note: in-app navigation has no reliable guard in Next App Router, so the visible indicator is the warning there; `beforeunload` covers reload/close.
- **Files:** `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`, `app/studio/courses/[courseId]/page.tsx`.
- **Re-test:** _pending re-test_

### 4. Contradictory save messaging
- **Round 1:** top banner said "Demo mode — No backend connected. Changes here are not saved." while the sidebar said "Demo — stored in this browser only, not in Supabase" and the queue said "1 queued — not synced". Changes ARE saved in localStorage.
- **Change:** one honest line everywhere: "Saved in this browser only" (`DEMO_STORE_NOTE` in `lib/studio-store.tsx`). Banner, sidebar note, learner home, and the drafts queue all use it; queue badges now read "In this browser" instead of "Not synced", and the sidebar queue link reads "Offline drafts: N · saved in this browser only". The words "not saved" / "not synced" no longer appear in the UI.
- **Files:** `lib/studio-store.tsx`, `components/DemoBanner.tsx`, `components/StudioShell.tsx`, `components/OfflineDraftsQueue.tsx`, `app/page.tsx`.
- **Re-test:** _pending re-test_

### 5. Video block jargon wall
- **Round 1:** fields "Mux playback id", "Mux asset id (optional)", "Caption file URL (optional, public VTT/SRT)", "Edited captions (WebVTT text, optional)" prefilled with sample VTT that looked like real content, plus "Stored in this lesson — not pushed to Mux."
- **Change:** the video block now shows plain labels — "Video title", "Video file" — and the Mux/advanced fields live behind a single collapsed "Advanced video settings" section in both modes, plain-labelled ("Video ID (Mux)", "Asset ID (Mux, optional)", "Caption file URL (optional)", "Captions (optional)"). The sample VTT placeholder is gone ("Paste captions here (optional)"); the only caption note, inside the advanced section, reads "Captions here stay in this lesson; they are not sent to Mux." The file input is no longer disabled in demo mode, so there is no disabled-looking active control left in the block.
- **Files:** `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`.
- **Re-test:** _pending re-test_

### 6. Suggested path noise
- **Round 1:** course page showed "Suggested path / Suggestions only. Nothing locks a learner." with empty From/To dropdowns before any section existed.
- **Change:** the whole Suggested path section is hidden until the course has at least 2 sections to connect.
- **Files:** `app/studio/courses/[courseId]/page.tsx`.
- **Re-test:** _pending re-test_

### 7. Checklist vanishes
- **Round 1:** the "Get started" checklist only existed on /studio; once in a course/lesson it was gone.
- **Change:** the Studio sidebar now shows a compact "Get started: N of 5 done" link back to /studio on course and lesson pages. The count is computed by the shared `lib/checklist.ts` helper, so it can never disagree with the full checklist.
- **Files:** `components/StudioShell.tsx`, `lib/checklist.ts` (new).
- **Re-test:** _pending re-test_

### 8. Small trust items
- **Round 1:** (a) checklist step 4 checkbox rendered as a square while others were circles; (b) duplicate "Demo — stored in this browser only, not in Supabase" line after saving a lesson; (c) active "+ Course" / "+ block" buttons looked disabled (grey); (d) no confirmation before Publish on an empty course; (e) no recording timer while recording.
- **Change:** (a) step 4 is now the same circle toggle as the other steps (a button with `role="checkbox"`); (b) saving a lesson shows only "Saved." — the demo line appears once, in the sidebar; (c) "+ Course" is now the primary (accent) button, and secondary buttons get a visible 1px border (`--color-border-emphasized`) via an inline style in `components/ui/button.tsx` — inline because Astryx sets `borderWidth: 0` in unlayered StyleX, which beats Tailwind's layered `border` utility; (d) Publish on a course with no lessons asks "This course has no lessons yet. Publish it anyway?"; (e) the Recorder shows "Recording M:SS" next to Stop while recording.
- **Files:** `components/TeacherChecklist.tsx`, `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`, `components/StudioShell.tsx`, `components/ui/button.tsx`, `app/studio/courses/[courseId]/page.tsx`, `components/Recorder.tsx`.
- **Re-test:** _pending re-test_

## Deliberately NOT fixed
- **In-app navigation guard:** Next App Router has no reliable route-change guard; the lesson editor warns via the "Unsaved changes" indicator and `beforeunload` (reload/close) only. A custom in-app intercept was not built — it would mean re-implementing navigation for every Studio link.
- **Live-mode Mux upload / caption push:** unchanged. Mux fields stay (collapsed, plain-labelled) in live mode; edited captions are still not pushed to Mux — that is the known caption gap, not faked.
- **Electron shell (`~/workspace/curi-desktop`):** untouched. All changes are shared web code in `~/workspace/curi`.
- **Recorder in headless smoke test:** recording needs screen/camera permission prompts, so the automated smoke test covers the file-upload persistence path, not a live recording. The Recorder's save-take path shares the same `saveLocalVideo` code as file upload.
- **No deploy / push / commit.** Per instructions; all changes are local and uncommitted.

## Verification (2026-11-11)
- `npx tsc --noEmit`: pass (re-run after the hook fix below).
- `npm run build`: pass (13/13 static pages).
- Production server on port 3100 + headless Playwright smoke walkthrough (create course → lesson with video block via file upload → quiz → preview as learner → publish): **ALL PASS, 35/35 checks, zero console/page/request errors** (final run 6; script at `/tmp/curi-smoke/smoke.js`, playwright-core + cached Chromium). The walkthrough also verified: dirty indicators, reload persistence of video take + quiz, learner video actually playing from a `blob:` URL (readyState 4), Done-state persisting across reload, publish-empty confirm dialog, and suggested path appearing only with 2 sections.
- After-fix screenshots: `screenshots-astryx/round-2/` (01 home empty, 02 course, 03 lesson empty, 04 video attached, 05 quiz filled, 06 after reload, 07 checklist, 08 learner course, 09 learner lesson playing, 10 home after publish).

### Concurrent-edit incident found during verification (fixed)
- While verifying, smoke runs 3–5 started failing on the Studio lesson page with React error #310 ("Rendered more hooks than during the previous render"). Cause: the parallel whiteboard agent (TLDraw whiteboard block, same session) had added `useState` for `recordingWhiteboard` AFTER the lesson page's early returns in `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx` — first render returns early with 15 hooks, the next renders 16, and the page dies. Their feature code was otherwise intact and all Round 2 changes were preserved.
- **Fix:** moved that one `useState` above the early returns, next to the other state, with a comment explaining why it must stay there. No whiteboard behaviour changed. Re-verified: repro + full smoke pass. The whiteboard agent's own re-test of recording is still theirs to do.
- Note: a second production server on port 3101 belongs to the whiteboard agent; it was not touched. The 3100 server used for verification was stopped afterwards.

---

## Round 2 re-test (evaluator, 2026-11-11, ~23:30–00:05 PT)

Evaluator: same separate-agent setup as Round 1 — first-time non-technical teacher, no instructions, no source-code reading, no builder help. Fresh production build (`npm run build`, 13/13 pages, BUILD_ID `YlX8R8SbIQ0LJZOckHlX9`) served from an isolated copy of `.next` on port 3102 (port 3100 was occupied by another agent's server, PID 12971, left untouched; a concurrent `next build` by another agent wiped `.next` mid-eval once, which is why the isolated copy was used). Headless Chromium (Playwright, 1440×1100), fresh throwaway browser profile. Test course: "Bread Baking Basics" (`mwcr70eh-x0wukcmr`), section "Getting Started", lesson "Your First Loaf" with one video block ("Mixing the dough", 2 s uploaded take) + one quiz block ("Quick check", 1 question, correct = Option 1). Zero console errors / page errors across the whole walkthrough (one benign `ERR_ABORTED` RSC prefetch from an aborted navigation). Screenshots: `screenshots-astryx-eval-round2/` (47 PNGs, 01–50 with gaps).

### Per-task results (unaided)

| # | Task | Unaided? | Intuitiveness (1–5) | Notes |
|---|------|----------|---------------------|-------|
| 1 | Create a course (+ section) | Yes | 4 | "+ Course" obvious; title/description save with real clicks and persist; section add/rename works. −1: section rename saves silently on blur with no feedback and no indicator. |
| 2 | Record / upload a lesson video | Yes | 4 | "Video file / Choose File" obvious; inline preview; "Video saved in this browser. Save the lesson to keep it."; take survives save + reload and plays (blob URL, readyState 4, 2.008 s). Recorder also works headlessly (fake devices): "Recording 0:03" timer, Stop → "Save take in this browser" / "Retake" / "Recorded 0.4 MB. Preview it, retake, or upload." −1: "Demo mode: takes are saved in this browser only, not in Mux." names Mux in the main flow; a saved take silently replaces the block's previous take. |
| 3 | Add a quiz to a lesson | Yes | 4 | "+ Quiz block", plain fields (Question prompt, Option 1–4), "Correct option" dropdown + "Explanation (shown after answering)" + "+ Add question". Saves and survives reload (correct_index 0, explanation stored). −1: fields are placeholder-only (labels vanish once filled); "Correct option" sits below the options and defaults silently to Option 1. |
| 4 | Preview as a learner | Partial — only by typing the URL directly | 2 | The learner pages themselves are perfect once reached (see #1). But there is NO preview path in the Studio UI: no control on /studio, the Studio course page, or the Studio lesson page; top-nav "Courses" goes to learner home, which hides drafts. Checklist step 4 is a non-clickable row and never ticks. |
| 5 | Publish the course | Yes | 5 | Publish button obvious; published course appears on learner home immediately; learner lesson plays video, quiz answers with feedback ("1 of 1 correct", explanation shown), "Mark lesson as done" persists across reload (`curi-lesson-progress-v1`). |

### Per-issue verdicts

- **1. Learner side blind to demo courses — FIXED (core).** Learner home lists published courses only (draft correctly absent, honest "No courses yet. Create one in the Studio."); draft course page renders by direct URL with a Draft badge ("2 sections · 1 lessons · 0 marked done"); draft lesson page renders, video plays from a `blob:` URL, quiz renders with "Check answer" / "Retake quiz", Done-state persists. Caveat: see new issue A — there is no UI path to reach a draft learner page.
- **2. No video can be attached in demo mode — FIXED.** File upload enabled; take persisted to IndexedDB (`curi-local-videos`, block keeps `local_video_id`); survives save + reload; plays (readyState 4, currentTime advances). Recorder save-take path also verified working. Checklist step 2 ticked only after a playable video was saved (sidebar went 1 → 2 of 5 done).
- **3. Silent loss of unsaved lesson work — PARTIAL.** "Unsaved changes" indicator works on course + lesson pages; "Saved." confirms; `beforeunload` fires on reload/close (verified: accepting it loses the edit, title reverts). But: (a) unsaved *blocks* still vanish on reload/navigation with only the small "Unsaved changes" text as warning — the evaluator lost a full quiz block and a recorded take this way; (b) section rename saves on blur with zero feedback and no indicator — the evaluator typed a new section name, navigated without blurring, and it was lost once; (c) in-app navigation actually *preserved* an unsaved lesson-title edit in testing (better than the log claims — no guard, but no loss observed on SPA nav either).
- **4. Contradictory save messaging — FIXED.** "Saved in this browser only" everywhere (banner, sidebar, learner home, drafts queue); queue badges read "In this browser"; no "not saved" / "not synced" anywhere in UI text. Residual: the recorder note still says "not in Mux" (different phrase, but still names an unknown service in a "not …" construction).
- **5. Video block jargon wall — FIXED (mostly).** "Advanced video settings" is collapsed by default (one row, ▶ chevron); expanding shows plain labels ("Video ID (Mux)", "Asset ID (Mux, optional)", "Caption file URL (optional)", "Captions (optional)") and the note "Captions here stay in this lesson; they are not sent to Mux."; no old "Mux playback id" labels, no sample VTT. Residual: Mux is still named in the main flow (see #4 residual); "Video Block" / "Quiz Block" headings are mild product jargon.
- **6. Suggested path noise — FIXED.** Hidden with 0–1 sections; appears with 2 sections ("Suggested path / Suggestions only. Nothing locks a learner."), From/To dropdowns list both sections ("Getting Started", "Shaping & Baking").
- **7. Checklist vanishes — FIXED (mostly).** Sidebar shows "Get started: N of 5 done" link on course + lesson pages; count agrees with /studio (1 → 2 after playable video, → 3 after quiz, → 4 after publish). BUT the count caps at 4/5 because step 4 can never complete (new issue A).
- **8a. Step 4 square checkbox — FIXED.** All five checklist markers are identical circles (steps 1–3 filled ✓, 4–5 empty) — screenshot 43.
- **8b. Duplicate demo line after save — FIXED.** Saving shows only "Saved."; the demo line appears once, in the sidebar.
- **8c. Grey-looking active buttons — FIXED.** "+ Course" is a solid purple primary button; secondary buttons have visible borders.
- **8d. Publish-empty confirm — FIXED.** Exact dialog: "This course has no lessons yet. Publish it anyway?" Dismissing leaves the course a draft. (A throwaway empty "Untitled course" draft was created in the evaluator's throwaway browser profile only, to test this; it is not in the repo.)
- **8e. Recording timer — FIXED.** "Recording 0:03" shown next to Stop while recording.

### New / remaining issues (ranked)

1. **No way to preview as a learner from the Studio; checklist step 4 can never tick (blocking for the checklist flow).** No "Preview as learner" control exists on /studio, the Studio course page, or the Studio lesson page (checked all links/buttons). Top-nav "Courses" leads to learner home, where drafts are not listed, so a draft cannot be reached through the UI at all — the evaluator only reached it by typing `/courses/<id>` directly. Visiting the learner course/lesson pages does NOT tick step 4 either, so the checklist is permanently stuck at 4 of 5. Fix: add a "Preview as learner" link on the Studio course page (and/or make the step-4 row a link to the learner course page) and tick step 4 when the learner page is visited or the preview link is used.
2. **Checklist names the wrong course once a second course exists.** Steps 1/4/5 displayed "Untitled course" (the evaluator's empty test course, newest/first in the store) even after "Bread Baking Basics" was published — step 5 ticked for the bread course but still names the untitled one. Single-course teachers won't see this; the attribution logic (newest/first course) misleads as soon as there are two courses.
3. **Unsaved blocks and section renames still vanish with almost no warning.** Only the small "Unsaved changes" text guards the lesson editor; a whole added quiz block and a recorded take were lost to a reload/navigation during this eval. Section rename is the worst case: blur-to-save, no indicator, no "Saved." feedback — a rename was lost once by navigating without blurring. (In-app SPA navigation preserved a title edit in testing, so the hole is specifically reload/close and the blur-only rename.)
4. **"Mux" still named in the main video flow.** "Demo mode: takes are saved in this browser only, not in Mux." — a first-time teacher has no idea what Mux is, and the sentence reads like a warning. Drop the service name from the main flow.
5. **Quiz fields are placeholder-only; "Correct option" defaults silently to Option 1.** Once filled, the fields have no visible labels (only position tells them apart); the correct-answer dropdown sits below the options and can be missed, so a quiz can ship with the wrong answer marked without the teacher noticing.
6. **Copy nits.** Learner course page: "2 sections · 1 lessons · 0 marked done" (pluralization). Learner quiz shows "Try again" immediately after a correct answer. "Video Block" / "Quiz Block" headings are mild jargon.
7. **Robustness note (not user-facing as tested).** Save handlers appear to read field values on blur: a synthetic JS click on "Save course"/"Save lesson" without a prior blur saved the pre-edit value in the evaluator's driver. Real mouse users always blur first (mousedown moves focus), and all real-click saves persisted correctly — but keyboard/assistive-tech flows that activate Save without blurring could hit it. Worth a look, low priority.

### Evaluator notes (method)
- Two apparent "bugs" during the eval turned out to be driver artifacts, not app bugs, and are NOT counted above: (a) a synthetic `el.click()` on Save without a blur saved stale values — real mouse clicks always persisted; (b) a title "loss" after clicking "+ Video block" was actually the evaluator's own one-command-per-process driver reloading the page between steps, discarding the unsaved edit before the click. All findings above were re-verified in single continuous sessions with real mouse clicks and keystrokes.
- The whiteboard block ("+ Whiteboard block" button) was present but not evaluated — out of scope for this round (the whiteboard agent owns its re-test).

---

## Round 2 → Round 3 fixes (2026-11-11)

### 1. No learner preview from Studio (blocking)
- **Round 2:** no "Preview as learner" control anywhere in Studio; top-nav "Courses" hides drafts; checklist step 4 was a non-clickable row that never ticked — checklist permanently stuck at 4/5.
- **Change:** a visible "Preview as learner ↗" link now sits on the Studio course page (next to Save/Publish) and on the Studio lesson page (next to Save lesson), opening the learner course/lesson in a new tab. Checklist step 4 is itself a link to the learner course page (new tab, "↗"). Step 4 ticks two ways, and either is enough: (a) clicking any "Preview as learner" link records the preview immediately in localStorage; (b) visiting a learner course/lesson page in demo mode records it too — in demo mode this browser IS the teacher's browser, so the visit is a preview (live mode does not auto-record; only the link click does). The circle toggle remains for un-ticking by hand. The checklist can now reach 5/5 unaided.
- **Files:** `app/studio/courses/[courseId]/page.tsx`, `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`, `components/TeacherChecklist.tsx`, `components/CourseDetail.tsx`, `components/LessonDetail.tsx`, `lib/checklist.ts`.
- **Re-test:** _pending re-test_

### 2. Checklist named the wrong course with >1 course
- **Round 2:** steps named "Untitled course" (the first/empty course) even after "Bread Baking Basics" was published.
- **Change:** rule, documented in `lib/checklist.ts` (`relevantCourse`) — the checklist names and links to the **last-touched course with real work in it**: the course most recently created, renamed, published, or edited a section/lesson in (tracked in the store as `lastCourseId`, localStorage `curi-studio-last-course-v1`), provided it has at least one section/lesson or is published. An empty just-created draft does not steal the naming from a course with work in it. Fallback is the last-touched course, then the first course. Steps 2/3 link to lessons of that course when it has any.
- **Files:** `lib/checklist.ts`, `lib/studio-store.tsx` (touch points in create/rename/publish/section/lesson/save/move/reorder), `components/TeacherChecklist.tsx`.
- **Re-test:** _pending re-test_

### 3. Unsaved blocks / renames still vanish
- **Round 2:** unsaved blocks vanished on reload/navigation with only the small "Unsaved changes" text as warning; section rename was blur-only with no indicator.
- **Change:** lesson edits now commit two ways, not only on explicit Save. (a) **Autosave:** 1 s after the last edit, title + content are committed to the store (demo and live), so blocks, takes and renames survive reload and navigation without pressing Save; "Save lesson" still exists for saving now. (b) **Blur commit:** blurring the title input or any block field commits immediately (covers tabbing/clicking away before the 1 s timer). Section rename now shows "Saved." next to the field for 2 s after a blur-commit, and Enter commits it instead of waiting for a blur that may never come. `beforeunload` still warns on reload/close. **Honest limit:** a reload inside the ~1 s autosave window can still lose the last keystroke; beforeunload warns first in that case.
- **Files:** `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`, `app/studio/courses/[courseId]/page.tsx`.
- **Re-test:** _pending re-test_

### 4. "Mux" still in the main video flow
- **Round 2:** the recorder note read "Demo mode: takes are saved in this browser only, not in Mux."
- **Change:** the service name is gone from the main teacher flow. Recorder note now reads "Takes are saved in this browser only."; live-mode strings are plain too ("Upload recording", "Creating upload…", "Uploading…", "Uploaded. Processing takes a few minutes.", "Uploads for processing. Playback appears in a few minutes."). "Mux" remains only inside the collapsed "Advanced video settings" section ("Video ID (Mux)", "Asset ID (Mux, optional)", "Captions here stay in this lesson; they are not sent to Mux.").
- **Files:** `components/Recorder.tsx`, `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`.
- **Re-test:** _pending re-test_

### 5. Quiz: placeholder-only fields, silent Option 1 default
- **Round 2:** fields were placeholder-only (labels vanished once filled); "Correct option" sat below the options and defaulted silently to Option 1.
- **Change:** every quiz field now has a persistent visible label above it (Quiz title, Question prompt, Option 1–4, Explanation). The dropdown is gone: each option has its own "Correct" radio marker beside it. New questions start with **no** correct answer chosen (`correct_index: -1`, kept through `parseContent`); until one is picked the editor shows "Choose the correct answer." under the options, and explicit Save reports "Saved. Choose the correct answer for each question." A draft still saves (it is a draft), but never with a silent default. The learner quiz guards the -1 case ("No correct answer was set for this question.").
- **Files:** `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`, `lib/content.ts`, `components/QuizBlock.tsx`.
- **Re-test:** _pending re-test_

### 6. Copy nits
- **Round 2:** "2 sections · 1 lessons · 0 marked done"; "Try again" shown right after a correct answer.
- **Change:** learner course page, learner home cards, and section headers now pluralise ("1 section · 1 lesson · 0 marked done"). The learner quiz shows "Try again" only after a wrong answer. Also done while here: block headings are plain words now ("Video", "Quiz", "Text", "Whiteboard") instead of "Video Block" / "Quiz Block".
- **Files:** `components/CourseDetail.tsx`, `app/page.tsx`, `components/QuizBlock.tsx`, `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx`.
- **Re-test:** _pending re-test_

## Deliberately NOT fixed (Round 3)
- **Hard block on saving a quiz with no correct answer:** explicit Save warns ("Saved. Choose the correct answer…") but still saves the draft, and autosave/blur-commit save drafts as-is. A hard block would fight autosave (which exists precisely so drafts are never lost) and would need a save-time validation layer the lesson editor does not have; the per-option radio + inline hint + Save warning make the choice explicit, which is what the issue asked for.
- **In-app navigation guard:** still none — Next App Router has no reliable route-change guard. Autosave + blur-commit now make the guard unnecessary for the reported losses instead of re-implementing navigation for every Studio link.
- **Live-mode Mux upload / caption push:** unchanged. Mux fields stay (collapsed, plain-labelled) in live mode; edited captions are still not pushed to Mux — that is the known caption gap, not faked.
- **Electron shell (`~/workspace/curi-desktop`):** untouched. All changes are shared web code in `~/workspace/curi`.
- **Recorder in headless smoke test:** recording needs screen/camera permission prompts, so the automated smoke test covers the file-upload persistence path, not a live recording. The Recorder's save-take path shares the same `saveLocalVideo` code as file upload.
- **Round 2 issue 7 (synthetic-click save staleness):** low-priority robustness note, not user-facing for real mouse/keyboard use. Autosave + blur-commit mitigate it (a blur now commits before any Save click), but the underlying Astryx input commit timing was not changed.
- **No deploy / push / commit.** Per instructions; all changes are local and uncommitted.

## Verification (2026-11-11, Round 3)
- `npx tsc --noEmit`: pass.
- `npm run build`: pass (13/13 static pages).
- Production server on port 3103 (port 3100 was another agent's server, left untouched) + headless Playwright smoke walkthrough (script at `/tmp/curi-smoke/smoke3.js`, playwright-core + cached Chromium): **ALL PASS, 39/39 checks, zero console/page/request errors**. The walkthrough verified unaided: create course → section rename (blur, "Saved.", survives reload) → lesson video via file upload → quiz with visible labels + Correct radio on Option 2 (hint shown before, gone after) → **no explicit Save: autosave cleared "Unsaved changes" and the quiz + take survived reload** → Save warns on a question with no correct answer → checklist 3/5 → **"Preview as learner" clicked in the Studio lesson page opened the learner lesson in a new tab, checklist went 4/5** → learner course reads "1 section · 1 lesson" → learner video plays (readyState 4, blob URL) → wrong quiz answer shows "Try again", correct answer does not → publish → **checklist 5/5** → home lists the course → second empty course created (publish-empty confirm still works) and the **checklist still names "Smoke Course", not "Untitled course"**.
- After-fix screenshots: `screenshots-astryx/round-3/` (01 home empty, 02 course created, 03 section renamed, 04 video attached, 05 quiz filled, 06 after reload / autosave, 07 checklist 3 of 5, 08 learner course, 09 learner lesson + quiz, 10 checklist 5 of 5).
- The 3103 server was stopped afterwards. Restart: `cd ~/workspace/curi && npx next start -p 3103` (after `npm run build` if sources change).

---

## Round 3 re-test (evaluator, 2026-11-11, ~23:55–00:30 PT)

Evaluator: same separate-agent setup as Rounds 1–2 — first-time non-technical teacher, no instructions, no source-code reading, no builder help. Fresh production build (`npm run build`, 13/13 pages) served on port 3103 (port 3100 was occupied by another agent's server, PID 19756, left untouched; my 3103 server was stopped afterwards). Headless Chromium (Playwright, 1440×1100), fresh throwaway browser profile (`/tmp/curi-r3/profile`, discarded with the run). Test course: "Pasta Making Basics" (`mwcs3o3y-qmgd6ynh`), section "Getting Started", lesson "Your First Pasta" with one video block (3 s uploaded take, 32 KB webm) + one quiz block ("Quick check" title landed on the video block by a driver mis-click — see new issue A — one question, correct = Option 1). Zero console errors / page errors across the whole walkthrough (no `ERR_ABORTED` even). Screenshots: `screenshots-astryx-eval-round3/` (01–25b; 19 and 26 not captured, see notes).

### Per-task results (unaided)

| # | Task | Unaided? | Intuitiveness (1–5) | Notes |
|---|------|----------|---------------------|-------|
| 1 | Create a course (+ section) | Yes | 3 | "+ Course" obvious; Save/Publish/Preview row clear; section add works; rename shows "Saved." −2: the title fields are prefilled with literal values ("Untitled course" / "Untitled lesson" / "Untitled section"), so clicking in and typing appends — first attempt produced "Untitled coursePasta Making Basics" (screenshot 02). A teacher who doesn't notice ships a garbled title. |
| 2 | Record / upload a lesson video | Yes | 5 | "Video file / Choose File" obvious; "Video saved in this browser."; take survives reload and plays (blob URL, readyState 4, 0:00/0:03, playing with currentTime advancing). Recorder note reads "Takes are saved in this browser only." — no service name. |
| 3 | Add a quiz to a lesson | Yes | 5 | "+ Quiz block"; persistent labels above every field (Quiz title, Question prompt, Option 1–4, Explanation); "Choose the correct answer." hint until a "Correct" radio is picked; hint disappears on picking. |
| 4 | Preview as a learner | Yes | 4 | "Preview as learner ↗" on the Studio course page AND lesson page opens the learner course/lesson in a new tab; checklist step 4 is itself a link (course name + ↗) to the same page. Went 3/5 → 4/5 on the click. −1: only the course-name text on the right is the link; the "4. Preview as learner" label itself is not clickable, so the affordance is easy to miss. |
| 5 | Publish the course | Yes | 5 | Publish obvious; checklist went 4/5 → **5/5**; published course appears on learner home immediately ("1 section · 1 lesson"). |

### Per-issue verdicts (Round 2 → Round 3 claims)

- **1. No learner preview from Studio — FIXED.** "Preview as learner ↗" visible on Studio course page (next to Save/Publish) and lesson page (next to Save lesson); clicking opens the learner page in a new tab and ticks step 4 immediately. Checklist reached **5/5 unaided**. Step 4 is also a link (course name + ↗, `target=_blank`, href `/courses/<id>`). Minor: the step-4 label text itself is not the link — only the course name on the right is.
- **2. Checklist named the wrong course with >1 course — FIXED.** After creating a second empty "Untitled course", all five steps still named "Pasta Making Basics" (and steps 2/3 named the lesson "Your First Pasta"). Verified in screenshot 21.
- **3. Unsaved blocks / renames still vanish — FIXED.** Autosave verified end-to-end: quiz question + all 4 options + explanation filled, NO explicit Save pressed, waited ~2.5 s ("Unsaved changes" cleared, "Saved." shown), reloaded — every value survived (read back as input values; radio checked state `[true,false,false,false]` also survived). Video take survived reload and plays. Section rename shows "Saved." after Enter/blur. Save with a question lacking a correct answer warns: "Saved. Choose the correct answer for each question." (verified by adding a second question with no correct answer).
- **4. "Mux" still in the main video flow — FIXED.** Zero occurrences of "Mux" on the lesson page with the video block open (recorder note: "Takes are saved in this browser only."; file note: "Saved in this browser only. Takes up to 100 MB."). "Mux" remains only inside the collapsed "Advanced video settings" section, as claimed.
- **5. Quiz: placeholder-only fields, silent Option 1 default — FIXED.** Persistent labels above all fields (screenshot 10); per-option "Correct" radios (4 radio inputs); new questions start with no correct answer and show "Choose the correct answer." until one is picked; explicit Save warns when one is missing (see #3).
- **6. Copy nits — FIXED.** Learner course page reads "1 section · 1 lesson · 0 marked done"; section header "1 lesson"; learner home card "1 section · 1 lesson". No "1 lessons" anywhere. Wrong answer shows "Not quite. The correct answer is: Still firm to the bite" + explanation + a "Try again" button; after a correct answer ("1 of 1 correct", explanation shown) there is NO "Try again". Block headings are plain "Video" / "Quiz". (Caveat: after answering, the options lock — `aria-disabled` radiogroup — and the only way to re-answer is the "Try again" button or "Retake quiz".)

### New / remaining issues (ranked)

1. **Title fields are prefilled with literal values, so click-and-type appends (new, worst remaining).** Course title input holds the real value "Untitled course", lesson title "Untitled lesson", section rename "Untitled section" — not placeholders. Clicking in and typing appends: "Untitled coursePasta Making Basics", "Untitled lessonYour First Pasta" (screenshots 02, 06). A first-time teacher who types without noticing (or without knowing Ctrl+A) ships a garbled title, and the garbled name then propagates to the sidebar, checklist, learner pages, and drafts queue. Fix: empty inputs with placeholders, or select-all on focus.
2. **Step-4 link affordance is subtle.** The checklist step-4 row looks like a plain row; only the course name on the right ("Pasta Making Basics ↗") is clickable. The "4. Preview as learner" label is not a link. It works, but a teacher scanning for something to click can miss it.
3. **Description and stats run together on the learner course page.** "Learn to make fresh pasta from scratch.1 section · 1 lesson · 0 marked done" — no space or separator between the description sentence and the stats (screenshot 14).
4. **Published course still listed under "Offline drafts".** After publishing, the queue still shows "Offline drafts: 3" including "Pasta Making Basics — Course · published". The heading implies draft-only; the badge says published, but the grouping is mildly confusing.
5. **Quiz title field was the one field my "Quick check" text missed — driver note, not an app bug.** I aimed at `input:nth(1)` and hit the video title instead; the quiz title stayed empty ("Quiz title (optional)"). Not counted as an issue; the learner quiz renders fine with "Q1." and no title.

### Evaluator notes (method)
- The "Try again" check needed the real flow: after a wrong answer the options lock, so the correct answer was tested via the "Try again" button (which resets the question), not by clicking another option directly. After the correct answer, "Try again" is absent — verified.
- One driver artifact, NOT an app bug: in the first (discarded) run, a synthetic click sequence saved a title before blur; all findings above were re-verified in a single continuous session with real mouse clicks and keystrokes, and the prefilled-title append (issue 1) was reproduced twice, on both the course and lesson title fields, with plain click + type.
- The whiteboard block ("+ Whiteboard block") was present but not evaluated — out of scope for this round.
- Recorder live-recording was not tested (needs camera/screen permission prompts); the file-upload take path was verified instead, as in prior rounds.

---

## Round 3 → Round 4 fixes (2026-11-12)

All four remaining Round 3 re-test issues fixed; nothing deliberately left unfixed this round.

### 1. Title fields prefilled with literal values (worst remaining)
- **Round 3:** course/lesson/section title inputs held the real values "Untitled course" / "Untitled lesson" / "Untitled section", so plain click-and-type appended — "Untitled coursePasta Making Basics" — and the garbled name propagated everywhere.
- **Change:** select-all on focus for the three title inputs — but ONLY while the value is still its default. New shared helper `lib/title-input.ts` (`titleFocusHandlers(defaultTitle)`) returns `onFocus` + `onClick` handlers for a wrapper around the Input (Astryx TextInput exposes no `onFocus`, so the handlers live on the wrapper and the events bubble up from the inner input). Both handlers are needed: keyboard focus (Tab) fires focus with no mouse event, so the focus selection survives; a mouse click fires focus first and then mouseup, whose default caret placement collapses the focus selection — the click handler re-selects after that. Restricting to still-default values is deliberate: select-all on every focus would also wipe a real title a teacher clicked into to fix one word. Once a real title is typed, focus/click behave normally. Nothing about storage changed — no autosave/blur-commit timing touched, so the fix cannot break the save path; selection only, no value change.
- **Files:** `lib/title-input.ts` (new), `app/studio/courses/[courseId]/page.tsx` (course title + section rename wrappers), `app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx` (lesson title wrapper).
- **Re-test:** smoke test below — plain click + `keyboard.type` (no `fill`, no Ctrl+A) into all three fields; stored titles exactly the typed text after save/reload, no "Untitled" prefix. Regression guard: clicking into a real title and typing inserts mid-title ("Round Four PastaX") instead of wiping it.

### 2. Step-4 link affordance subtle
- **Round 3:** only the course name on the right of the checklist step-4 row was clickable; the "4. Preview as learner" label was not a link.
- **Change:** the whole step-4 row — label + course name — is now one link to the learner course page (new tab, ticks step 4 on click). The circle stays separate: it is the manual done/undone toggle, not part of the link (a button inside a link is invalid, and toggling must not open a tab). Plain spans, not Astryx Text, inside the link so the link colour is not overridden inline.
- **Files:** `components/TeacherChecklist.tsx`.
- **Re-test:** smoke test clicked the "4. Preview as learner" label text itself — learner course opened in a new tab, checklist went 3/5 → 4/5.

### 3. Description and stats run together on the learner course page
- **Round 3:** "Learn to make fresh pasta from scratch.1 section · 1 lesson · 0 marked done" — no space or separator.
- **Change:** description and stats are each wrapped in their own block `<div>` in the course header. Root cause: Astryx Text renders inline, so as siblings they shared one line despite the header's `space-y-3`; block wrappers put the stats on their own line below the description (the header gap supplies the spacing). Same inline-Text pattern exists on the learner home cards, but there the stats already sit in their own `HStack` row, so no change was needed there.
- **Files:** `components/CourseDetail.tsx`.
- **Re-test:** smoke test — rendered text no longer contains "scratch.1 section"; bounding boxes put the stats line below the description (desc y≈264 h≈17, stats y≈302); screenshot r4-02 confirms visually.

### 4. Published course still listed under "Offline drafts"
- **Round 3:** after publishing, the queue still showed "Offline drafts: 3" including "Pasta Making Basics — Course · published".
- **Change (picked: exclude, not relabel):** a published course is not a draft, so published courses — and their lessons — are excluded from the drafts/queue list and its count. They live on the learner home page instead. An orphan lesson with no course stays listed (it has nowhere else to be found). Rule documented in the component header comment. The panel heading stays "Offline drafts"; when everything is published it reads "No offline drafts yet."
- **Files:** `components/OfflineDraftsQueue.tsx`.
- **Re-test:** smoke test — after publishing, the drafts panel reads "No offline drafts yet." (neither course nor lesson listed); learner home still lists the published course.

## Verification (2026-11-12, Round 4)
- `npx tsc --noEmit`: pass.
- `npm run build`: pass (13/13 static pages).
- Production server on port 3103 (port 3100 was another agent's server, left untouched) + headless Playwright smoke walkthrough (script at `/tmp/curi-smoke/smoke4.js`, playwright-core + cached Chromium): **ALL PASS, 37/37 checks, zero console/page/request errors**. The walkthrough verified, with real click + keyboard.type (no `fill`) into each title field: course "Round Four Pasta", section "Getting Started" (blur → "Saved.", survives reload), lesson "Your First Pasta" (autosave, survives reload) — all stored exactly as typed, no "Untitled" prefix; clicking the step-4 label opened the learner course in a new tab and ticked step 4 (3/5 → 4/5); learner course page shows description and stats on separate lines; publishing reached **checklist 5/5**; the drafts queue then read "No offline drafts yet." while the learner home still listed the course; and clicking into the real title and typing inserted mid-title instead of wiping it ("Round Four PastaX"), restored and re-saved exactly.
- One probe note: the first smoke run showed a FAIL on the description/stats text check only because `textContent` joins block elements with no separator — the bounding-box check in the same run already proved the lines were separate (and the screenshot confirmed it). The check was corrected to use `innerText`, which reflects rendered line breaks; the re-run passed 37/37.
- After-fix screenshots: `screenshots-astryx/round-3/` (`r4-01-course-titled.png`, `r4-02-learner-course-spacing.png`, `r4-03-checklist-5of5.png` — `r4-` prefix so the Round 3 shots are not overwritten).
- The 3103 server was stopped afterwards. Restart: `cd ~/workspace/curi && npx next start -p 3103` (after `npm run build` if sources change).
