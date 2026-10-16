export type QuestionStatus = 'Unsolved' | 'Attempted' | 'Solved' | 'Needs Revision'
export type Difficulty = 'Easy' | 'Medium' | 'Hard' | ''
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low' | 'Review' | ''

export interface Question {
  id: string
  owner_id: string
  import_key: string
  title: string
  url: string
  external_slug: string | null
  source: string
  topic: string | null
  pattern: string | null
  difficulty: Difficulty | null
  priority: Priority | null
  is_love_babbar_priority: boolean
  source_group: string | null
  notes: string | null
  status: QuestionStatus
  attempts: number
  confidence: number | null
  first_solved_at: string | null
  last_attempt_at: string | null
  next_revision_at: string | null
  created_at: string
  updated_at: string
}

export interface QuestionDraft {
  title: string
  url: string
  source: string
  status: QuestionStatus
  topic: string
  pattern: string
  difficulty: Difficulty
  priority: Priority
  is_love_babbar_priority: boolean
  source_group: string
  notes: string
}

export const EMPTY_DRAFT: QuestionDraft = {
  title: '', url: '', source: 'LeetCode', status: 'Unsolved', topic: '', pattern: '',
  difficulty: '', priority: 'Medium', is_love_babbar_priority: false, source_group: '', notes: '',
}
