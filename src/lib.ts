import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT_ID') && !key.includes('YOUR_SUPABASE'))
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export function normalizeUrl(value: string) {
  return value.trim().replace(/\/$/, '')
}
export function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'question'
}
export function inferSource(url: string) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } })()
  if (host.includes('leetcode.com')) return 'LeetCode'
  if (host.includes('geeksforgeeks.org')) return 'GeeksforGeeks'
  if (host.includes('hackerrank.com')) return 'HackerRank'
  if (host.includes('codeforces.com')) return 'Codeforces'
  return host || 'Custom'
}
export function validHttpUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false }
}

// Optional AI metadata classifier. This must point to a server-side endpoint; never put provider API keys in VITE_ variables.
export const aiClassificationEndpoint = (import.meta.env.VITE_AI_CLASSIFICATION_ENDPOINT as string | undefined)?.trim() || ''
export type AIClassification = { question_id: string; topic?: string | null; pattern?: string | null }
export async function classifyQuestionMetadata(questions: Array<{ id: string; title: string; url: string; topic: string | null; pattern: string | null }>): Promise<AIClassification[]> {
  if (!aiClassificationEndpoint) return []
  const response = await fetch(aiClassificationEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions: questions.map(q => ({ question_id: q.id, title: q.title, url: q.url, topic: q.topic, pattern: q.pattern })) }),
  })
  if (!response.ok) throw new Error(`AI classification endpoint returned HTTP ${response.status}.`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { classifications?: unknown }).classifications)) {
    throw new Error('AI endpoint response must contain a classifications array.')
  }
  return (payload as { classifications: AIClassification[] }).classifications.filter(item => item && typeof item.question_id === 'string')
}
