export type ReviewOutcome = 'Again' | 'Hard' | 'Good' | 'Easy'
export type RevisionBucket = 'overdue' | 'today' | 'upcoming' | 'unscheduled' | 'priority' | 'weak_topic' | 'recommendation'

export interface SchedulableQuestion {
  id: string
  title: string
  url: string
  source: string
  external_slug: string | null
  topic: string | null
  status: string
  priority: string | null
  is_love_babbar_priority: boolean
  next_revision_at: string | null
}

export interface ExternalSuggestion {
  id: string
  decision: string
  suggested_external_id: string | null
  suggested_title: string
  suggested_url: string
  suggested_source: string | null
  suggested_topic: string | null
  suggested_difficulty: string | null
}

export type PracticeQueueItem =
  | { kind: 'question'; bucket: Exclude<RevisionBucket, 'recommendation'>; question: SchedulableQuestion }
  | { kind: 'recommendation'; bucket: 'recommendation'; recommendation: ExternalSuggestion }

export function nextIntervalDays(outcome: ReviewOutcome, previousIntervalDays: number): number {
  const previous = Number.isFinite(previousIntervalDays)
    ? Math.min(365, Math.max(0, Math.trunc(previousIntervalDays)))
    : 0
  if (outcome === 'Again') return 1
  if (outcome === 'Hard') return Math.min(365, Math.max(1, Math.round(previous * 1.2)))
  if (outcome === 'Good') return previous === 0 ? 1 : Math.min(365, Math.round(previous * 2.5))
  return previous === 0 ? 4 : Math.min(365, Math.round(previous * 3.5))
}

function localDay(timestamp: string, timeZone: string): string | null {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const result = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${result.year}-${result.month}-${result.day}`
}

function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10)
}

export function revisionBucket(
  question: SchedulableQuestion,
  timeZone: string,
  now = new Date(),
  upcomingDays = 7,
): 'overdue' | 'today' | 'upcoming' | 'unscheduled' | null {
  const today = localDay(now.toISOString(), timeZone)
  if (!today) throw new Error('Could not determine today in the selected timezone.')
  if (!question.next_revision_at) return question.status === 'Solved' ? 'unscheduled' : null

  const dueDay = localDay(question.next_revision_at, timeZone)
  if (!dueDay) return question.status === 'Solved' ? 'unscheduled' : null
  if (dueDay < today) return 'overdue'
  if (dueDay === today) return 'today'
  if (dueDay <= shiftDay(today, upcomingDays)) return 'upcoming'
  return null
}

function canonicalUrl(value: string): string {
  try {
    const parsed = new URL(value.trim())
    return `${parsed.hostname.toLowerCase().replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`
  } catch {
    return value.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
  }
}

function alreadyInLibrary(suggestion: ExternalSuggestion, questions: SchedulableQuestion[]): boolean {
  const url = canonicalUrl(suggestion.suggested_url)
  const externalId = suggestion.suggested_external_id?.toLowerCase()
  const source = suggestion.suggested_source?.toLowerCase()
  return questions.some(question =>
    canonicalUrl(question.url) === url ||
    Boolean(externalId && source && question.source.toLowerCase() === source &&
      (question.external_slug?.toLowerCase() === externalId ||
        question.url.toLowerCase().split('/problems/')[1]?.split(/[/?#]/)[0] === externalId)),
  )
}

export function buildPracticeQueue(
  questions: SchedulableQuestion[],
  recommendations: ExternalSuggestion[],
  weakTopics: string[],
  timeZone: string,
  now = new Date(),
): PracticeQueueItem[] {
  const queue: PracticeQueueItem[] = []
  const queuedQuestionIds = new Set<string>()
  const queuedUrls = new Set<string>()
  const pushQuestion = (question: SchedulableQuestion, bucket: Exclude<RevisionBucket, 'recommendation'>) => {
    const url = canonicalUrl(question.url)
    if (queuedQuestionIds.has(question.id) || queuedUrls.has(url)) return
    queuedQuestionIds.add(question.id)
    queuedUrls.add(url)
    queue.push({ kind: 'question', bucket, question })
  }

  const bucketRank: Record<RevisionBucket, number> = {
    overdue: 0, today: 1, upcoming: 2, unscheduled: 3, priority: 4, weak_topic: 5, recommendation: 6,
  }
  const scheduled = questions
    .map(question => ({ question, bucket: revisionBucket(question, timeZone, now) }))
    .filter((item): item is { question: SchedulableQuestion; bucket: 'overdue' | 'today' | 'upcoming' | 'unscheduled' } => item.bucket !== null)
    .sort((a, b) => bucketRank[a.bucket] - bucketRank[b.bucket] ||
      (a.question.next_revision_at ?? '').localeCompare(b.question.next_revision_at ?? '') ||
      a.question.title.localeCompare(b.question.title))
  for (const item of scheduled) pushQuestion(item.question, item.bucket)

  const weakTopicSet = new Set(weakTopics.map(topic => topic.trim().toLowerCase()))
  const supplemental = questions
    .filter(question => question.is_love_babbar_priority || Boolean(question.topic && weakTopicSet.has(question.topic.trim().toLowerCase())))
    .sort((a, b) =>
      Number(b.is_love_babbar_priority) - Number(a.is_love_babbar_priority) ||
      a.title.localeCompare(b.title),
    )
  for (const question of supplemental) {
    const bucket = question.is_love_babbar_priority ? 'priority' : 'weak_topic'
    pushQuestion(question, bucket)
  }

  const seenRecommendationIds = new Set<string>()
  const seenRecommendationUrls = new Set<string>()
  const pending = recommendations
    .filter(recommendation => recommendation.decision === 'pending' &&
      recommendation.suggested_external_id &&
      !alreadyInLibrary(recommendation, questions))
    .sort((a, b) => a.suggested_title.localeCompare(b.suggested_title))
  for (const recommendation of pending) {
    const identity = `${recommendation.suggested_source?.toLowerCase() ?? ''}:${recommendation.suggested_external_id?.toLowerCase()}`
    const url = canonicalUrl(recommendation.suggested_url)
    if (seenRecommendationIds.has(identity) || seenRecommendationUrls.has(url)) continue
    seenRecommendationIds.add(identity)
    seenRecommendationUrls.add(url)
    queue.push({ kind: 'recommendation', bucket: 'recommendation', recommendation })
  }

  return queue
}

export function formatLocalDueDate(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en', { timeZone, dateStyle: 'medium' }).format(new Date(timestamp))
}
