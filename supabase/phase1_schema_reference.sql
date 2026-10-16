-- DSA Revision Platform: Supabase/PostgreSQL starter schema
-- Phase 1 artifact only. Review and run in your own Supabase project after configuration.
-- This file does not connect to or modify any live database.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Kolkata',
  daily_goal integer not null default 3 check (daily_goal > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  import_key text not null,
  title text not null,
  url text not null,
  external_slug text,
  source text not null default 'Custom',
  topic text,
  pattern text,
  difficulty text check (difficulty in ('Easy','Medium','Hard') or difficulty is null),
  priority text check (priority in ('Critical','High','Medium','Low','Review') or priority is null),
  is_love_babbar_priority boolean not null default false,
  source_group text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, import_key),
  unique (owner_id, url)
);

create table if not exists public.question_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status text not null default 'Unsolved'
    check (status in ('Unsolved','Attempted','Solved','Needs Revision')),
  attempts integer not null default 0 check (attempts >= 0),
  confidence integer check (confidence between 1 and 5),
  first_solved_at timestamptz,
  last_attempt_at timestamptz,
  next_revision_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, question_id)
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  event_type text not null check (event_type in ('solved','attempted','revised','status_changed','note_updated')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_question_id uuid references public.questions(id) on delete set null,
  suggested_title text not null,
  suggested_url text not null,
  suggested_source text,
  suggested_topic text,
  suggested_pattern text,
  suggested_difficulty text,
  reason text,
  score numeric(5,4),
  decision text not null default 'pending'
    check (decision in ('pending','accepted','dismissed','already_added')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  import_key text not null,
  title text not null,
  type text,
  url text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (owner_id, import_key)
);

create index if not exists questions_owner_status_idx on public.questions(owner_id);
create index if not exists question_progress_owner_status_idx on public.question_progress(owner_id, status);
create index if not exists question_progress_revision_idx on public.question_progress(owner_id, next_revision_at);
create index if not exists activity_events_owner_date_idx on public.activity_events(owner_id, occurred_at desc);
create index if not exists recommendations_owner_decision_idx on public.recommendations(owner_id, decision);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.question_progress enable row level security;
alter table public.activity_events enable row level security;
alter table public.recommendations enable row level security;
alter table public.resources enable row level security;

create policy "profile owner access" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "questions owner access" on public.questions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "progress owner access" on public.question_progress
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "activity owner access" on public.activity_events
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "recommendations owner access" on public.recommendations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "resources owner access" on public.resources
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Import notes:
-- 1) Create/sign in as your Supabase Auth user.
-- 2) Set owner_id to that user's UUID during import.
-- 3) Import questions_import.csv into questions after mapping fields.
-- 4) Import resources_import.csv into resources.
-- 5) The original workbook does not include historic solve timestamps. Do not fabricate activity_events.
