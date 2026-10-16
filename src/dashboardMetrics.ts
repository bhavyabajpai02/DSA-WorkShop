import type { Question, QuestionStatus } from './types'

export interface ActivityEvent {
  id: string
  event_type: 'solved' | 'status_changed' | 'recommendation_accepted' | 'review_completed'
  question_id: string | null
  occurred_at: string
  metadata: Record<string, unknown>
}

export interface TopicMetric {
  name: string
  total: number
  solved: number
  needsRevision: number
  attempted: number
}

export interface ActivityDay {
  date: string
  solved: number
}

export interface DashboardMetrics {
  counts: Record<QuestionStatus, number> & { total: number }
  dailyActivity: ActivityDay[]
  weeklyActivity: ActivityDay[]
  topicMetrics: TopicMetric[]
  difficultyMetrics: Array<{ name: string; total: number; solved: number }>
  heatmap: ActivityDay[]
  currentStreak: number
  bestStreak: number
  todaySolved: number
  weekSolved: number
  uniqueQuestionsSolved: number
  weakTopics: TopicMetric[]
}

function dayKey(timestamp: string, timeZone: string): string | null {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function shiftDay(key: string, offset: number): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10)
}

function startOfWeek(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return shiftDay(key, -((weekday + 6) % 7))
}

function localToday(now: Date, timeZone: string): string {
  const key = dayKey(now.toISOString(), timeZone)
  if (!key) throw new Error('Could not determine the current date in the selected timezone.')
  return key
}

export function calculateDashboardMetrics(
  questions: Question[],
  events: ActivityEvent[],
  timeZone: string,
  now = new Date(),
): DashboardMetrics {
  const counts: DashboardMetrics['counts'] = {
    total: questions.length,
    Solved: 0,
    Unsolved: 0,
    Attempted: 0,
    'Needs Revision': 0,
  }
  const topics = new Map<string, TopicMetric>()
  const difficulties = new Map<string, { name: string; total: number; solved: number }>()

  for (const question of questions) {
    counts[question.status] += 1
    const topicName = question.topic?.trim() || 'Uncategorized'
    const topic = topics.get(topicName) ?? { name: topicName, total: 0, solved: 0, needsRevision: 0, attempted: 0 }
    topic.total += 1
    if (question.status === 'Solved') topic.solved += 1
    if (question.status === 'Needs Revision') topic.needsRevision += 1
    if (question.status === 'Attempted') topic.attempted += 1
    topics.set(topicName, topic)

    const difficultyName = question.difficulty || 'Unknown'
    const difficulty = difficulties.get(difficultyName) ?? { name: difficultyName, total: 0, solved: 0 }
    difficulty.total += 1
    if (question.status === 'Solved') difficulty.solved += 1
    difficulties.set(difficultyName, difficulty)
  }

  const today = localToday(now, timeZone)
  const weekStart = startOfWeek(today)
  const solvesByDay = new Map<string, Set<string>>()
  const uniqueSolvedQuestions = new Set<string>()
  for (const event of events) {
    if (event.event_type !== 'solved' || !event.question_id) continue
    const key = dayKey(event.occurred_at, timeZone)
    if (!key) continue
    const questionsForDay = solvesByDay.get(key) ?? new Set<string>()
    questionsForDay.add(event.question_id)
    solvesByDay.set(key, questionsForDay)
    uniqueSolvedQuestions.add(event.question_id)
  }

  const solvedOn = (key: string) => solvesByDay.get(key)?.size ?? 0
  const dailyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(today, index - 6)
    return { date, solved: solvedOn(date) }
  })
  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(weekStart, index)
    return { date, solved: solvedOn(date) }
  })
  const heatmap = Array.from({ length: 365 }, (_, index) => {
    const date = shiftDay(today, index - 364)
    return { date, solved: solvedOn(date) }
  })

  const activeDays = [...solvesByDay.keys()].sort()
  let bestStreak = 0
  let runningStreak = 0
  let previousDay = ''
  for (const date of activeDays) {
    runningStreak = previousDay && shiftDay(previousDay, 1) === date ? runningStreak + 1 : 1
    bestStreak = Math.max(bestStreak, runningStreak)
    previousDay = date
  }
  const yesterday = shiftDay(today, -1)
  let currentStreak = 0
  let streakDay = solvesByDay.has(today) ? today : solvesByDay.has(yesterday) ? yesterday : ''
  while (streakDay && solvesByDay.has(streakDay)) {
    currentStreak += 1
    streakDay = shiftDay(streakDay, -1)
  }

  const topicMetrics = [...topics.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const weakTopics = [...topics.values()]
    .filter(topic => topic.needsRevision > 0 || topic.attempted > 0)
    .sort((a, b) =>
      b.needsRevision - a.needsRevision ||
      b.attempted - a.attempted ||
      a.name.localeCompare(b.name),
    )
    .slice(0, 5)

  return {
    counts,
    dailyActivity,
    weeklyActivity,
    topicMetrics,
    difficultyMetrics: [...difficulties.values()].sort((a, b) => a.name.localeCompare(b.name)),
    heatmap,
    currentStreak,
    bestStreak,
    todaySolved: solvedOn(today),
    weekSolved: [...solvesByDay].reduce((total, [date, questionsForDay]) =>
      date >= weekStart && date <= today ? total + questionsForDay.size : total, 0),
    uniqueQuestionsSolved: uniqueSolvedQuestions.size,
    weakTopics,
  }
}
