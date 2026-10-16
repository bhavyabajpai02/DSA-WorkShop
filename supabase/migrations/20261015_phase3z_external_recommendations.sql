-- Phase 3 external-catalogue recommendations. Apply after the Phase 3 migration.
-- This migration is additive and does not alter or delete existing questions.
alter table public.recommendations
  add column if not exists suggested_external_id text;

create unique index if not exists recommendations_owner_external_identity_idx
  on public.recommendations(owner_id, suggested_source, suggested_external_id);

create or replace function public.canonical_external_question_url(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      lower(split_part(split_part(trim(coalesce(value, '')), '#', 1), '?', 1)),
      '^(https?://)www\.',
      '\1'
    ),
    '/+$',
    ''
  );
$$;

create or replace function public.accept_external_recommendation(p_recommendation_id uuid)
returns table(question_id uuid, already_present boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  recommendation_row public.recommendations%rowtype;
  existing_question_id uuid;
  inserted_question_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to accept a recommendation.';
  end if;

  select *
    into recommendation_row
    from public.recommendations
   where id = p_recommendation_id
     and owner_id = current_user_id
   for update;

  if not found then
    raise exception 'Recommendation was not found for the authenticated user.';
  end if;

  if recommendation_row.suggested_external_id is null then
    raise exception 'This is not an external catalogue recommendation.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    current_user_id::text || ':url:' ||
    public.canonical_external_question_url(recommendation_row.suggested_url),
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    current_user_id::text || ':id:' ||
    lower(coalesce(recommendation_row.suggested_source, '')) || ':' ||
    lower(recommendation_row.suggested_external_id),
    0
  ));

  select question.id
    into existing_question_id
    from public.questions as question
   where question.owner_id = current_user_id
     and (
       public.canonical_external_question_url(question.url) =
         public.canonical_external_question_url(recommendation_row.suggested_url)
       or (
         lower(question.source) = lower(recommendation_row.suggested_source)
         and (
           lower(coalesce(question.external_slug, '')) = lower(recommendation_row.suggested_external_id)
           or lower(split_part(
             split_part(split_part(question.url, '/problems/', 2), '/', 1),
             '?',
             1
           )) = lower(recommendation_row.suggested_external_id)
         )
       )
     )
   limit 1;

  if existing_question_id is not null then
    if recommendation_row.decision = 'pending' then
      update public.recommendations
         set decision = 'already_added', decided_at = now()
       where id = recommendation_row.id and owner_id = current_user_id;
    elsif recommendation_row.decision not in ('accepted', 'already_added') then
      raise exception 'This recommendation has already been dismissed.';
    end if;
    return query select existing_question_id, true;
    return;
  end if;

  if recommendation_row.decision <> 'pending' then
    raise exception 'This recommendation has already been decided.';
  end if;

  insert into public.questions (
    owner_id, import_key, title, url, external_slug, source, topic, pattern,
    difficulty, priority, is_love_babbar_priority, source_group, notes, updated_at
  ) values (
    current_user_id,
    'external:' || lower(recommendation_row.suggested_source) || ':' || lower(recommendation_row.suggested_external_id),
    recommendation_row.suggested_title,
    recommendation_row.suggested_url,
    recommendation_row.suggested_external_id,
    coalesce(recommendation_row.suggested_source, 'Custom'),
    recommendation_row.suggested_topic,
    recommendation_row.suggested_pattern,
    case when recommendation_row.suggested_difficulty in ('Easy', 'Medium', 'Hard')
      then recommendation_row.suggested_difficulty else null end,
    null,
    false,
    null,
    null,
    now()
  )
  on conflict (owner_id, url) do nothing
  returning id into inserted_question_id;

  if inserted_question_id is null then
    select question.id
      into existing_question_id
      from public.questions as question
     where question.owner_id = current_user_id
       and public.canonical_external_question_url(question.url) =
           public.canonical_external_question_url(recommendation_row.suggested_url)
     limit 1;

    if existing_question_id is null then
      raise exception 'The question could not be added without creating a duplicate.';
    end if;

    update public.recommendations
       set decision = 'already_added', decided_at = now()
     where id = recommendation_row.id and owner_id = current_user_id;
    return query select existing_question_id, true;
    return;
  end if;

  insert into public.question_progress(owner_id, question_id, status, updated_at)
  values (current_user_id, inserted_question_id, 'Unsolved', now());

  update public.recommendations
     set decision = 'accepted', decided_at = now()
   where id = recommendation_row.id and owner_id = current_user_id;

  return query select inserted_question_id, false;
end;
$$;

revoke all on function public.accept_external_recommendation(uuid) from public;
grant execute on function public.accept_external_recommendation(uuid) to authenticated;
