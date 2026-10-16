import type { Question } from './types'
import { builtInExternalQuestionCatalogue, type ExternalQuestion } from './externalQuestionCatalogue'

export interface ExternalRecommendation {
  question: ExternalQuestion
  score: number
  reason: string
}

export interface ExternalRecommendationFilters {
  topic: string
  difficulty: string
  platform: string
}

export function filterExternalRecommendations<T extends {
  suggested_topic: string | null
  suggested_difficulty: string | null
  suggested_source: string | null
}>(recommendations: T[], filters: ExternalRecommendationFilters): T[] {
  return recommendations.filter(recommendation =>
    (filters.topic === 'All topics' || recommendation.suggested_topic === filters.topic) &&
    (filters.difficulty === 'All difficulties' || recommendation.suggested_difficulty === filters.difficulty) &&
    (filters.platform === 'All platforms' || recommendation.suggested_source === filters.platform),
  )
}

export function canonicalQuestionUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    let path = url.pathname.replace(/\/+$/, '')
    if (url.hostname === 'leetcode.com') {
      const match = path.match(/^\/problems\/([^/]+)/i)
      if (match) path = `/problems/${match[1].toLowerCase()}`
    }
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path || ''}`.replace(/\/+$/, '')
  } catch {
    return value.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
  }
}

export function platformQuestionId(platform: string, value: string): string {
  const normalizedPlatform = platform.trim().toLowerCase()
  if (normalizedPlatform === 'leetcode') {
    try {
      return new URL(value).pathname.match(/\/problems\/([^/]+)/i)?.[1]?.toLowerCase() ?? ''
    } catch {
      return ''
    }
  }
  return ''
}

function normalizeTag(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function relatedTag(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeTag(left)
  const normalizedRight = normalizeTag(right)
  return Boolean(normalizedLeft && normalizedRight &&
    (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)))
}

function normalizedPlatform(value: string | null | undefined): string {
  return normalizeTag(value).replace(/^www\./, '')
}

function isSameExternalQuestion(libraryQuestion: Question, candidate: ExternalQuestion): boolean {
  const candidateUrl = canonicalQuestionUrl(candidate.url)
  if (candidateUrl && canonicalQuestionUrl(libraryQuestion.url) === candidateUrl) return true
  const candidateId = platformQuestionId(candidate.platform, candidate.url) || candidate.id.toLowerCase()
  const questionPlatform = normalizedPlatform(libraryQuestion.source)
  const candidatePlatform = normalizedPlatform(candidate.platform)
  if (questionPlatform !== candidatePlatform) return false
  const questionId = libraryQuestion.external_slug?.toLowerCase() ||
    platformQuestionId(candidate.platform, libraryQuestion.url)
  return Boolean(candidateId && questionId && candidateId === questionId)
}

function difficultyDistance(left: string | null | undefined, right: string): number {
  const levels = ['Easy', 'Medium', 'Hard']
  const leftIndex = levels.indexOf(left ?? '')
  const rightIndex = levels.indexOf(right)
  return leftIndex < 0 ? 3 : Math.abs(leftIndex - rightIndex)
}

function scoreQuestion(candidate: ExternalQuestion, question: Question): { score: number; reasons: string[] } {
  const topicMatch = relatedTag(candidate.topic, question.topic)
  const patternMatch = relatedTag(candidate.pattern, question.pattern)
  if (!topicMatch && !patternMatch) return { score: 0, reasons: [] }

  const reasons: string[] = []
  let score = 0
  if (topicMatch) {
    score += 0.48
    reasons.push(candidate.topic)
  }
  if (patternMatch) {
    score += 0.36
    if (!topicMatch) reasons.push(candidate.pattern)
  }
  const weight = question.status === 'Solved' ? 1 : question.status === 'Attempted' ? 0.75 : question.status === 'Needs Revision' ? 0.65 : 0.45
  score += weight * 0.1
  const distance = difficultyDistance(question.difficulty, candidate.difficulty)
  if (distance === 0) score += 0.06
  else if (distance === 1) score += 0.03

  return { score, reasons }
}

export function recommendExternalQuestions(
  library: Question[],
  catalogue: ExternalQuestion[],
  limit = 12,
): ExternalRecommendation[] {
  const seenUrls = new Set<string>()
  const seenIds = new Set<string>()
  const ranked: ExternalRecommendation[] = []

  for (const question of catalogue) {
    const canonicalUrl = canonicalQuestionUrl(question.url)
    const id = question.id.trim().toLowerCase()
    const identity = `${normalizedPlatform(question.platform)}:${id}`
    if (!canonicalUrl || seenUrls.has(canonicalUrl) || seenIds.has(identity)) continue
    seenUrls.add(canonicalUrl)
    seenIds.add(identity)
    if (library.some(existing => isSameExternalQuestion(existing, question))) continue

    const matches = library
      .map(source => ({ source, ...scoreQuestion(question, source) }))
      .filter(match => match.score > 0)
      .sort((left, right) => right.score - left.score)
    const best = matches[0]
    if (!best) continue

    const practiced = library.filter(source =>
      source.status === 'Solved' &&
      (relatedTag(source.topic, question.topic) || relatedTag(source.pattern, question.pattern)),
    ).length
    const difficultyReason = best.source.difficulty
      ? difficultyDistance(best.source.difficulty, question.difficulty) === 0
        ? `${question.difficulty} difficulty matches your related question.`
        : `${question.difficulty} difficulty adds practice near your ${best.source.difficulty}-level question.`
      : `${question.difficulty} difficulty is suggested for this topic.`
    const reason = `Matches ${best.reasons.join(' and ')} from your library` +
      (practiced ? `, including ${practiced} solved question${practiced === 1 ? '' : 's'}` : '') +
      `; ${difficultyReason}`
    ranked.push({ question, score: best.score, reason })
  }

  return ranked.sort((left, right) => right.score - left.score || left.question.title.localeCompare(right.question.title)).slice(0, limit)
}

export interface CatalogueLoadResult {
  questions: ExternalQuestion[]
  source: 'built-in catalogue' | 'configured catalogue'
  warning?: string
}

function isExternalQuestion(value: unknown): value is ExternalQuestion {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ExternalQuestion>
  let validUrl = false
  try {
    const url = new URL(candidate.url ?? '')
    validUrl = url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    validUrl = false
  }
  return typeof candidate.id === 'string' && Boolean(candidate.id.trim()) &&
    typeof candidate.title === 'string' && Boolean(candidate.title.trim()) &&
    typeof candidate.url === 'string' && validUrl &&
    typeof candidate.platform === 'string' && Boolean(candidate.platform.trim()) &&
    typeof candidate.topic === 'string' && Boolean(candidate.topic.trim()) &&
    typeof candidate.pattern === 'string' && Boolean(candidate.pattern.trim()) &&
    ['Easy', 'Medium', 'Hard'].includes(candidate.difficulty ?? '')
}

export async function loadExternalQuestionCatalogue(): Promise<CatalogueLoadResult> {
  const endpoint = import.meta.env.VITE_EXTERNAL_QUESTION_CATALOG_URL?.trim()
  if (!endpoint) return { questions: builtInExternalQuestionCatalogue, source: 'built-in catalogue' }

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 429 ? ' (rate limited)' : ''}`)
    const payload: unknown = await response.json()
    const records = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { questions?: unknown }).questions)
        ? (payload as { questions: unknown[] }).questions
        : null
    if (!records || !records.length || !records.every(isExternalQuestion)) {
      throw new Error('the configured catalogue has an invalid or empty question list')
    }
    return {
      questions: records.map(question => ({
        ...question,
        id: question.id.trim(),
        title: question.title.trim(),
        url: question.url.trim(),
        platform: question.platform.trim(),
        topic: question.topic.trim(),
        pattern: question.pattern.trim(),
      })),
      source: 'configured catalogue',
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    return {
      questions: builtInExternalQuestionCatalogue,
      source: 'built-in catalogue',
      warning: `Could not load the configured question catalogue (${detail}); using the built-in curated catalogue instead.`,
    }
  }
}
