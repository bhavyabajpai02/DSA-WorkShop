-- Phase 5: deterministic spaced-review scheduling with owner-scoped,
-- idempotent review recording. No existing schedules or events are backfilled.
--
-- Interval mapping (days):
-- Again = 1; Hard = max(1, round(previous * 1.2));
-- Good = 1 initially, otherwise round(previous * 2.5);
-- Easy = 4 initially, otherwise round(previous * 3.5).
-- Every interval is capped at 365 days. Due dates are local midnight in the
-- owner's profile timezone, converted to timestamptz (including DST rules).

alter table public.question_progress
  add column if not exists review_interval_days integer not null default 0
    check (review_interval_days between 0 and 365);

alter table public.activity_events
  add column if not exists review_submission_id uuid;

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;
alter table public.activity_events
  add constraint activity_events_event_type_check
    check (event_type in (
      'solved', 'attempted', 'revised', 'status_changed', 'note_updated',
      'recommendation_accepted', 'review_completed'
    ));

create unique index if not exists activity_events_owner_review_submission_idx
  on public.activity_events(owner_id, review_submission_id)
  where review_submission_id is not null;

create or replace function public.record_question_review(
  p_question_id uuid,
  p_outcome text,
  p_confidence integer,
  p_submission_id uuid
)
returns table(interval_days integer, next_revision_at timestamptz, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_interval integer;
  calculated_interval integer;
  action_time timestamptz := now();
  local_timezone text;
  question_title text;
  scheduled_at timestamptz;
  prior_event public.activity_events%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to record a review.';
  end if;
  if p_question_id is null or p_submission_id is null then
    raise exception 'A question and review submission identifier are required.';
  end if;
  if p_outcome is null or p_outcome not in ('Again', 'Hard', 'Good', 'Easy') then
    raise exception 'Review outcome must be Again, Hard, Good, or Easy.';
  end if;
  if p_confidence is null or p_confidence < 1 or p_confidence > 5 then
    raise exception 'Confidence must be an integer from 1 to 5.';
  end if;
  select question.title
    into question_title
    from public.questions as question
   where question.id = p_question_id and question.owner_id = current_user_id;
  if not found then
    raise exception 'Question was not found for the authenticated user.';
  end if;

  insert into public.question_progress(owner_id, question_id, status, updated_at)
  values (current_user_id, p_question_id, 'Unsolved', action_time)
  on conflict (owner_id, question_id) do nothing;

  select progress.review_interval_days
    into previous_interval
    from public.question_progress as progress
   where progress.owner_id = current_user_id
     and progress.question_id = p_question_id
   for update;

  select event.*
    into prior_event
    from public.activity_events as event
   where event.owner_id = current_user_id
     and event.review_submission_id = p_submission_id;
  if found then
    return query
    select
      (prior_event.metadata ->> 'interval_days')::integer,
      (prior_event.metadata ->> 'next_revision_at')::timestamptz,
      true;
    return;
  end if;

  if p_outcome = 'Again' then
    calculated_interval := 1;
  elsif p_outcome = 'Hard' then
    calculated_interval := least(365, greatest(1, round(previous_interval * 1.2)::integer));
  elsif p_outcome = 'Good' then
    calculated_interval := case
      when previous_interval = 0 then 1
      else least(365, round(previous_interval * 2.5)::integer)
    end;
  else
    calculated_interval := case
      when previous_interval = 0 then 4
      else least(365, round(previous_interval * 3.5)::integer)
    end;
  end if;

  select coalesce(profile.timezone, 'Asia/Kolkata')
    into local_timezone
    from public.profiles as profile
   where profile.id = current_user_id;
  if local_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names as zone where zone.name = local_timezone
  ) then
    local_timezone := 'Asia/Kolkata';
  end if;

  scheduled_at :=
    (((action_time at time zone local_timezone)::date + calculated_interval)::timestamp
      at time zone local_timezone);

  update public.question_progress as progress
     set attempts = progress.attempts + 1,
         confidence = p_confidence,
         last_attempt_at = action_time,
         review_interval_days = calculated_interval,
         next_revision_at = scheduled_at,
         updated_at = action_time
   where progress.owner_id = current_user_id
     and progress.question_id = p_question_id;

  insert into public.activity_events(
    owner_id, question_id, event_type, occurred_at, review_submission_id, metadata
  )
  values (
    current_user_id,
    p_question_id,
    'review_completed',
    action_time,
    p_submission_id,
    jsonb_build_object(
      'outcome', p_outcome,
      'confidence', p_confidence,
      'interval_days', calculated_interval,
      'next_revision_at', scheduled_at,
      'question_title', question_title
    )
  );

  return query select calculated_interval, scheduled_at, false;
end;
$$;

revoke all on function public.record_question_review(uuid, text, integer, uuid) from public;
grant execute on function public.record_question_review(uuid, text, integer, uuid) to authenticated;
