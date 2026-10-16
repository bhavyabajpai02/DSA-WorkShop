-- Phase 4: owner-scoped profile preferences and explicitly recorded activity.
-- Apply after the Phase 3 external-recommendations migration. Existing question
-- progress is intentionally not backfilled into activity_events.

alter table public.profiles
  add column if not exists weekly_goal integer not null default 15
    check (weekly_goal between 1 and 3500),
  add column if not exists preferred_difficulty text
    check (preferred_difficulty in ('Easy', 'Medium', 'Hard') or preferred_difficulty is null),
  add column if not exists target_topics text[] not null default '{}';

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  event_type text not null check (event_type in ('solved', 'status_changed', 'recommendation_accepted')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- Phase 1's schema reference included an earlier activity_events shape. Extend
-- that table in place when it exists rather than replacing any recorded rows.
alter table public.activity_events
  add column if not exists recommendation_id uuid references public.recommendations(id) on delete set null;

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;
alter table public.activity_events
  add constraint activity_events_event_type_check
    check (event_type in (
      'solved', 'attempted', 'revised', 'status_changed', 'note_updated',
      'recommendation_accepted'
    ));

create index if not exists activity_events_owner_occurred_idx
  on public.activity_events(owner_id, occurred_at desc);
create unique index if not exists activity_events_recommendation_once_idx
  on public.activity_events(owner_id, recommendation_id)
  where recommendation_id is not null and event_type = 'recommendation_accepted';

alter table public.activity_events enable row level security;
drop policy if exists "activity owner access" on public.activity_events;
drop policy if exists "activity owner read access" on public.activity_events;
create policy "activity owner read access" on public.activity_events
  for select using (auth.uid() = owner_id);

create or replace function public.record_question_status(
  p_question_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_status text;
  action_time timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Authentication is required to update question status.';
  end if;
  if p_status is null or p_status not in ('Unsolved', 'Attempted', 'Solved', 'Needs Revision') then
    raise exception 'Invalid question status.';
  end if;
  if not exists (
    select 1 from public.questions
     where id = p_question_id and owner_id = current_user_id
  ) then
    raise exception 'Question was not found for the authenticated user.';
  end if;

  insert into public.question_progress(owner_id, question_id, status, updated_at)
  values (current_user_id, p_question_id, 'Unsolved', action_time)
  on conflict (owner_id, question_id) do nothing;

  select status
    into previous_status
    from public.question_progress
   where owner_id = current_user_id and question_id = p_question_id
   for update;

  if previous_status = p_status then
    return false;
  end if;

  update public.question_progress
     set status = p_status,
         attempts = attempts + case when p_status = 'Attempted' then 1 else 0 end,
         last_attempt_at = case when p_status = 'Attempted' then action_time else last_attempt_at end,
         first_solved_at = case
           when p_status = 'Solved' then coalesce(first_solved_at, action_time)
           else first_solved_at
         end,
         updated_at = action_time
   where owner_id = current_user_id and question_id = p_question_id;

  insert into public.activity_events(owner_id, question_id, event_type, occurred_at, metadata)
  values (
    current_user_id,
    p_question_id,
    case when p_status = 'Solved' then 'solved' else 'status_changed' end,
    action_time,
    jsonb_build_object('from_status', previous_status, 'to_status', p_status)
  );
  return true;
end;
$$;

revoke all on function public.record_question_status(uuid, text) from public;
grant execute on function public.record_question_status(uuid, text) to authenticated;

create or replace function public.record_accepted_recommendation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.decision is distinct from 'accepted'
     and new.decision in ('accepted', 'already_added')
     and new.suggested_external_id is not null then
    insert into public.activity_events(
      owner_id, recommendation_id, event_type, occurred_at, metadata
    )
    values (
      new.owner_id,
      new.id,
      'recommendation_accepted',
      coalesce(new.decided_at, now()),
      jsonb_build_object(
        'source', new.suggested_source,
        'external_id', new.suggested_external_id,
        'decision', new.decision
      )
    )
    on conflict (owner_id, recommendation_id)
      where recommendation_id is not null and event_type = 'recommendation_accepted'
      do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists recommendations_record_acceptance on public.recommendations;
create trigger recommendations_record_acceptance
  after update of decision on public.recommendations
  for each row execute function public.record_accepted_recommendation_activity();
