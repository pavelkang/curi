# Curi — MVP

A learning platform, web first, no payment. Creators build courses as a
graph of lesson pages; learners watch, read, take MCQ quizzes, and
self-mark lessons done. Suggested path only — nothing locks.

## UI: shadcn, clean and minimal

The UI is built with shadcn-style components in `components/ui/` on
Radix primitives, with `components.json`, `lib/utils.ts` (`cn()`), and
shadcn CSS variables in `app/globals.css` (Tailwind 4, CSS-first).
Components: button, card, input, label, textarea, badge, separator,
skeleton, tabs, dialog, checkbox, radio-group, select. Look: white base
with a blueish theme — primary blue-600 (#2563eb), blue-700 hover,
blue-50/100 tints for active and selected surfaces, blue focus rings,
neutral slate text and borders. No purple, no full-page gradients.
Demo banner is a polished blue info bar. Pages do not use inline styles.

## Demo mode: run with zero credentials

No Supabase keys, no Mux keys, no `.env.local` needed to see the UI:

```bash
cd curi
npm install
npm run dev                  # http://localhost:3000
```

With no Supabase env vars set, every page shows a persistent banner:

> Demo mode — no backend connected. Changes here are not saved.

Demo seeding was removed 2026-11-03 (building-MVP mode, not demo mode):
there is no pre-filled demo course, demo section, or demo lesson
anywhere — the learner home and Studio both start empty, and no fake
replacement content is invented to fill them. Studio without keys still
works, starting empty, with courses you create stored in the browser
only (see below), clearly labeled as not Supabase.

No-backend routes:

| Route | No-backend view |
|---|---|
| `/` | Empty course list |
| `/studio` | Studio, starting empty: folder-tree sidebar, + Course / + Section / + Lesson, standalone lesson pages |
| `/auth` | Explains no-backend mode; no fake login |

### Demo mode vs live mode

| | Demo mode (no Supabase) | Live mode (Supabase configured) |
|---|---|---|
| Banner | Always shown | Never shown |
| Courses/lessons | None — empty state, no seeded course | Real rows from Supabase, per RLS |
| Studio edits | Browser-only store (`curi-studio-demo-v1` in localStorage), starting empty; not Supabase | Saved to Supabase |
| Lesson Done toggle | Local state only | Saved to `lesson_progress` |
| Video upload / recorder upload | Disabled; recording preview and retake still work locally | Mux direct upload |
| Auth | Explains no-backend mode, links to Studio, does not fake a login | Real email/password sign-in/sign-up |
| Video blocks | Placeholder panel, no playback | Real Mux playback + captions |

When Supabase **is** configured, demo mode does not appear at all and
the real data paths run unchanged. Demo data is never written to a
backend and never mixed with real courses.

Locked spec (2026-11-03):
- Kai is the first creator; friends are invited later (physics, design, …).
  The first course *can* be system design, but no course content is
  invented or seeded here.
- Stack: Next.js App Router + TypeScript, Supabase Auth + Postgres,
  Vercel-ready, Mux Video.
- Course model: courses → sections (ordered) → lessons (ordered pages).
  Section dependencies are suggestions shown as “Suggested next” only.
- Lesson page: custom-rendered from JSON stored as `jsonb` in Postgres,
  **not** a blob: `{version: 1, blocks: [...]}`.
  Block kinds: `video` (Mux playback id), `markdown` (rich text),
  `quiz` (MCQ only: 4 options, correct index, explanation).
- Completion: self-marked by the learner.
- Accounts: Supabase email/password for MVP. Google OAuth is not wired.
- Captions: Mux auto captions on playback (English, requested at upload).
- Creator recording: in-browser screen + camera headshot (canvas
  picture-in-picture composite, MediaRecorder, preview/retake) **or**
  upload your own video. Both feed the same Mux direct-upload path.
- Creator access: manual `is_creator` flag on `profiles`. No invite system.

## Routes

| Route | What it does |
|---|---|
| `/` | Published course list (signed-in users; empty state is honest, no fake courses) |
| `/courses/[id]` | Sections, lessons, “Suggested next” dependencies |
| `/courses/[id]/lessons/[lessonId]` | Custom block renderer: Mux video + captions, markdown, interactive MCQ quiz (immediate feedback + explanation + retake), self-mark Done toggle |
| `/studio` | Creator-only, flat folder tree (no stacked cards): sidebar + Course / + Section / + Lesson, course overview page, standalone lesson pages with block editor (add/reorder/delete video/markdown/quiz), markdown textarea + preview, quiz editor, recorder + file upload, Move to section |
| `/auth` | Sign in / sign up (email/password) |

Server routes:

| Route | What it does |
|---|---|
| `POST /api/mux/uploads` | Creates a Mux direct-upload URL (auto captions requested, lesson id as passthrough). Browser PUTs the file; it never sees Mux credentials. |
| `POST /api/mux/webhook` | Handles `video.asset.ready` → stores asset + playback id on the lesson from passthrough. Other events are acknowledged, not acted on. |
| `POST /api/mux/tracks` | Creates a Mux text track from a publicly hosted VTT/SRT URL (see caption gap below). |

## Local dev

```bash
cd curi
cp .env.example .env.local   # fill in real values, never commit .env.local
npm install
npm run dev                  # http://localhost:3000
npm run build                # production build check
```

The app builds and runs with no keys set. Without keys it now shows
the full demo UI described above, instead of the old “Supabase is not
configured” dead end. That dead end is gone: no-keys mode is a usable
demo, and live mode is unchanged when keys are present.

## Env vars

See `.env.example`. Summary:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` — server only, for the Mux webhook handler.
- `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` — server only, for `/api/mux/*`.
- `MUX_WEBHOOK_SECRET` — server only, Mux webhook signing secret.
- `NEXT_PUBLIC_SITE_URL` — docs/links only in MVP.

No real secrets are in this repo. Do not paste keys into code, issues,
or chat.

## Supabase setup

1. Create a project at Supabase (do not reuse a production project for
   first testing).
2. In the Supabase SQL editor, run
   `supabase/migrations/20261103_curi_init.sql` in full. It creates
   `profiles`, `courses`, `sections`, `section_dependencies`, `lessons`
   (with `content jsonb`), `lesson_progress`, plus a trigger that
   creates a profile row on signup, and RLS policies:
   - Published courses readable by authenticated users; drafts only by
     their creator.
   - Creators CRUD only their own courses/sections/lessons.
   - Progress rows only by their owner.
3. Sign up in the app (`/auth`).
4. Grant creator access — this is manual, by design:
   ```sql
   update public.profiles
   set is_creator = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   (The same commented snippet is at the bottom of the migration.)
5. Reload `/studio` and create a course. It starts as a draft; use
   Publish in the Studio to make it visible on `/`.

Optional seed: `supabase/seed.sql` is intentionally empty of content.
It contains only a commented example of an empty draft course shell.
Do not add invented lessons there.

## Mux setup

1. Create a Mux account and an API token (Token ID + Secret) in an
   environment. Put them in `.env.local` only.
2. Uploads in the Studio call `/api/mux/uploads`, which requests
   English auto captions (`generated_subtitles`) on the new asset.
   Auto captions take time after the asset is ready; the player exposes
   them via its CC control when Mux has generated them.
3. Webhook (required for automatic playback ids): in the Mux dashboard,
   create a webhook pointing at
   `https://<your-deployed-site>/api/mux/webhook`
   (for local testing, use a tunnel or paste the playback id manually
   in the Studio — the webhook cannot reach `localhost` directly).
   Copy the webhook signing secret to `MUX_WEBHOOK_SECRET` and set
   `SUPABASE_SERVICE_ROLE_KEY` so the handler can write the lesson.
   Without the service key, the webhook acknowledges the event but
   reports `stored: false` instead of silently claiming success.
4. Verify a real upload end-to-end only after deploy + webhook setup:
   record/upload → `video.asset.ready` → lesson page shows the video.

## What is NOT done / gaps (honest list)

- **No live test has been run.** No Supabase project, Mux account, or
  Vercel project was created for this build, and no keys were provided.
  Build/typecheck pass locally (see below), but auth, RLS, upload,
  playback, captions, and the webhook are untested against live services.
- **No deployment, no GitHub push.** This codebase is local only.
  Vercel deploy is a later, explicit step (import the repo, set the
  same env vars, set the Mux webhook to the deployed URL).
- **Caption editing gap (the important one).** Creators can edit VTT
  text in the Studio and it is stored in the video block and rendered
  by the lesson player from a blob URL, so edited captions do display.
  But that text is **not** automatically pushed to Mux as a track,
  because Mux's create-track API takes a publicly hosted VTT *URL*,
  not raw text, and Curi has no public file host for VTT yet.
  `/api/mux/tracks` exists for the case where the creator already has
  a public VTT URL. Replacing Mux's auto-generated track with an edited
  one (download auto VTT → edit → delete auto track → create new track)
  is not wired. Do not describe in-app VTT editing as “Mux caption
  editing” until that hosting + replace flow is built and tested.
- **Webhook mapping is passthrough-only.** The asset is mapped back to
  a lesson via `passthrough = lesson id` and fills the first video block
  without a playback id. There is no separate upload-tracking table,
  no retry, and no handling for multiple video blocks per lesson beyond
  “first empty block”. If a lesson has two video blocks, paste the
  second playback id manually.
- **Recording limits.** Browser canvas composite (1280×720, webm),
  no trimming, no separate audio/video tracks, quality depends on the
  browser. Retake instead of editing in MVP.
- **Markdown rendering is minimal.** Headings, bold/italic, code,
  lists, links, fenced code blocks only. No tables, images, or full
  CommonMark. Swap `lib/markdown.ts` for a maintained parser if needed.
- **No Google OAuth, no invites, no payments, no search, no mobile app.**
  All are explicitly out of MVP scope. Friends become creators only via
  the manual `is_creator` flag.
- **No moderation, reporting, or course discovery beyond the list.**
  Published = visible to all signed-in users.
- **RLS is the enforcement layer, but it has not been tested live.**
  Test with two accounts (creator + plain learner, plus a signed-out
  attempt) before calling any course data private.
- **Direct-upload CORS is `*` in MVP.** Tighten `cors_origin` to the
  deployed origin before real creator use.

## Build verification (this run)

Run locally with no env keys (placeholders only):

```bash
npm install
npx tsc --noEmit
npm run build
```

Result is recorded in the delivery report for this build. If any step
fails, fix it there — do not claim a passing build that did not run.
