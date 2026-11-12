# Curi student-side evaluation — first-time student walkthrough

Evaluator: a separate agent acting as a first-time student who has never seen
Curi. No instructions beyond the goal **"find a course and complete a lesson"**.
Read-only vs the repo: no code was edited. This file is the student-side
companion to `UI-EVAL-LOG.md` (creator/teacher evaluator).

## Verdict

**Once a published course exists in the same browser, YES — the student
completed every step unaided.** Home → course → lesson → video → notes →
whiteboard → quiz → mark done, all without instructions, with very little
reading (lesson page: 97 visible words total, including nav and banner).
**But a real student on a fresh device completes nothing**: in demo mode
there are no courses to find at all (finding A1), and progress lives in one
browser only. That is a backend gap, not a UI gap — do not confuse the two.

## Build state tested

- Final clean build: **`mXPC9ltYfHlYSAuyWoW8W`** (Next.js 16.4.5, `npm run build`
  pass, TypeScript pass, 13/13 pages), served fresh on port 3100.
- **Two builds were tested.** The first build in this session,
  `Lk_jTDOtCsYJ7bGm7U6gL`, had a crashing Studio lesson editor (finding B1);
  the TLDraw agent fixed it mid-evaluation (23:22 UTC) and the final build
  was re-verified end to end. Any result below is from the final build
  unless it says otherwise.
- Other agents (Astyx redesign, TLDraw whiteboard) were editing the same
  repo during this evaluation. See B2: one mid-walkthrough rebuild
  invalidated the running server and produced a false failure that did NOT
  reproduce on a stable build.
- Screenshots: `screenshots-student-eval/` (local-only, gitignored):
  `01` empty home, `02` auth, `04` home with 1 course, `05` course page,
  `06` lesson top, `09` lesson marked done, `10` course after done,
  `11` mobile 390px, `12` teacher whiteboard drawn, `16` student lesson
  full, `17` quiz wrong answer, `18` student whiteboard read-only.
  Walk scripts (not in the repo): `/tmp/curi-student-eval/walk.js`,
  `walk2.js`, `walk3.js`, `walk4.js` (walk4 is the clean final run).

## What the student did (final clean run, walk4, build mXPC9ltYfHlYSAuyWoW8W)

Setup (teacher steps, NOT counted as student steps): created course
"Computer Science 101" → section → lesson "What is an algorithm?" with a
video block (local 2s take), markdown notes, a whiteboard block (2 drawn
strokes), a 1-question MCQ; saved, reloaded (video + quiz + drawing all
persisted), published.

Student, same browser (demo mode stores courses in this browser only):

| Step | Result |
|---|---|
| Find a course on home | PASS — course card "Computer Science 101, 1 sections · 1 lessons" + Open button; also clickable title |
| Open the course | PASS — breadcrumb, title, "1 sections · 1 lessons · 0 marked done", section card, lesson link |
| Open the lesson | PASS — rendered fully ~2s after navigation (title, video, notes, whiteboard, quiz, sidebar) |
| Watch the video | PASS (run6) — `<video>` readyState 4, `play()` advanced currentTime 0 → 1.44s, controls visible |
| Read the notes | PASS — markdown renders as plain text |
| View the whiteboard artifact | PASS — the teacher's 2 strokes render read-only; a draw attempt on it changed nothing (2 shapes → 2) |
| Answer the quiz | PASS — pick an option → "Check answer" enables → wrong: "Not quite. The correct answer is: An output" + explanation + "0 of 1 correct"; "Try again" → right: "Correct" + "1 of 1 correct"; "Retake quiz" resets |
| Mark the lesson done | PASS — "Lesson marked done" + Done badge; persists after reload; course page shows "1 marked done" + Done badge on the lesson |
| Phone width (390px) | PASS (run6) — 0px horizontal overflow |

Zero `pageerror`s on the clean build. The only failed requests were
tldraw CDN assets (finding C1).

## Text the student had to read (visible words, `innerText`)

- Home, empty: **39 words** — "Learn from creators / Courses / Video
  lessons, notes, and quizzes. / No courses yet. Create one in the Studio. /
  Saved in this browser only. / Go to Studio" (+ nav + Demo banner).
- Home, 1 course: **37 words**.
- Course page: **41 words**.
- Lesson page: **97 words** total (nav, banner, title, notes, quiz,
  "Finished this lesson? Mark lesson as done", sidebar). The lesson content
  itself is ~30 words of notes plus the quiz. Nothing to read that is not
  the lesson.
- Auth page (`/auth`): **43 words** — "Welcome to Curi / Demo mode —
  sign-in is not available yet. / No backend is connected, so there is no
  account to sign in to. / Try the Studio".

## Findings, ranked

### BLOCKER (demo limit, not a UI bug)

**A1 — A fresh browser dead-ends the student: there is nothing to find.**
Fresh browser, learner home says "No courses yet. Create one in the Studio."
with a single "Go to Studio" button. A real student has no course to open,
no search, no browse, no sample course — the only clickable thing sends
them into the creator Studio. `/auth` likewise says sign-in "is not
available yet" with no account to sign in to. This is the missing live
backend (no Supabase project, no published courses), not a UI failure, and
it is the single thing standing between the current student UI and a real
student using it. A demo sample course would paper over it for evaluation
only; the real fix is the live gate.

### HIGH

**B1 — Studio lesson editor crashed outright (React #310) in the first
build tested — fixed mid-evaluation, verify it stays fixed.**
Build `Lk_jTDOtCsYJ7bGm7U6gL`: opening any Studio lesson page showed only
"This page couldn't load. Reload to try again, or go back." with 0 inputs.
Root cause (verified in the built chunk + react.dev/errors/310): **"Rendered
more hooks than during the previous render."** The whiteboard work added
`const [recordingWhiteboard, setRecordingWhiteboard] = useState(null)`
*below* the early returns (`if (!mounted) return "Loading…"` etc.), so the
first render ran 15 hooks and the next ran 16. The TLDraw agent fixed it
during this evaluation (file mtime 23:22 UTC; hook now at line 102, above
the early return at line 138, with a comment explaining why it must stay
there). Re-verified fixed in build `mXPC9ltYfHlYSAuyWoW8W` — the editor
loaded, saved, and reloaded fine. Creator-side, but it blocked *seeding*
this student walkthrough: while it was live, no teacher could create or
edit any lesson at all. Follow-up: audit the other Studio pages for the
same pattern (hooks below early returns); this evaluation did not check
them.

**B2 — A concurrent rebuild mid-walkthrough makes the student lesson hang
on "Loading…" — an evaluation hazard, not (only) an app bug.**
During walk3, `.next` was rebuilt by another agent at 23:28
(`BUILD_ID` changed mid-run). The student lesson page then sat on the
Suspense fallback "Loading…" for 90+ seconds with nothing rendering, and
the quiz never appeared. On a stable build (walk4, same `BUILD_ID` at start
and end) the identical lesson rendered fully in ~2s. Two consequences:
(1) do not evaluate while another agent is rebuilding — pin the build and
re-check `BUILD_ID` before trusting a hang; (2) the app itself has no
defence here — a deploy mid-session would do the same to a real student
(dynamic chunk 404 → Suspense fallback forever, no error message, no
retry). Worth a "chunk failed to load, reload" treatment later; not a
launch blocker for a demo.

### MEDIUM

**C1 — tldraw loads fonts/icons from `cdn.tldraw.com` at runtime.**
Walk4: 70 failed requests, all to `cdn.tldraw.com` (fonts
`Shantell_Sans-*`, `IBMPlex*`, icons, `embed-icons/*` —
`ERR_TUNNEL_CONNECTION_FAILED` on this VM; run6: 204). Rendering still
works (fallback fonts, drawing intact, 0 page errors), but the console is
noisy and the packaged offline Electron app will hit the same failures
wherever it has no network. Self-host the tldraw assets. Related: every
whiteboard shows a small **"Get a license for production"** watermark
(bottom-right, visible in screenshots 12 and 18) until tldraw is licensed.

**C2 — No "next lesson" onward path.** After marking a lesson done, the
student's only moves are "Back to course" and the sidebar list. With one
lesson that is fine; with a multi-lesson course the student goes back to
the course page after every lesson. A "Next lesson" button (following the
suggested path) is the obvious missing step.

**C3 — Demo wording is all over the student pages.** Banner "Demo mode —
Saved in this browser only", a "Demo" badge on the course and lesson
titles, and "Saved in this browser only." under the video. All true in
demo mode, all gone in live mode — but a student reading them has no idea
what "this browser" means for their progress or account. Harmless now;
revisit the copy if demo mode is ever shown to real students.

### LOW

**D1 — An untitled whiteboard has no label for the student.** The teacher
left "Whiteboard title (optional)" blank, so the student sees a bare
drawing with no heading and no hint what it is (screenshot 18). Either
default the title or render the block with a plain label.

**D2 — Quiz radio inputs carry no accessible name of their own.**
`input[type=radio]` elements have `aria-label: null`, no `<label>`
elements; the name comes only via generated `aria-labelledby` ids.
Clicking the visible option text works fine, but Playwright's
`getByRole('radio', { name: '…' })` could not find the options, which is a
smell for assistive tech. Needs a real screen-reader check before
claiming it is fine.

**D3 — "Check answer" is disabled until an option is picked, with no hint
why.** The button just looks faded. One line ("Pick an answer first") or
leaving it enabled with a nudge on click would do.

**D4 — Teacher placeholders leak to the student.** The section in this
evaluation was "Untitled section" and nothing in the flow prompts the
teacher to rename it before publishing, so the student sees a placeholder
as a real heading. Same class of issue as D1.

**D5 — Real video is untested.** The only video exercised was a 2s local
test-pattern take (IndexedDB). Mux playback, captions on the student
player, and long-lesson performance are all still unverified (no backend).

## Unverified observation (not a finding)

- In the teacher Studio sidebar, "Offline drafts: 2 · saved in this browser
  only" appeared in a fresh browser with a single course created
  (screenshot 12). The count's definition (courses? courses + lessons?)
  was not checked; it may be correct, it just looked surprising.

## Re-test of UI-EVAL-LOG.md round-2 fixes (student-relevant ones)

All PASS on the final build: learner home lists the published demo course
(only after publish); course and lesson pages render demo lessons including
the locally saved take; Done state persists in this browser; demo wording
is one consistent line ("Saved in this browser only").

## Still unverified

- Everything behind the live gate: sign-in, RLS, published courses visible
  across devices/browsers, Mux playback + captions, webhook.
- Real camera/mic/system-audio recording and the whiteboard-recording mode
  as a student-visible video (the recorder UI exists; no take was recorded
  in this evaluation — no camera/mic on this VM).
- A real teacher and a real student (both sides here are simulated agents).
- Screen-reader behaviour of the quiz (D2).
- Multi-lesson flow / suggested-path experience for students; long lessons.
- Whiteboard on a slow network (CDN assets aside, the tldraw chunk is
  large — first render of a lesson with a whiteboard took ~2s on localhost).

## Note on the earlier false results in this session

- Run6's "Whiteboard is empty" for the student was a script error, not an
  app bug: the walkthrough drew at page coordinates below the viewport, so
  the stroke never landed in the editor. Redrawn with the canvas scrolled
  into view, the drawing persisted (snapshot: 5 store records) and rendered
  for the student.
- Walk2/walk3's "lesson never loads / quiz radios missing" was the B2
  rebuild race (plus, in walk2, the page was still in Suspense fallback when
  measured). Walk4 on a stable build renders everything in ~2s.
- The editor #310 crash (B1) was real and in the build under test at the
  time; it is fixed in the final build tested here.
