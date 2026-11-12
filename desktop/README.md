# Curi Creator — desktop creator app (first slice)

**Product name:** Curi Creator · **App ID:** `com.curi.creator` · **Version:** 0.1.0
**Stack choice (Kai, 2026-11-03):** Electron, Mac + Windows.
**Architecture rule (Kai, 2026-11-03 go-ahead):** `~/workspace/curi` stays the single
source of truth. This project is a **thin shell** — main/preload, packaging,
local-caption IPC, file picker, menu — around the shared Next.js app. It does
**not** contain a second Studio UI, and it does not copy lesson/quiz components.

## What was built

- `src/main.js` — Electron main process. `contextIsolation: true`,
  `nodeIntegration: false`. Native app menu (File / Tools / Edit / View /
  Window / Help), including **File → Open Video for Local Captions…**,
  **Tools → Local Captions…**, **Tools → Open Curi Studio (creator)** and
  **Tools → Open Learner Home (student)**. The last two prove the shell loads
  both route groups of the *same* Next.js app, not two apps.
- `src/preload.js` — the only bridge. Exposes only `window.curiCreator`
  (`isDesktop`, `pickVideo()`, `transcribe(filePath)`). No Node globals leak
  to the page.
- `src/ai-drafts.js` — local AI drafts, Step 2 (2026-11-11). Pure Node,
  no dependencies. From a Whisper transcript it builds **deterministic,
  transcript-derived** drafts: cleaned notes (markdown), timed chapters
  (titles are verbatim opening phrases from the transcript — never
  invented topics), and cloze-style MCQ drafts, each with 4 options,
  `correct_index`, explanation, and a quoted `source_text` + timestamp.
  Exports a markdown block and a quiz block in the exact `LessonContent`
  shape of `~/workspace/curi/lib/content.ts` (`{ version: 1, blocks:
  [markdown, quiz] }`). Also runnable as a CLI:
  `node src/ai-drafts.js test-samples/jfk-caption.json test-samples/jfk-drafts.json`.
  It is deterministic because the local-LLM attempt was tried and
  rejected on evidence (see "AI drafts" section below) — it never
  invents content beyond the transcript.
- `src/captions.html` + `src/captions-renderer.js` — the Local Captions
  window now has an **AI drafts** section: after transcription, "Generate
  draft notes, chapters & quiz" fills two editable textareas (notes +
  chapters markdown; quiz block JSON) and offers Copy markdown block /
  Copy quiz block / Copy all blocks (LessonContent JSON) to paste into
  Studio as editable blocks. Nothing is published automatically and
  nothing is written to Supabase from this window.
- `src/preload.js` — exposes `window.curiCreator.generateDrafts(transcript)`.
- `src/capture.html` + `src/capture-renderer.js` — **in-app desktop
  capture (Step 3, 2026-11-11)**. A Capture window (menu: **Tools →
  Record Screen + Camera…**, also **File → Record Screen + Camera…**,
  `CmdOrCtrl+R`) that lists screen/window sources via
  `desktopCapturer.getSources` (new `curi:capture-sources` IPC), records
  screen + camera picture-in-picture on a 1280×720 canvas — the same
  layout as the web Recorder (`~/workspace/curi/components/Recorder.tsx`:
  screen fills the canvas, camera 320×180 bottom-right, 16 px inset,
  white border) — with Start / Pause / Resume / Stop & save, a live
  preview, and an elapsed timer. Output is a local `.webm`
  (MediaRecorder, VP9 where supported) saved to the Recordings folder
  (new `curi:capture-save` IPC). After Stop it offers **Caption this
  recording** (existing `curi:transcribe` Whisper worker) and **Generate
  drafts** (existing `curi:generate-drafts`), plus Show in folder / Copy
  file path. Mux upload is **not** reimplemented: the teacher uploads
  the same file through Studio's existing video-block Mux upload, then
  pastes the VTT into that block's Edited captions field.
- `src/main.js` — `curi:capture-sources` / `curi:capture-save` /
  `curi:capture-recordings-dir` / `curi:capture-open-recording` IPC
  handlers, `createCaptureWindow()`, menu entries, and an env-gated
  verification hook (`CURI_CAPTURE_DEMO_MS` +
  `CURI_CAPTURE_SCREENSHOT_PATH`) that drives a real screen-only
  capture headlessly for screenshots — see "Verified" below.
- `src/preload.js` — exposes `window.curiCreator.getCaptureSources()`,
  `.saveRecording(arrayBuffer, filename)`, `.getRecordingsDir()`,
  `.openRecording(filePath)` alongside the existing bridge.
- `src/main.js` — `curi:generate-drafts` IPC handler (calls `ai-drafts.js`
  directly in the main process; no worker spawn needed, no native deps),
  plus an env-gated verification hook (`CURI_CAPTIONS_DEMO_FILE` +
  `CURI_CAPTIONS_SCREENSHOT_PATH`) that drives the real captions UI flow
  headlessly for screenshots — see "Verified" below.
- `src/caption-worker.js` — local transcription, run as a separate system-Node
  process spawned by main (so ONNX does not live inside Electron). Model:
  **Xenova/whisper-tiny.en (local ONNX, no cloud, no API key)**. It first
  extracts 16 kHz mono audio with `ffmpeg` (so OBS video exports work too),
  decodes the WAV itself (transformers.js in Node has no `AudioContext`, so
  passing a file path fails — this was hit and fixed during verification),
  then returns `{ model, file, durationMs, segments, vtt, text }`.
  On any failure it exits non-zero and the error is shown verbatim. It never
  returns sample/fake transcript text.
- `scripts/check-shared.js` — guard against forking. Run with
  `npm run check:shared`. It fails if `curi-desktop/src` contains copies of
  the shared lesson/quiz components or re-implements `LessonBlock` /
  `renderMarkdown`, and fails if the curi Studio and learner code stop
  importing the same shared modules (see "Shared code" below).
- `build/icon.png` — **placeholder icon only** (512×512 violet square, drawn
  locally). It is not a finished product icon. Proper `.icns` (Mac) / `.ico`
  (Windows) assets must be supplied on the packaging machine; the builder
  config points at this PNG as the placeholder source.

## How to run it in dev (the only mode verified here)

1. Start the Curi web app (from `~/workspace/curi`, the shared codebase):
   ```bash
   cd ~/workspace/curi && npm run start -- -p 3100
   ```
   (That serves the current production build, build id `T02QM-AcTrfz-4pGYva-b`
   at the time of writing. A fresh `npm run build` there is the normal
   pre-step if the web app changed.)
2. In a second terminal:
   ```bash
   cd ~/workspace/curi-desktop && npm install && npm start
   ```
   On Linux as root, Electron needs `--no-sandbox` (see `npm run start:dev`,
   which sets `CURI_STUDIO_URL` and `--no-sandbox`). On a normal Mac/Windows
   user account, plain `npm start` is expected.
3. The main window opens the Studio at `http://localhost:3100/studio`.
   Use **Tools → Open Learner Home (student)** to load `/` from the same app.
   Use **Tools → Local Captions…** to pick a file, transcribe locally, copy
   the WebVTT, and paste it into the **Edited captions** field of the same
   lesson's video block in Studio. That edited-caption field is the existing
   shared Curi field — captions are not re-implemented as a second system.

Environment override: set `CURI_STUDIO_URL` to load a different Studio URL
(e.g. a different port). Default is `http://localhost:3100/studio`.

## OBS-upload path (documented, not reimplemented)

1. Record in OBS Studio (or any recorder) and export a video file.
2. In Curi Creator: **Tools → Local Captions…** → Choose file → Transcribe
   locally → Copy VTT.
3. In Studio, open the lesson, add / open its video block, upload the same
   OBS file through Studio's existing Mux upload (the upload flow, webhook,
   and playback ID are unchanged web-app code), then paste the copied VTT
   into that video block's **Edited captions** field and save the lesson.
4. Learners see those edited captions in the lesson player (shared
   `VideoBlock` code). Note the pre-existing Curi gap: edited captions are
   not yet pushed back to Mux itself, because Mux's track API needs a
   publicly hosted VTT URL and Curi has no public VTT host yet.

## In-app desktop capture (2026-11-11, Step 3)

**Recordings folder.** `app.getPath('videos')` + `Curi Creator` — i.e.
`~/Videos/Curi Creator` on Linux/Mac, `Videos\Curi Creator` on
Windows (created on first save; falls back to
`userData/Recordings` if the videos path is unavailable). No
user-specific path is hardcoded. Filenames are timestamped
`curi-recording-<ISO>.webm`.

**How a teacher uses it.** Tools → Record Screen + Camera… → pick a
screen/window (thumbnails) and a mode (Screen + camera / Screen only /
Camera only) → Start → Pause/Resume as needed → Stop & save → preview
the clip in the window → **Caption this recording** → **Generate
drafts** → in Studio, upload the same `.webm` through the video
block's existing Mux upload and paste the VTT into Edited captions.
Nothing is uploaded or published from the Capture window itself.

**System audio, stated precisely.** The recorder requests system audio
from the desktop source (Chrome desktop-capture audio constraint) and
detects whether the platform actually provides it: if the desktop
stream carries no audio track, the UI reports "System audio: NO" and
the recording is mic-only (mic is preferred as the single audio track
when present, matching the web Recorder). **On this Linux VM system
audio is unavailable** — the request fails with "Could not start audio
source" and no mic exists either ("Requested device not found"), so
the verified clip is video-only. **Mac/Windows system-audio status is
UNVERIFIED** — it needs a real Mac/Windows test; do not claim it
works there. The same applies to camera PiP on Mac/Windows: the PiP
composite code mirrors the web Recorder, but no camera was available
on this VM to exercise it, so camera PiP is verified only in code,
not on a real camera.

**Verified on this VM (2026-11-11).** Headless run under xvfb
(`CURI_CAPTURE_DEMO_MS=6000`, dev mode, no server on 3100): the demo
picked the first screen source ("Entire screen"), recorded screen-only
for 6 s (timer `00:06`), and saved
`/home/hatch/Videos/Curi Creator/curi-recording-2026-11-11T20-36-05-712Z.webm`
(**626,233 bytes**). `ffprobe`: VP9, 1280×720, **167 frames decoded
cleanly by ffmpeg with no errors** (~28 fps over 6 s); frame 0
extracted as a valid 1280×720 PNG shows the Capture window itself
(recursive screen capture — proof the pixels are the real screen).
One quirk, recorded not hidden: `ffprobe` reports **duration N/A**
and `avg_frame_rate 0/0` — the MediaRecorder webm carries no container
duration metadata, so duration must be read from the UI timer (6 s)
or the frame count (~167/30 ≈ 5.6 s), not from ffprobe. The clip
plays in the window's preview and decodes fully; seeking in some
players may be imprecise until the duration metadata is fixed (later
slice: remux/fix duration on save).
Camera status on this VM: **none** — `/dev/video*` absent,
`enumerateDevices()` returned 0 video inputs, UI says "No camera
found… will fall back to screen-only", and the clip is screen-only.
System audio on this VM: **unavailable** (see above); mic also absent.
Screenshot: `screenshots/capture-step3.png` shows the real Capture UI
after the save (saved path, timer, audio report, preview canvas
showing the screen). `npm run check` passes (now also syntax-checks
`src/capture-renderer.js`). **Packaged build re-verified the same day:**
because the capture code lives in main/preload paths the packaged app
needs, `npm run dist:linux` was rebuilt and the unpacked app launched
offline (port 3100 down, bundled server up at `127.0.0.1:45917`) with
the same capture demo — 5 s, saved
`curi-recording-2026-11-11T20-40-01-327Z.webm` (592,620 bytes, VP9
1280×720, 123 frames decoded cleanly), screenshot
`screenshots/packaged-capture-step3.png`. The packaged build is NOT
stale relative to Step 3.
**Caption step on the captured clip:** the clip has **no audio stream
at all**, so the caption worker fails at ffmpeg extraction ("Output
file does not contain any stream") — expected for a silent clip, and
the error is surfaced verbatim, not faked. Per the task fallback, the
caption + drafts step was run on the existing speech sample instead:
`node src/caption-worker.js test-samples/jfk.wav` → Whisper tiny,
5.1 s, 2 segments, "And so my fellow Americans ask not what your
country can do for you ask what you can do for your country."
(`test-samples/jfk-caption.json` shape), and `node src/ai-drafts.js`
on it → 1 chapter, 3 questions, 2 notes, deterministic-rule-based.
The Capture window's Caption/Drafts buttons call the same IPC
handlers verified in Steps 1–2; the button flow on a clip *with*
speech still needs a real spoken take (no mic exists on this VM).

**NOT verified in this slice.** Camera PiP on a real camera
(Mac/Windows or any machine with a webcam); system audio on
Mac/Windows; pause/resume by a human hand (code path exists and the
demo exercised start/stop; pause/resume was not exercised headlessly);
window (single-app) capture vs full-screen capture; live
Supabase/Mux (capture never touches them by design).

## Packaging: Mac (dmg) + Windows (nsis) — configured, NOT built here

`package.json` `build` section (electron-builder) configures:
- `appId: com.curi.creator`, `productName: Curi Creator`
- Mac target `dmg`, category productivity, icon `build/icon.png`
- Windows target `nsis` (non-one-click, installation directory changeable),
  icon `build/icon.png`
- Linux target `AppImage` — **verification only** (see "Packaged mode" below)
- Output directory `dist/`

Build commands (for a Mac/Windows machine or CI runner):
```bash
npm run dist:mac   # electron-builder --mac
npm run dist:win   # electron-builder --win
npm run dist       # both, on a runner that can do both
```

**Plainly stated: no signed Mac/Windows installer was produced or notarized
from this Linux VM, and none should be claimed.** electron-builder for Mac
dmg and Windows nsis, code signing, and Apple notarization require a
Mac/Windows runner (or Kai's own Mac/Windows machine) with signing
certificates, plus real `.icns`/`.ico` icons. The config above is ready for
that runner; the only packaged run actually verified on this VM is the Linux
AppImage (see "Verified on this VM" below). Auto-update is also not configured
in this slice — `electron-updater` is intentionally not included yet, so do
not promise in-app updates.

## Packaged mode — bundled offline Studio (2026-11-11, Step 1)

A packaged build now runs Studio **offline, with no dev server**. How it works:

1. `~/workspace/curi/next.config.ts` sets `output: 'standalone'`
   (compatible with the existing `cacheComponents`, `partialPrefetching`
   and turbopack CSS rules — checked against the Next 16 docs in
   `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`;
   no config conflict). `npm run build` in `~/workspace/curi` emits
   `.next/standalone` with `server.js` + traced `node_modules`.
2. `scripts/bundle-web.sh` (run as `npm run bundle:web`) copies that
   standalone output plus `.next/static` and `public` (neither is in the
   standalone folder by default — the Next docs say to copy them manually)
   into `resources/curi-web/` in this project. That directory is a **build
   artifact, ~69 MB, gitignored (`resources/`)** — regenerated by the
   script, never committed. (One VM quirk: the script uses `cp -r`, not
   `cp -a`, because `cp -a` aborts on "failed to preserve ownership" for
   some traced files here.)
3. electron-builder packs it via `extraResources` (`resources/curi-web` →
   `resources/curi-web` inside the app), so the installed app contains the
   whole web server.
4. In packaged mode `src/main.js` spawns `resources/curi-web/server.js`
   using the Electron binary itself as Node
   (`ELECTRON_RUN_AS_NODE=1`, `process.execPath`), on a free localhost
   port it probes for first (it does **not** assume port 3100), polls
   `http://127.0.0.1:<port>/studio` until it responds (up to 30 s), then
   loads Studio from it. The server is stopped when the app quits. The
   Tools menu (Open Curi Studio / Open Learner Home / Open in Browser)
   points at the bundled server in packaged mode and at
   `CURI_STUDIO_URL` / `localhost:3100` in dev mode.
5. `src/packaged-not-bundled.html` is now only a **genuine failure
   fallback**: it shows only if the bundle is missing or the bundled
   server fails to start, and its text says so, with rebuild/dev
   instructions.

Full rebuild + verify cycle (Linux verification build):
```bash
cd ~/workspace/curi && npm run build
cd ~/workspace/curi-desktop && npm run bundle:web && npm run dist:linux
# Launch the packaged app offline (no server on port 3100):
./dist/linux-unpacked/curi-creator --no-sandbox
# or the AppImage: ./dist/Curi\ Creator-0.1.0.AppImage --no-sandbox
# Screenshot hook (existing): CURI_SCREENSHOT_PATH=.../x.png ./dist/linux-unpacked/curi-creator --no-sandbox
```

Version was **not** bumped for this slice (still 0.1.0): this is a
packaging change with no user-facing version story yet; bump it when a
signed Mac/Windows installer ships.

## Teacher checklist + offline drafts queue (2026-11-11, Step 4)

**Where it lives:** shared web code in `~/workspace/curi` —
`components/TeacherChecklist.tsx`, `components/OfflineDraftsQueue.tsx`,
rendered on the Studio home page (`app/studio/page.tsx`), queue count
in the sidebar (`components/StudioShell.tsx`). The desktop shell loads
them from the bundled web app; no checklist/queue UI was added to
`curi-desktop/src`, and `npm run check` (check-shared) still passes.

**Checklist.** "Get started": (1) Create a course, (2) Record a lesson,
(3) Add a quiz, (4) Preview as learner, (5) Publish. Steps 1, 2, 3, 5
auto-detected from real Studio state; step 4 is a manual tick, labelled
as manual. Every step is a real link/action to the existing place
(course page, lesson page with its video-block recorder, quiz block
editor, learner course route, Publish control). Step 2 notes the desktop
path: Tools → Record Screen + Camera…, then upload the saved clip
through the lesson's video block. Dismissal persists in localStorage
(`curi-teacher-checklist-v1`) and survives reload; a "Show the
get-started checklist" link restores it.

**Queue.** Demo mode: every browser-only course/lesson listed as
**QUEUED — NOT SYNCED** (never claimed synced); edited captions and
caption-window drafts show as blocks inside their lesson. Live mode:
the panel states there is no offline queue and no sync engine — Studio
saves directly to Supabase. **No sync engine was built in this step**
and none should be claimed: work created offline does not sync itself
when a backend appears later. That is the next slice's work (see
"Next slice" item 4).

**Verified on this VM (2026-11-11).** `npm run build` + `npx tsc
--noEmit` pass in `~/workspace/curi`; `npm run lint` is back to the
pre-existing 4 errors + 17 warnings (course page, VideoBlock,
studio-store — untouched by this slice; one new lint error in the
checklist was fixed, not left in). `npm run check` passes in
`curi-desktop`. Real-browser walkthrough (Playwright, production
server on 3100, fresh localStorage): checklist 0 of 5 → created a
course from the checklist itself → 1 of 5 → added a section + lesson
with a video block and a quiz block, saved → published the course →
4 of 5 → ticked Preview → 5 of 5; queue went 0 → 1 → 2 queued
(course + lesson, both QUEUED — NOT SYNCED); Dismiss hid the panel
and it stayed dismissed after reload, and restoring it showed 5 of 5
persisted. Screenshots: `screenshots/step4-checklist-initial.png`
(0/5), `screenshots/step4-checklist.png` (5/5),
`screenshots/step4-queue.png` (2 queued). **Packaged build rebuilt
and re-verified the same day** (web code is bundled, so a rebuild was
required): `npm run bundle:web` + `npm run dist:linux` produced a
214 MB AppImage; launched offline with port 3100 down, log shows
`[curi-creator] bundled web server up at http://127.0.0.1:41401`, and
`screenshots/packaged-studio-step4.png` shows the real Studio with
the 0/5 checklist and the "Offline drafts: 0 queued — not synced"
sidebar indicator. The packaged build is NOT stale relative to Step 4.

**NOT verified in this slice.** Mac/Windows (Linux AppImage only, as
before); live Supabase/Mux behaviour of the checklist/queue (live-mode
auto-detection loads course detail via the existing
`ensureCourseLoaded` path, but no live project was connected here, so
the live-mode panel text is verified only in code, not against a real
backend); real-teacher usability testing (no teacher has used the
checklist yet — whether the steps match how a teacher actually works
is still open).

## AI drafts from the local transcript (2026-11-11, Step 2)

**What was built.** After transcription, the Local Captions window
(**Tools → Local Captions…**) offers **Generate draft notes, chapters &
quiz**. It produces, from the transcript only:

1. **Notes** — cleaned markdown: filler-trimmed (`um`, `uh`, `you know`),
   sentence-cased, one timestamped bullet per sentence. No content is
   added beyond the transcript.
2. **Chapters** — transcript segments grouped into timed chapters (a
   chapter breaks at a sentence end after ≥ 5 s, or at 60 s). Titles are
   the chapter's opening words, verbatim from the transcript — no
   chapter topics are invented.
3. **MCQ drafts** — up to 3 cloze (fill-in-the-blank) questions built from
   keywords actually in the transcript. Each has 4 options,
   `correct_index`, an explanation quoting the source sentence, and
   `source_timestamp` / `source_text`. The distractors are other
   transcript words.

The teacher edits the drafts in the window, then copies **(i)** a
markdown block (notes + chapters) and **(ii)** a quiz block — or both
together as one `LessonContent` JSON object (`{ version: 1, blocks:
[markdown, quiz] }`, the exact shape in `~/workspace/curi/lib/content.ts`)
— and pastes them into Studio as editable blocks to review. **Never
auto-published:** this window does not write to Supabase or to Studio's
store; drafts land in a lesson only when the teacher pastes them there.
Every draft is labelled DRAFT in the UI, in the exported blocks, and in
the quiz title ("Draft quiz — review before publishing").

**How a teacher uses it.** Tools → Local Captions… → Choose file →
Transcribe locally → Generate draft notes, chapters & quiz → edit the
two textareas → Copy markdown block (JSON) / Copy quiz block (JSON) /
Copy all blocks (LessonContent JSON) → in Studio, add a markdown block
and a quiz block to the lesson and paste each in (or paste the
"all blocks" JSON as the lesson's blocks) → review every question's
answer and explanation, rewrite the wording, then publish the lesson
normally.

**Model used: none — deterministic fallback, and why.** A small local
instruct model was tried first on this VM, as instructed, and rejected
on evidence (probe scripts were in `/tmp`, deleted after the run; the
downloaded model cache was also deleted):

- `Xenova/Qwen2.5-0.5B-Instruct` — Hugging Face returns **401** for this
  repo ("Invalid username or password"); it is gated, so it cannot be
  downloaded without an HF account/token. Unusable for an offline,
  no-account desktop app.
- `Xenova/Qwen1.5-0.5B-Chat` (public, ~466 MB download) — loads and
  runs, but on this VM (6 GB RAM / 1.5 CPU, ~900 MB free) generation
  took **~51 s for 150 tokens at ~2.5 GB RSS**, and the output
  **hallucinated**: for the JFK sample it invented "The American Dream
  is a dream of equal opportunity and prosperity… hard work,
  perseverance, and individualism" — none of which is in the
  transcript — then drifted into Korean mid-answer. A draft generator
  that invents lesson content is worse than none, so the LLM path is
  **not wired in**. The deterministic fallback (`src/ai-drafts.js`) is
  labelled as such in the UI, in the README, and in the code header.

**The MCQ-draft limit, stated precisely.** Rule-based MCQs are
cloze/keyword-based and weaker than LLM drafts: they test recall of
what was said, not comprehension of ideas; all questions on a short
transcript blank words from the same one or two sentences; and on a
transcript with fewer than 4 distinct content words no question can be
built at all (each needs 3 transcript distractors). A local LLM is a
later slice on a real machine — with a bigger, better model and a
faithfulness check that every draft claim is grounded in the
transcript. Do not present these drafts as AI-comprehension questions.

**Verified on this VM (2026-11-11).** Caption worker re-run on
`test-samples/jfk.wav` (cached model, ~17 s incl. ONNX warnings) then
`node src/ai-drafts.js test-samples/jfk-caption.json
test-samples/jfk-drafts.json`. Real output saved in
`test-samples/jfk-drafts.json` (method `deterministic-rule-based`):
2 notes (`[00:00]` "And so my fellow Americans ask not what your
country can do for you", `[00:07]` "Ask what you can do for your
country."), 1 chapter `[00:00]` titled "And so my fellow Americans
ask not what your country can…" (0:00–0:10), and 3 MCQ drafts, all
sourced at `00:00` from the quoted sentence, e.g. Q1 blanks "ask"
(correct_index 3, options country/fellow/americans/ask), Q2 blanks
"country" (correct_index 0), Q3 blanks "fellow" (correct_index 1).
Exported `lessonContent` validated: `{ version: 1, blocks:
[markdown draft-md-1, quiz draft-quiz-1] }`, 3 questions, every
question 4 options with a valid `correct_index` and an explanation +
source. The full Electron flow was exercised headlessly under xvfb
(`CURI_CAPTIONS_DEMO_FILE=…/jfk.wav`, dev server on 3100): the log
reports `captions demo: demo: done` and UI state `vttChars 175,
notesChars 533, quizChars 1679, "Drafts ready: 1 chapter(s), 3
question(s), 2 note(s). Method: deterministic-rule-based"`, and
`screenshots/drafts-captions.png` shows the real drafts UI (DRAFT
notice, notes markdown, quiz JSON, three copy buttons). `npm run
check` passes (now also syntax-checks `src/ai-drafts.js`). Step 1
regression check, same day: `npm run dist:linux` rebuilt cleanly with
the new `main.js`, and the rebuilt unpacked app launched offline (port
3100 down, bundled server up at `127.0.0.1:37303`) showing the real
Studio — `screenshots/packaged-studio-step2.png` is byte-identical
(md5 `78ded639…`) to Step 1's `packaged-studio.png`. Dev mode was
re-verified in the same session (Studio HTTP 200 on 3100, Electron
loaded it in the drafts screenshot run).
One headless quirk, recorded not hidden: the first screenshot captured
a stale frame (empty VTT, "Transcribing…" status) even though the flow
had completed — the demo hook now waits 3 s after the flow and scrolls
the drafts section into view before capturing, and logs the textarea
lengths so the UI state is proven independently of the pixels.

**NOT verified in this slice.** LLM draft quality on long, noisy, or
non-English lessons (no LLM is wired in at all); draft quality on a
real multi-minute creator lesson (only the 11-second JFK clip has been
run); Mac/Windows; live Supabase/Mux (drafts never touch them by
design); the menu-click → captions-window → transcribe flow by a human
hand on Mac/Windows (still needs a manual click-through, as before).

## Shared code — Studio and learner use ONE codebase (no fork)

`~/workspace/curi` is the single source of truth. The desktop shell loads it
by URL; it contains no React/Next components of its own. Verified by
`npm run check:shared` and by reading the imports (no curi code was moved
or refactored for this slice, because no shared folder was needed — the
shared code already lives in `~/workspace/curi` and both route groups import
it via the `@/` alias):

| Shared item | File in `~/workspace/curi` | Used by Studio | Used by learner |
|---|---|---|---|
| Block model + types (`LessonBlock`, `VideoBlock`, `MarkdownBlock`, `QuizBlock`, `QuizQuestion`, `LessonContent`, `Course`, `Section`, `Lesson`, `SectionDependency`) + `emptyContent()`, `parseContent()`, `newId()` | `lib/content.ts` | Studio lesson editor imports `lib/content` + `newId`/`emptyContent` | `LessonDetail`, `CourseDetail`, `LessonRenderer` import `lib/content` types/parsers |
| Markdown rendering (`renderMarkdown`) | `lib/markdown.ts` | Studio lesson editor previews markdown with `renderMarkdown` | `LessonRenderer` renders markdown blocks with the same `renderMarkdown` |
| Lesson rendering (video + markdown + quiz blocks) | `components/LessonRenderer.tsx` | — (Studio *edits* blocks; it does not re-render them as a second renderer) | `LessonDetail` renders via `LessonRenderer` |
| Video block player + edited captions | `components/VideoBlock.tsx` | Video block editor edits the same block fields the player reads | `LessonRenderer` → `VideoBlock` |
| Quiz block player (MCQ, feedback, explanation, retake) | `components/QuizBlock.tsx` | Quiz block editor edits the same question/option/explanation fields | `LessonRenderer` → `QuizBlock` |
| Course/lesson data paths | `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/mux.ts`, `app/api/mux/*` | Studio reads/writes Supabase rows + Mux direct uploads | Learner pages read the same Supabase rows + Mux playback IDs |
| Course/section/lesson routes | `app/studio/*` (creator) and `app/courses/*` + `app/page.tsx` (learner) in the same Next app | — | — |

**What is deliberately different (not a fork):** the Studio lesson page is an
*editor* (title input, block add/move/delete, markdown textarea, quiz
question editor, Recorder, Mux upload inputs) and the learner page is a
*renderer* (LessonRenderer/VideoBlock/QuizBlock, self-mark Done). They edit
and render the same `LessonContent` JSON; neither duplicates the other's
logic. The Studio's browser-only demo store (`lib/studio-store.tsx`) is
creator-side state only and is not a second content model.

**Desktop shell renders the same code:** because the Electron window loads
`http://localhost:3100/studio` (creator) and `http://localhost:3100/` +
`/courses/*` (learner) from the running Next.js server, the lesson/quiz code
executed inside Electron is byte-for-byte the web app's code — there is no
second copy in `curi-desktop/src` to drift. `check-shared.js` enforces this.

## Verified on this VM (Linux, 2026-11-03 + 2026-11-11)

- `npm install` in `curi-desktop`: succeeded (461 packages; Electron 32,
  electron-builder 25, @xenova/transformers 2.17.2).
- `npm run check` (node syntax checks + `check-shared`): passed.
- Caption worker end-to-end, real audio, no fake text: `node
  src/caption-worker.js test-samples/jfk.wav` (11-second JFK speech sample,
  `test-samples/jfk.wav`, 1.9 MB). First run ~23 s including model download;
  cached run **6.5 s**. Output (saved in `test-samples/jfk-caption.json`):
  "And so my fellow Americans ask not what your country can do for you ask
  what you can do for your country." — 2 segments with timestamps, valid
  WebVTT. Model cache on this VM: 42 MB under
  `node_modules/@xenova/transformers/.cache/Xenova/whisper-tiny.en`.
- One caption failure was hit and fixed during verification, and is worth
  knowing: transformers.js in Node cannot load audio from a file path
  (`AudioContext` is not available). The worker now decodes the 16 kHz WAV
  itself and passes Float32 samples to the pipeline. Do not revert that
  change or the worker will fail again in exactly the same way.
- Packaged offline Studio, 2026-11-11 (Step 1): `output: 'standalone'`
  added to `~/workspace/curi/next.config.ts`; `npm run build` there
  succeeded (13 routes, incl. `/studio` static); `npx tsc --noEmit`
  passed. `npm run lint` reports 4 errors + 17 warnings, all
  **pre-existing** in `app/studio/courses/[courseId]/page.tsx`,
  `components/VideoBlock.tsx`, `lib/studio-store.tsx` — untouched by this
  slice (only `next.config.ts` changed in `~/workspace/curi`).
  `ELECTRON_RUN_AS_NODE=1` with the Electron binary serving
  `resources/curi-web/server.js` was verified directly first (HTTP 200
  on `/studio` at port 3101). `npm run bundle:web` produced a 69 MB
  `resources/curi-web/` (gitignored). `npm run dist:linux` built
  `dist/Curi Creator-0.1.0.AppImage` (215 MB) + `dist/linux-unpacked`
  (585 MB). The unpacked app was launched under `xvfb-run` with **no
  server on port 3100** (verified down before and after launch); its log
  shows `[curi-creator] bundled web server up at
  http://127.0.0.1:35889`, and the `CURI_SCREENSHOT_PATH` capture at
  `screenshots/packaged-studio.png` shows the real Studio (empty start,
  Demo mode, + Course) — byte-identical (md5 `78ded639…`) to a dev-mode
  capture of the same page, i.e. the packaged app renders the same
  Studio as the dev server. No stray server processes remained after
  the launch (ports 3100/35889 down). Dev mode was re-verified the same
  day: `npm run start -- -p 3100` + `npm run start:dev` loads Studio
  unchanged. Non-fatal headless-Linux dbus/GPU warnings appeared in the
  log and did not prevent the window or the screenshot.
- Electron launch + Studio page + screenshot: the Electron app was launched
  under `xvfb-run` on this Linux VM (`--no-sandbox`, as root) against a
  fresh `~/workspace/curi` server on port 3100. Its `capturePage()` output
  is saved in `screenshots/electron-studio.png` and shows the real Studio
  (empty start, slothUI theme, violet + Course) — the same web app, not a
  mock. Non-fatal headless-Linux dbus/GPU warnings appeared in the log and
  did not prevent the window or the screenshot.
- IPC transport limitation, stated precisely: the caption *worker* (the
  code the IPC handler spawns) was exercised end-to-end above, and the
  captions window HTML/renderer passed syntax checks, but the
  menu-click → captions-window → transcribe flow inside the Electron UI
  was **not** automated on this VM (no native-menu automation was
  available here). That flow needs a manual click-through on Mac/Windows
  before it is claimed as verified.

## NOT verified (do not claim)

- Signed Mac `.dmg` or Windows `.nsis` installers, Apple notarization,
  Windows code signing, auto-update, or any installer at all. The Linux
  AppImage built here is a **verification build only** — it proves the
  bundled-server approach works, not that Mac/Windows installers work.
- The packaged app on an actual Mac/Windows machine (bundled-server spawn
  via `ELECTRON_RUN_AS_NODE` was verified only on this Linux VM).
- System-audio capture on Mac/Windows (in-app capture exists now, but
  system audio was unavailable on this Linux VM and is UNVERIFIED on
  Mac/Windows; camera PiP likewise needs a real camera).
- Live Supabase/Mux flows (sign-in, RLS, Mux upload/playback, webhook) —
  unchanged from the web app, still untested against a live project.
- Performance or accuracy of Whisper tiny on long, noisy, or non-English
  audio — the only verified sample is the 11-second English JFK clip above.
  Tiny-model quality on real creator lessons still needs a real-lesson test.

## Next slice (left for later, in order)

1. ~~Package the Next.js standalone build into `resources/curi-web/` and
   verify a packaged app offline (no dev server).~~ **Done 2026-11-11**
   (Linux verification build only — Mac/Windows installers still unbuilt).
2. ~~Notes + MCQ drafts from the local transcript (same transcript the
   caption step already produces; creator edits before publish).~~
   **Done 2026-11-11** — deterministic transcript-derived drafts
   (notes/chapters/cloze MCQs), editable in the captions window, exported
   as markdown + quiz blocks for Studio. Local-LLM drafts remain a later
   slice (0.5B model tried and rejected: gated Qwen2.5, hallucinating
   Qwen1.5 — see "AI drafts" section).
3. ~~Desktop capture (screen + camera + system audio, pause/resume, silence
   trimming) replacing/augmenting the browser recorder.~~ **Done
   2026-11-11** — in-app Capture window (screen + camera PiP, pause/
   resume, local .webm, caption + drafts wiring); system audio is
   mic-only on this Linux VM and UNVERIFIED on Mac/Windows; camera PiP
   still needs a real-camera test; silence trimming not built.
4. ~~Offline queue: draft lessons/captions saved locally and synced to
   Supabase/Mux when online.~~ **Partly done 2026-11-11 (Step 4)** —
   the teacher checklist and the offline-drafts queue *view* are built
   (demo items listed QUEUED — NOT SYNCED; live mode honestly reports
   no queue). Still missing: the actual sync engine that uploads queued
   work to Supabase/Mux when a backend appears.
5. Auto-update + real icons + signing/notarization on a Mac/Windows runner.
