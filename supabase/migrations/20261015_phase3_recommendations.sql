-- Phase 3: persistent, user-scoped question recommendations.
-- Apply after 20261015_phase2_question_manager.sql.
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_question_id uuid references public.questions(id) on delete set null,
  suggested_question_id uuid references public.questions(id) on delete set null,
  suggested_title text not null,
  suggested_url text not null,
  suggested_source text,
  suggested_topic text,
  suggested_pattern text,
  suggested_difficulty text,
  reason text,
  score numeric(5,4),
  decision text not null default 'pending' check (decision in ('pending','accepted','dismissed','already_added')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recommendations_owner_decision_created_idx
  on public.recommendations(owner_id, decision, created_at desc);

alter table public.recommendations enable row level security;
drop policy if exists "recommendations owner access" on public.recommendations;
create policy "recommendations owner access" on public.recommendations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- For databases where an earlier draft of recommendations already exists, add the candidate link safely.
alter table public.recommendations
  add column if not exists suggested_question_id uuid references public.questions(id) on delete set null;
