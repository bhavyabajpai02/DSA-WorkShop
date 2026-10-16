import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20261016_phase5_revision_engine.sql', import.meta.url)

test('review migration is additive and enforces owner-scoped idempotent writes', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /add column if not exists review_interval_days/)
  assert.match(sql, /add column if not exists review_submission_id uuid/)
  assert.match(sql, /create unique index if not exists activity_events_owner_review_submission_idx/)
  assert.match(sql, /security definer\s+set search_path = ''/i)
  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/i)
  assert.match(sql, /question\.owner_id = current_user_id/i)
  assert.match(sql, /event\.owner_id = current_user_id/i)
  assert.match(sql, /event\.review_submission_id = p_submission_id/i)
  assert.match(sql, /attempts = progress\.attempts \+ 1/i)
  assert.match(sql, /last_attempt_at = action_time/i)
  assert.match(sql, /confidence = p_confidence/i)
  assert.match(sql, /next_revision_at = scheduled_at/i)
  assert.match(sql, /insert into public\.activity_events\([\s\S]*review_completed/i)
  assert.match(sql, /'outcome', p_outcome[\s\S]*'confidence', p_confidence[\s\S]*'interval_days', calculated_interval[\s\S]*'next_revision_at', scheduled_at/i)
  assert.match(sql, /owner_id, question_id, event_type, occurred_at, review_submission_id, metadata/i)
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i)
  assert.doesNotMatch(sql, /\bdelete\s+from\s+public\.(questions|question_progress|activity_events)\b/i)
  assert.doesNotMatch(sql, /set status\s*=/i)
})

test('review retry checks the existing submission before updating progress again', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const duplicateCheck = sql.indexOf('event.review_submission_id = p_submission_id')
  const progressUpdate = sql.indexOf('update public.question_progress as progress')
  const eventInsert = sql.indexOf('insert into public.activity_events(')
  assert.ok(duplicateCheck >= 0)
  assert.ok(progressUpdate > duplicateCheck)
  assert.ok(eventInsert > progressUpdate)
  assert.match(sql.slice(duplicateCheck, progressUpdate), /if found then[\s\S]*\btrue;/i)
})
