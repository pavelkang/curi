-- Curi MVP migration
-- Run in the Supabase SQL editor (or with the Supabase CLI) against a
-- fresh project. This creates profiles, courses, sections,
-- section_dependencies, lessons (content as jsonb), and lesson_progress,
-- with Row Level Security. No course content is seeded here.
--
-- Model (locked 2026-11-03):
--   courses -> sections (ordered) -> lessons (ordered pages)
--   Section dependencies are SUGGESTIONS only. Nothing locks.
--   Lesson content is jsonb: {version:1, blocks:[video|markdown|quiz]}
--   Completion is self-marked by the learner (lesson_progress.done).

create extension if not exists "pgcrypto";

-- Profiles: one row per auth user. Creator access is a manual flag.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_creator boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.section_dependencies (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  from_section_id uuid not null references public.sections (id) on delete cascade,
  to_section_id uuid not null references public.sections (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_section_id <> to_section_id),
  unique (course_id, from_section_id, to_section_id)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  -- Custom lesson page, stored as JSON (jsonb), NOT a blob.
  -- Shape: {"version":1,"blocks":[
  --   {"kind":"video","id":"...","mux_asset_id":"...","mux_playback_id":"...",
  --    "caption_track_url":"...","caption_text":"WEBVTT..."},
  --   {"kind":"markdown","id":"...","markdown":"..."},
  --   {"kind":"quiz","id":"...","questions":[
  --     {"id":"...","prompt":"...","options":["a","b","c","d"],
  --      "correct_index":0,"explanation":"..."}]}
  -- ]}
  content jsonb not null default '{"version":1,"blocks":[]}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists idx_sections_course on public.sections (course_id, position);
create index if not exists idx_lessons_section on public.lessons (section_id, position);
create index if not exists idx_deps_course on public.section_dependencies (course_id);
create index if not exists idx_progress_user on public.lesson_progress (user_id, lesson_id);

-- Auto-create a profile row on signup. The creator flag stays false
-- until a human grants it (see the commented snippet at the bottom).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security -------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.sections enable row level security;
alter table public.section_dependencies enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;

-- Profiles: any authenticated user can read profiles (for creator
-- display); a user can insert/update only their own row.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Courses: published courses readable by authenticated users;
-- drafts readable only by their creator.
drop policy if exists "courses readable" on public.courses;
create policy "courses readable"
  on public.courses for select to authenticated
  using (published = true or creator_id = auth.uid());

drop policy if exists "courses insert by creators" on public.courses;
create policy "courses insert by creators"
  on public.courses for insert to authenticated
  with check (
    creator_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_creator = true)
  );

drop policy if exists "courses update own" on public.courses;
create policy "courses update own"
  on public.courses for update to authenticated
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

drop policy if exists "courses delete own" on public.courses;
create policy "courses delete own"
  on public.courses for delete to authenticated using (creator_id = auth.uid());

-- Helper visibility: a section/lesson/dependency is readable when its
-- course is readable (published, or owned by the caller).
drop policy if exists "sections readable via course" on public.sections;
create policy "sections readable via course"
  on public.sections for select to authenticated
  using (exists (
    select 1 from public.courses c
    where c.id = sections.course_id and (c.published = true or c.creator_id = auth.uid())
  ));

drop policy if exists "sections write own course" on public.sections;
create policy "sections write own course"
  on public.sections for all to authenticated
  using (exists (select 1 from public.courses c where c.id = sections.course_id and c.creator_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = sections.course_id and c.creator_id = auth.uid()));

drop policy if exists "deps readable via course" on public.section_dependencies;
create policy "deps readable via course"
  on public.section_dependencies for select to authenticated
  using (exists (
    select 1 from public.courses c
    where c.id = section_dependencies.course_id and (c.published = true or c.creator_id = auth.uid())
  ));

drop policy if exists "deps write own course" on public.section_dependencies;
create policy "deps write own course"
  on public.section_dependencies for all to authenticated
  using (exists (select 1 from public.courses c where c.id = section_dependencies.course_id and c.creator_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = section_dependencies.course_id and c.creator_id = auth.uid()));

drop policy if exists "lessons readable via course" on public.lessons;
create policy "lessons readable via course"
  on public.lessons for select to authenticated
  using (exists (
    select 1 from public.sections s
    join public.courses c on c.id = s.course_id
    where s.id = lessons.section_id and (c.published = true or c.creator_id = auth.uid())
  ));

drop policy if exists "lessons write own course" on public.lessons;
create policy "lessons write own course"
  on public.lessons for all to authenticated
  using (exists (
    select 1 from public.sections s
    join public.courses c on c.id = s.course_id
    where s.id = lessons.section_id and c.creator_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.sections s
    join public.courses c on c.id = s.course_id
    where s.id = lessons.section_id and c.creator_id = auth.uid()
  ));

-- Progress: a user can only read/write their own rows.
drop policy if exists "progress own only" on public.lesson_progress;
create policy "progress own only"
  on public.lesson_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Grant Kai (or any creator) creator access --------------------------------
-- Replace the email, sign up first so the profile row exists, then run:
--
--   update public.profiles
--   set is_creator = true
--   where id = (select id from auth.users where email = 'kai@example.com');
--
-- There is deliberately no invite system or self-serve creator signup
-- in MVP. Creator access is this manual flag, nothing else.
