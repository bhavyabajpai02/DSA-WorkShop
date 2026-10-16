-- Phase 2: persistent question manager for a single-user workspace.
-- Safe to run in the Supabase SQL Editor. Does not create an auth user.
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
  status text not null default 'Unsolved' check (status in ('Unsolved','Attempted','Solved','Needs Revision')),
  attempts integer not null default 0 check (attempts >= 0),
  confidence integer check (confidence between 1 and 5),
  first_solved_at timestamptz,
  last_attempt_at timestamptz,
  next_revision_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, question_id)
);

create index if not exists questions_owner_updated_idx on public.questions(owner_id, updated_at desc);
create index if not exists questions_owner_topic_idx on public.questions(owner_id, topic);
create index if not exists questions_owner_status_idx on public.question_progress(owner_id, status);
create index if not exists questions_owner_revision_idx on public.question_progress(owner_id, next_revision_at);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.question_progress enable row level security;

-- Policies are dropped/recreated so this migration can be safely re-run.
drop policy if exists "profile owner access" on public.profiles;
create policy "profile owner access" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "questions owner access" on public.questions;
create policy "questions owner access" on public.questions for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "progress owner access" on public.question_progress;
create policy "progress owner access" on public.question_progress for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- A trigger creates a private profile row for each new auth user.
create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();
