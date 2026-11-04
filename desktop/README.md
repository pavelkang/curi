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
- `src/captions.html` + `src/captions-renderer.js` — a small in-shell
  "Local Captions" window. It does not upload anything and does not replace
  Studio's Mux upload flow.
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

## Packaging: Mac (dmg) + Windows (nsis) — configured, NOT built here

`package.json` `build` section (electron-builder) configures:
- `appId: com.curi.creator`, `productName: Curi Creator`
- Mac target `dmg`, category productivity, icon `build/icon.png`
- Windows target `nsis` (non-one-click, installation directory changeable),
  icon `build/icon.png`
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
that runner; the only run actually verified on this VM is the dev run on
Linux (see "Verified on this VM" below). Auto-update is also not configured
in this slice — `electron-updater` is intentionally not included yet, so do
not promise in-app updates.

## Packaged mode, later (not faked)

Dev mode loads `http://localhost:3100/studio`. In a packaged build, main.js
first looks for a bundled web build at `resources/curi-web/index.html`. That
bundle does **not** exist in this slice, so a packaged run currently shows
`src/packaged-not-bundled.html` — an honest explanation page with the dev
instructions — instead of silently loading a remote URL or pretending Studio
is bundled. The next packaging slice is: produce the Next.js standalone
output (or a bundled local server) from `~/workspace/curi` and copy it into
`resources/curi-web/` at build time, then re-test the packaged app offline.
Until that slice lands, "packaged app" means the installer shell + config,
not a working offline Studio.

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

## Verified on this VM (Linux, 2026-11-03)

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
  Windows code signing, auto-update, or any installer at all.
- System-audio capture on Mac/Windows (the web recorder and OBS path are
  the only capture paths in this slice; desktop capture is a later slice).
- Live Supabase/Mux flows (sign-in, RLS, Mux upload/playback, webhook) —
  unchanged from the web app, still untested against a live project.
- Performance or accuracy of Whisper tiny on long, noisy, or non-English
  audio — the only verified sample is the 11-second English JFK clip above.
  Tiny-model quality on real creator lessons still needs a real-lesson test.

## Next slice (left for later, in order)

1. Package the Next.js standalone build into `resources/curi-web/` and
   verify a packaged app offline (no dev server).
2. Notes + MCQ drafts from the local transcript (same transcript the
   caption step already produces; creator edits before publish).
3. Desktop capture (screen + camera + system audio, pause/resume, silence
   trimming) replacing/augmenting the browser recorder.
4. Offline queue: draft lessons/captions saved locally and synced to
   Supabase/Mux when online.
5. Auto-update + real icons + signing/notarization on a Mac/Windows runner.
