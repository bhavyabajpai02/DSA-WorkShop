import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPracticeQueue, nextIntervalDays, revisionBucket } from '../src/revisionScheduler.ts'
import type { ExternalSuggestion, SchedulableQuestion } from '../src/revisionScheduler.ts'

const question = (overrides: Partial<SchedulableQuestion> = {}): SchedulableQuestion => ({
  id: 'q1',
  title: 'Question',
  url: 'https://leetcode.com/problems/question/',
  source: 'LeetCode',
  external_slug: 'question',
  topic: 'Arrays',
  status: 'Solved',
  priority: null,
  is_love_babbar_priority: false,
  next_revision_at: null,
  ...overrides,
})

const suggestion = (overrides: Partial<ExternalSuggestion> = {}): ExternalSuggestion => ({
  id: 'r1',
  decision: 'pending',
  suggested_external_id: 'external-question',
  suggested_title: 'External question',
  suggested_url: 'https://leetcode.com/problems/external-question/',
  suggested_source: 'LeetCode',
  suggested_topic: 'Arrays',
  suggested_difficulty: 'Medium',
  ...overrides,
})

test('interval mapping handles each outcome, progression, and the maximum', () => {
  assert.equal(nextIntervalDays('Again', 80), 1)
  assert.equal(nextIntervalDays('Hard', 0), 1)
  assert.equal(nextIntervalDays('Hard', 10), 12)
  assert.equal(nextIntervalDays('Good', 0), 1)
  assert.equal(nextIntervalDays('Good', 4), 10)
  assert.equal(nextIntervalDays('Easy', 0), 4)
  assert.equal(nextIntervalDays('Easy', 10), 35)
  assert.equal(nextIntervalDays('Easy', 365), 365)
  assert.equal(nextIntervalDays('Good', Number.NaN), 1)
})

test('revision buckets use local timezone calendar days and seven upcoming days', () => {
  const now = new Date('2026-10-16T01:00:00.000Z')
  assert.equal(revisionBucket(question({ next_revision_at: '2026-10-15T18:29:59.000Z' }), 'Asia/Kolkata', now), 'overdue')
  assert.equal(revisionBucket(question({ next_revision_at: '2026-10-15T18:30:00.000Z' }), 'Asia/Kolkata', now), 'today')
  assert.equal(revisionBucket(question({ next_revision_at: '2026-10-22T18:30:00.000Z' }), 'Asia/Kolkata', now), 'upcoming')
  assert.equal(revisionBucket(question({ next_revision_at: '2026-10-23T18:30:00.000Z' }), 'Asia/Kolkata', now), null)
  assert.equal(revisionBucket(question({ next_revision_at: null }), 'Asia/Kolkata', now), 'unscheduled')
  assert.equal(revisionBucket(question({ status: 'Unsolved', next_revision_at: null }), 'Asia/Kolkata', now), null)
})

test('revision classification follows local calendar dates across daylight-saving changes', () => {
  const beforeLocalMidnight = new Date('2026-03-08T07:30:00.000Z')
  assert.equal(
    revisionBucket(question({ next_revision_at: '2026-03-08T08:00:00.000Z' }), 'America/Los_Angeles', beforeLocalMidnight),
    'upcoming',
  )
})

test('practice queue is empty for empty records', () => {
  assert.deepEqual(buildPracticeQueue([], [], [], 'UTC', new Date('2026-10-16T12:00:00Z')), [])
})

test('practice queue ranks urgent schedules and deduplicates by question and canonical URL', () => {
  const now = new Date('2026-10-16T12:00:00.000Z')
  const overdue = question({ id: 'overdue', next_revision_at: '2026-10-15T10:00:00.000Z' })
  const due = question({ id: 'due', url: 'https://leetcode.com/problems/due', next_revision_at: '2026-10-16T10:00:00.000Z' })
  const priority = question({ id: 'priority', url: 'https://leetcode.com/problems/priority', status: 'Unsolved', is_love_babbar_priority: true })
  const duplicateUrlPriority = question({ id: 'duplicate', url: 'https://www.leetcode.com/problems/priority/?source=feed', status: 'Unsolved', is_love_babbar_priority: true })
  const weak = question({ id: 'weak', url: 'https://leetcode.com/problems/weak', status: 'Attempted', topic: 'Graphs' })
  const solvedSameExternal = question({ id: 'owned', url: 'https://leetcode.com/problems/external-question/', external_slug: 'external-question', next_revision_at: '2026-12-01T00:00:00.000Z' })
  const pendingRecommendation = suggestion()
  const queue = buildPracticeQueue(
    [priority, due, overdue, duplicateUrlPriority, weak, solvedSameExternal],
    [pendingRecommendation, suggestion({ id: 'dismissed', decision: 'dismissed' })],
    ['Graphs'],
    'UTC',
    now,
  )

  assert.deepEqual(queue.map(item => item.kind === 'question' ? item.bucket : item.bucket), [
    'overdue', 'today', 'priority', 'weak_topic',
  ])
  assert.deepEqual(queue.filter(item => item.kind === 'question').map(item => item.question.id), [
    'overdue', 'due', 'priority', 'weak',
  ])
  assert.equal(queue.some(item => item.kind === 'recommendation'), false, 'an external candidate already owned (even solved) must be excluded')
})

test('new external recommendations are deduplicated by external identity and canonical URL', () => {
  const queue = buildPracticeQueue([], [
    suggestion(),
    suggestion({ id: 'same-id', suggested_url: 'https://example.com/other' }),
    suggestion({ id: 'same-url', suggested_external_id: 'different-id', suggested_url: 'https://www.leetcode.com/problems/external-question/?ref=1' }),
  ], [], 'UTC', new Date('2026-10-16T12:00:00Z'))
  assert.equal(queue.length, 1)
  assert.equal(queue[0].kind, 'recommendation')
})
