import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ChangeEvent, ReactNode } from 'react'
import Papa from 'papaparse'
import {
  Activity, ArrowDownUp, ArrowUpRight, BarChart3, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronDown, CircleHelp, ClipboardList, Clock3, Code2, Download,
  ExternalLink, FileUp, Flame, FolderOpen, LayoutDashboard, Link2, LoaderCircle,
  LogOut, MapPin, Menu, MoreHorizontal, Pencil, Plus, Save, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Target, ThumbsDown, ThumbsUp, Timer, Trash2,
  Trophy, UserRound, X, CircleDot, AlertTriangle, BrainCircuit, RefreshCw,
} from 'lucide-react'
import { EMPTY_DRAFT, type Difficulty, type Question, type QuestionDraft, type QuestionStatus } from './types'
import { aiClassificationEndpoint, classifyQuestionMetadata, inferSource, isSupabaseConfigured, normalizeUrl, slugify, supabase, validHttpUrl } from './lib'
import { canonicalQuestionUrl, filterExternalRecommendations, loadExternalQuestionCatalogue, recommendExternalQuestions } from './recommendationEngine'
import { calculateDashboardMetrics, type ActivityEvent, type DashboardMetrics } from './dashboardMetrics'
import { buildPracticeQueue, formatLocalDueDate, type ExternalSuggestion, type PracticeQueueItem, type ReviewOutcome, type SchedulableQuestion } from './revisionScheduler'

type View = 'Dashboard' | 'Practice' | 'All Questions' | 'Solved' | 'Unsolved' | 'Needs Revision' | 'Recommendations' | 'Profile'
type Toast = { type: 'success' | 'error' | 'info'; message: string }
type Recommendation = { id: string; owner_id: string; source_question_id: string | null; suggested_question_id: string | null; suggested_external_id: string | null; suggested_title: string; suggested_url: string; suggested_source: string | null; suggested_topic: string | null; suggested_pattern: string | null; suggested_difficulty: string | null; reason: string | null; score: number | null; decision: 'pending' | 'accepted' | 'dismissed' | 'already_added'; created_at: string }
type ProfilePreferences = { display_name: string; timezone: string; daily_goal: number; weekly_goal: number; preferred_difficulty: Exclude<Difficulty, ''> | null; target_topics: string[] }

const statusOptions: QuestionStatus[] = ['Unsolved', 'Attempted', 'Solved', 'Needs Revision']
const difficultyOptions: Difficulty[] = ['Easy', 'Medium', 'Hard', '']
const priorityOptions = ['Critical', 'High', 'Medium', 'Low', 'Review', ''] as const
const defaultPreferences: ProfilePreferences = {
  display_name: '', timezone: 'Asia/Kolkata', daily_goal: 3, weekly_goal: 15,
  preferred_difficulty: null, target_topics: [],
}
const timeZoneOptions = ['Asia/Kolkata', 'UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']
const reviewOutcomes: ReviewOutcome[] = ['Again', 'Hard', 'Good', 'Easy']

function App() {
  const [session, setSession] = useState<any>(null)
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [profile, setProfile] = useState<ProfilePreferences | null>(null)
  const [profileDraft, setProfileDraft] = useState<ProfilePreferences>(defaultPreferences)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [reviewQuestion, setReviewQuestion] = useState<Question | null>(null)
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcome>('Good')
  const [reviewConfidence, setReviewConfidence] = useState(3)
  const [reviewSubmissionId, setReviewSubmissionId] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const reviewInFlight = useRef(false)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState('')
  const [recommendationsBusy, setRecommendationsBusy] = useState(false)
  const [recommendationActionId, setRecommendationActionId] = useState('')
  const [recommendationTopicFilter, setRecommendationTopicFilter] = useState('All topics')
  const [recommendationDifficultyFilter, setRecommendationDifficultyFilter] = useState('All difficulties')
  const [recommendationPlatformFilter, setRecommendationPlatformFilter] = useState('All platforms')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<View>('All Questions')
  const [search, setSearch] = useState('')
  const [topicFilter, setTopicFilter] = useState('All topics')
  const [difficultyFilter, setDifficultyFilter] = useState('All difficulties')
  const [priorityOnly, setPriorityOnly] = useState(false)
  const [sortBy, setSortBy] = useState('updated')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Question | null>(null)
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [importing, setImporting] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadQuestions = useCallback(async () => {
    if (!supabase || !session?.user?.id) return
    setLoading(true); setLoadError('')
    try {
      const [questionResult, progressResult] = await Promise.all([
        supabase.from('questions').select('*').eq('owner_id', session.user.id).order('updated_at', { ascending: false }),
        supabase.from('question_progress').select('*').eq('owner_id', session.user.id),
      ])
      if (questionResult.error) throw questionResult.error
      if (progressResult.error) throw progressResult.error
      const progressById = new Map((progressResult.data ?? []).map((p: any) => [p.question_id, p]))
      const merged = (questionResult.data ?? []).map((q: any) => {
        const p: any = progressById.get(q.id) ?? {}
        return { ...q, status: p.status ?? 'Unsolved', attempts: p.attempts ?? 0, confidence: p.confidence ?? null,
          first_solved_at: p.first_solved_at ?? null, last_attempt_at: p.last_attempt_at ?? null,
          next_revision_at: p.next_revision_at ?? null }
      }) as Question[]
      setQuestions(merged)
    } catch (error: any) {
      setLoadError(error?.message ?? 'Unable to load questions.')
    } finally { setLoading(false) }
  }, [session?.user?.id])

  useEffect(() => { void loadQuestions() }, [loadQuestions])

  const loadProfile = useCallback(async () => {
    if (!supabase || !session?.user?.id) return
    setProfileLoading(true)
    setProfileError('')
    try {
      const database = supabase
      const userId = session.user.id
      let { data, error } = await database.from('profiles')
        .select('display_name, timezone, daily_goal, weekly_goal, preferred_difficulty, target_topics')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        const { error: initializeError } = await database.from('profiles')
          .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
        if (initializeError) throw initializeError

        const initializedProfile = await database.from('profiles')
          .select('display_name, timezone, daily_goal, weekly_goal, preferred_difficulty, target_topics')
          .eq('id', userId)
          .maybeSingle()
        if (initializedProfile.error) throw initializedProfile.error
        if (!initializedProfile.data) {
          throw new Error('Your profile row is still unavailable after initialization. Check the profile owner policy.')
        }
        data = initializedProfile.data
      }
      let timeZone = data.timezone || 'Asia/Kolkata'
      try { new Intl.DateTimeFormat('en', { timeZone }).format(new Date()) }
      catch {
        timeZone = 'Asia/Kolkata'
        setProfileError('The saved timezone is invalid. Asia/Kolkata is selected; save a valid timezone to update it.')
      }
      const preferences: ProfilePreferences = {
        display_name: data.display_name ?? '',
        timezone: timeZone,
        daily_goal: data.daily_goal ?? 3,
        weekly_goal: data.weekly_goal ?? 15,
        preferred_difficulty: data.preferred_difficulty ?? null,
        target_topics: Array.isArray(data.target_topics) ? data.target_topics : [],
      }
      setProfile(preferences)
      setProfileDraft(preferences)
    } catch (error: any) {
      setProfileError(error?.message ?? 'Unable to load your profile. Apply the Phase 4 migration.')
      setProfile(null)
    } finally { setProfileLoading(false) }
  }, [session?.user?.id])

  useEffect(() => {
    setProfile(null)
    setActivityEvents([])
    if (session?.user?.id) void loadProfile()
  }, [loadProfile, session?.user?.id])

  const loadActivity = useCallback(async () => {
    if (!supabase || !session?.user?.id) return
    setActivityLoading(true)
    setActivityError('')
    try {
      const events: ActivityEvent[] = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('activity_events')
          .select('id, event_type, question_id, occurred_at, metadata, review_submission_id')
          .eq('owner_id', session.user.id)
          .order('occurred_at', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        const page = (data ?? []) as ActivityEvent[]
        events.push(...page)
        if (page.length < pageSize) break
      }
      setActivityEvents(events)
    } catch (error: any) {
      setActivityError(error?.message ?? 'Unable to load activity. Apply the Phase 4 migration.')
    } finally { setActivityLoading(false) }
  }, [session?.user?.id])

  useEffect(() => { void loadActivity() }, [loadActivity])

  const loadRecommendations = useCallback(async () => {
    if (!supabase || !session?.user?.id) return
    setRecommendationsLoading(true)
    setRecommendationError('')
    try {
      const { data, error } = await supabase.from('recommendations').select('*').eq('owner_id', session.user.id).order('created_at', { ascending: false })
      if (error) throw error
      setRecommendations(((data ?? []) as Recommendation[]).filter(rec => !rec.suggested_question_id && rec.suggested_external_id))
    } catch (error: any) {
      setRecommendationError(error?.message ?? 'Unable to load recommendations. Apply both Phase 3 migrations first.')
    } finally { setRecommendationsLoading(false) }
  }, [session?.user?.id])

  useEffect(() => { void loadRecommendations() }, [loadRecommendations])

  const topics = useMemo(() => [...new Set(questions.map(q => q.topic?.trim()).filter((t): t is string => Boolean(t)))].sort((a, b) => a.localeCompare(b)), [questions])
  const visibleRecommendations = useMemo(() => filterExternalRecommendations(recommendations, {
    topic: recommendationTopicFilter,
    difficulty: recommendationDifficultyFilter,
    platform: recommendationPlatformFilter,
  }), [recommendations, recommendationTopicFilter, recommendationDifficultyFilter, recommendationPlatformFilter])
  const counts = useMemo(() => ({
    all: questions.length,
    solved: questions.filter(q => q.status === 'Solved').length,
    unsolved: questions.filter(q => q.status === 'Unsolved').length,
    revision: questions.filter(q => q.status === 'Needs Revision').length,
    priority: questions.filter(q => q.is_love_babbar_priority && q.status !== 'Solved').length,
  }), [questions])
  const dashboardMetrics = useMemo(
    () => calculateDashboardMetrics(questions, activityEvents, profile?.timezone || 'Asia/Kolkata'),
    [questions, activityEvents, profile?.timezone],
  )
  const practiceQueue = useMemo(
    () => buildPracticeQueue(
      questions,
      recommendations,
      dashboardMetrics.weakTopics.map(topic => topic.name),
      profile?.timezone || 'Asia/Kolkata',
    ),
    [questions, recommendations, dashboardMetrics.weakTopics, profile?.timezone],
  )
  const visibleQuestions = useMemo(() => {
    let result = questions.filter(q => {
      if (view === 'Solved' && q.status !== 'Solved') return false
      if (view === 'Unsolved' && q.status !== 'Unsolved' && q.status !== 'Attempted') return false
      if (view === 'Needs Revision' && q.status !== 'Needs Revision') return false
      if (topicFilter !== 'All topics' && q.topic !== topicFilter) return false
      if (difficultyFilter !== 'All difficulties' && q.difficulty !== difficultyFilter) return false
      if (priorityOnly && !q.is_love_babbar_priority) return false
      const needle = search.trim().toLowerCase()
      if (needle && ![q.title, q.url, q.topic, q.pattern, q.source, q.notes].some(v => String(v ?? '').toLowerCase().includes(needle))) return false
      return true
    })
    result = [...result].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'difficulty') return ['Easy', 'Medium', 'Hard'].indexOf(a.difficulty ?? '') - ['Easy', 'Medium', 'Hard'].indexOf(b.difficulty ?? '')
      if (sortBy === 'priority') return priorityRank(a.priority) - priorityRank(b.priority)
      if (sortBy === 'status') return a.status.localeCompare(b.status)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return result
  }, [questions, view, topicFilter, difficultyFilter, priorityOnly, search, sortBy])

  async function generateRecommendations() {
    const database = supabase
    if (!database || !session?.user?.id) return
    if (!questions.length) return notify('Add at least one question with topic or pattern metadata to personalize recommendations.', 'info')
    setRecommendationsBusy(true)
    try {
      let matchingQuestions = questions
      if (aiClassificationEndpoint) {
        const needsClassification = questions.filter(q => !q.topic?.trim() || !q.pattern?.trim())
        if (needsClassification.length) {
          const classifications = await classifyQuestionMetadata(needsClassification)
          for (const item of classifications) {
            const current = matchingQuestions.find(q => q.id === item.question_id)
            if (!current) continue
            const topic = item.topic?.trim() || current.topic
            const pattern = item.pattern?.trim() || current.pattern
            if (topic !== current.topic || pattern !== current.pattern) {
              const { error } = await database.from('questions').update({ topic, pattern, updated_at: new Date().toISOString() }).eq('id', current.id).eq('owner_id', session.user.id)
              if (error) throw error
              matchingQuestions = matchingQuestions.map(q => q.id === current.id ? { ...q, topic, pattern } : q)
            }
          }
          setQuestions(matchingQuestions)
        }
      }
      const catalogue = await loadExternalQuestionCatalogue()
      const candidates = recommendExternalQuestions(matchingQuestions, catalogue.questions, 100)
      const existingIds = new Set(recommendations.map(rec => `${rec.suggested_source?.toLowerCase()}:${rec.suggested_external_id?.toLowerCase()}`))
      const existingUrls = new Set(recommendations.map(rec => canonicalQuestionUrl(rec.suggested_url)))
      const proposed = candidates
        .filter(({ question }) => !existingIds.has(`${question.platform.toLowerCase()}:${question.id.toLowerCase()}`) &&
          !existingUrls.has(canonicalQuestionUrl(question.url)))
        .map(({ question, score, reason }) => ({
          owner_id: session.user.id, source_question_id: null, suggested_question_id: null,
          suggested_external_id: question.id, suggested_title: question.title,
          suggested_url: question.url, suggested_source: question.platform,
          suggested_topic: question.topic, suggested_pattern: question.pattern,
          suggested_difficulty: question.difficulty, reason, score, decision: 'pending',
        }))
      if (!proposed.length) {
        setView('Recommendations')
        notify(catalogue.warning
          ? `${catalogue.warning} No new matching recommendations were found.`
          : 'No new external catalogue matches found. Add topic or pattern metadata, or choose different filters.',
        'info')
        return
      }
      const { error } = await database.from('recommendations').upsert(proposed, {
        onConflict: 'owner_id,suggested_source,suggested_external_id',
        ignoreDuplicates: true,
      })
      if (error) throw error
      await loadRecommendations()
      setView('Recommendations')
      notify(catalogue.warning
        ? `${catalogue.warning} Added ${proposed.length} recommendation${proposed.length === 1 ? '' : 's'}.`
        : `Added ${proposed.length} ${catalogue.source} recommendation${proposed.length === 1 ? '' : 's'}.`,
      catalogue.warning ? 'info' : 'success')
    } catch (error: any) { notify(error?.message ?? 'Could not generate recommendations.', 'error') }
    finally { setRecommendationsBusy(false) }
  }

  async function decideRecommendation(rec: Recommendation, decision: 'accepted' | 'dismissed') {
    const database = supabase
    if (!database || !session?.user?.id) return
    if (recommendationActionId || rec.decision !== 'pending') return
    setRecommendationActionId(rec.id)
    try {
      if (decision === 'accepted') {
        const { data, error } = await database.rpc('accept_external_recommendation', { p_recommendation_id: rec.id })
        if (error) throw error
        const result = Array.isArray(data) ? data[0] : data
        if (!result?.question_id) throw new Error('The server did not confirm adding this question.')
        await Promise.all([loadRecommendations(), loadQuestions(), loadActivity()])
        notify(result.already_present ? 'This question is already in your library; no duplicate was added.' : 'Added to your unsolved practice list.')
        return
      }
      const { error } = await database.from('recommendations').update({ decision, decided_at: new Date().toISOString() }).eq('id', rec.id).eq('owner_id', session.user.id).eq('decision', 'pending')
      if (error) throw error
      await loadRecommendations()
      notify('Suggestion dismissed.')
    } catch (error: any) { notify(error?.message ?? 'Could not update recommendation.', 'error') }
    finally { setRecommendationActionId('') }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setAuthBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthBusy(false)
    if (error) notify(error.message, 'error')
  }
  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setQuestions([]); setRecommendations([]); setActivityEvents([]); setProfile(null)
  }

  function updateProfileDraft<K extends keyof ProfilePreferences>(key: K, value: ProfilePreferences[K]) {
    setProfileDraft(previous => ({ ...previous, [key]: value }))
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !session?.user?.id) return
    const displayName = profileDraft.display_name.trim()
    if (displayName.length > 80) return notify('Display name must be 80 characters or fewer.', 'error')
    if (!Number.isInteger(profileDraft.daily_goal) || profileDraft.daily_goal < 1 || profileDraft.daily_goal > 500) {
      return notify('Daily goal must be a whole number from 1 to 500.', 'error')
    }
    if (!Number.isInteger(profileDraft.weekly_goal) || profileDraft.weekly_goal < 1 || profileDraft.weekly_goal > 3500) {
      return notify('Weekly goal must be a whole number from 1 to 3500.', 'error')
    }
    try { new Intl.DateTimeFormat('en', { timeZone: profileDraft.timezone }) }
    catch { return notify('Choose a valid timezone.', 'error') }

    setProfileSaving(true)
    setProfileError('')
    try {
      const { data, error } = await supabase.from('profiles')
        .update({
          display_name: displayName || null,
          timezone: profileDraft.timezone,
          daily_goal: profileDraft.daily_goal,
          weekly_goal: profileDraft.weekly_goal,
          preferred_difficulty: profileDraft.preferred_difficulty,
          target_topics: profileDraft.target_topics,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)
        .select('display_name, timezone, daily_goal, weekly_goal, preferred_difficulty, target_topics')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Your profile row no longer exists. Reload settings to initialize it before saving.')
      const saved: ProfilePreferences = {
        display_name: data.display_name ?? '',
        timezone: data.timezone,
        daily_goal: data.daily_goal,
        weekly_goal: data.weekly_goal,
        preferred_difficulty: data.preferred_difficulty ?? null,
        target_topics: data.target_topics ?? [],
      }
      setProfile(saved)
      setProfileDraft(saved)
      notify('Profile and goals saved.')
    } catch (error: any) {
      setProfileError(error?.message ?? 'Unable to save your profile settings.')
      notify(error?.message ?? 'Unable to save your profile settings.', 'error')
    } finally { setProfileSaving(false) }
  }

  function openAdd() { setEditing(null); setDraft(EMPTY_DRAFT); setModalOpen(true) }
  function openEdit(q: Question) {
    setEditing(q)
    setDraft({ title: q.title, url: q.url, source: q.source || inferSource(q.url), status: q.status,
      topic: q.topic ?? '', pattern: q.pattern ?? '', difficulty: q.difficulty ?? '', priority: q.priority ?? '',
      is_love_babbar_priority: q.is_love_babbar_priority, source_group: q.source_group ?? '', notes: q.notes ?? '' })
    setModalOpen(true)
  }
  function updateDraft<K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) { setDraft(prev => ({ ...prev, [key]: value })) }

  async function saveQuestion(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !session?.user?.id) return
    if (!draft.title.trim()) return notify('Add a question title first.', 'error')
    if (!validHttpUrl(draft.url)) return notify('Enter a valid http:// or https:// question URL.', 'error')
    setSaving(true)
    try {
      const url = normalizeUrl(draft.url)
      const importKey = editing?.import_key || `${slugify(draft.title)}-${await hashString(url)}`
      const payload = {
        owner_id: session.user.id, import_key: importKey, title: draft.title.trim(), url,
        external_slug: url.split('/').filter(Boolean).at(-1) ?? slugify(draft.title),
        source: draft.source.trim() || inferSource(url), topic: draft.topic.trim() || null,
        pattern: draft.pattern.trim() || null, difficulty: draft.difficulty || null,
        priority: draft.priority || null, is_love_babbar_priority: draft.is_love_babbar_priority,
        source_group: draft.source_group.trim() || null, notes: draft.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { data: q, error } = await supabase.from('questions').upsert(payload, { onConflict: 'owner_id,url' }).select().single()
      if (error) throw error
      const { error: statusError } = await supabase.rpc('record_question_status', {
        p_question_id: q.id, p_status: draft.status,
      })
      if (statusError) throw statusError
      setModalOpen(false); notify(editing ? 'Question updated.' : 'Question added.')
      await Promise.all([loadQuestions(), loadActivity()])
    } catch (error: any) { notify(error?.message ?? 'Could not save question.', 'error') }
    finally { setSaving(false) }
  }

  async function changeStatus(q: Question, status: QuestionStatus) {
    if (!supabase || !session?.user?.id) return
    const { data, error } = await supabase.rpc('record_question_status', {
      p_question_id: q.id, p_status: status,
    })
    if (error) return notify(error.message, 'error')
    if (!data) return
    notify(`Status changed to ${status}.`)
    await Promise.all([loadQuestions(), loadActivity()])
  }

  function openReview(question: Question) {
    setReviewQuestion(question)
    setReviewOutcome('Good')
    setReviewConfidence(question.confidence ?? 3)
    setReviewSubmissionId(crypto.randomUUID())
    setReviewError('')
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !session?.user?.id || !reviewQuestion || !reviewSubmissionId || reviewInFlight.current) return
    reviewInFlight.current = true
    setReviewSaving(true)
    setReviewError('')
    try {
      const { data, error } = await supabase.rpc('record_question_review', {
        p_question_id: reviewQuestion.id,
        p_outcome: reviewOutcome,
        p_confidence: reviewConfidence,
        p_submission_id: reviewSubmissionId,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      if (!result || typeof result.interval_days !== 'number' || !result.next_revision_at) {
        throw new Error('The database did not confirm the review schedule.')
      }
      setReviewQuestion(null)
      setReviewSubmissionId('')
      notify(result.duplicate
        ? 'This review was already recorded; its original schedule was kept.'
        : `Review saved. Next review in ${result.interval_days} day${result.interval_days === 1 ? '' : 's'}.`)
      await Promise.all([loadQuestions(), loadActivity()])
    } catch (error: any) {
      const message = error?.message ?? 'Could not save this review.'
      setReviewError(message)
      notify(message, 'error')
    } finally {
      reviewInFlight.current = false
      setReviewSaving(false)
    }
  }

  function closeReview() {
    if (reviewSaving) return
    setReviewQuestion(null)
    setReviewSubmissionId('')
    setReviewError('')
  }

  async function deleteQuestion(q: Question) {
    if (!supabase || !session?.user?.id) return
    if (!window.confirm(`Delete “${q.title}”? This also removes its progress history.`)) return
    const { error } = await supabase.from('questions').delete().eq('id', q.id).eq('owner_id', session.user.id)
    if (error) return notify(error.message, 'error')
    notify('Question deleted.'); await loadQuestions()
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const database = supabase
    event.target.value = ''
    if (!file || !database || !session?.user?.id) return
    setImporting(true)
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true, complete: async result => {
      try {
        const records = result.data
        const problems: string[] = []
        const prepared = records.map((r, index) => {
          const title = String(r.title ?? r['Title of Question'] ?? '').trim()
          const url = normalizeUrl(String(r.url ?? r['Reference Link (visible URL)'] ?? ''))
          if (!title || !validHttpUrl(url)) { problems.push(`Row ${index + 2}: missing title or invalid URL`); return null }
          const rawStatus = String(r.status ?? r.Status ?? 'Unsolved').trim()
          const status: QuestionStatus = statusOptions.includes(rawStatus as QuestionStatus) ? rawStatus as QuestionStatus : 'Unsolved'
          const priorityRaw = String(r.priority ?? r['Revision Priority'] ?? '').trim()
          const priority = priorityOptions.includes(priorityRaw as any) ? priorityRaw : ''
          return {
            owner_id: session.user.id, import_key: String(r.question_id ?? `${slugify(title)}-${awaitHashPlaceholder(url)}`),
            title, url, external_slug: String(r.external_slug ?? url.split('/').filter(Boolean).at(-1) ?? ''),
            source: String(r.source ?? inferSource(url)), topic: String(r.topic ?? r.Topic ?? '').trim() || null,
            pattern: String(r.pattern ?? '').trim() || null, difficulty: ['Easy','Medium','Hard'].includes(String(r.difficulty ?? r['Level of Difficulty'])) ? String(r.difficulty ?? r['Level of Difficulty']) : null,
            priority: priority || null, is_love_babbar_priority: String(r.is_love_babbar_priority ?? '').toLowerCase() === 'true' || String(r.is_love_babbar_priority ?? '').toLowerCase() === 'yes',
            source_group: String(r.source_group ?? '').trim() || null, notes: String(r.notes ?? r.Notes ?? '').trim() || null,
            status,
          }
        }).filter(Boolean) as Array<Record<string, any>>
        if (!prepared.length) throw new Error(problems[0] ?? 'No valid records found in CSV.')
        const questionPayload = prepared.map(({ status: _status, ...q }) => ({ ...q, updated_at: new Date().toISOString() }))
        const { data: saved, error } = await database.from('questions').upsert(questionPayload, { onConflict: 'owner_id,url' }).select('id,url')
        if (error) throw error
        const statusByUrl = new Map(prepared.map(q => [q.url, q.status]))
        const progress = (saved ?? []).map(q => ({ owner_id: session.user.id, question_id: q.id, status: statusByUrl.get(q.url) ?? 'Unsolved', updated_at: new Date().toISOString() }))
        if (progress.length) { const { error: progressError } = await database.from('question_progress').upsert(progress, { onConflict: 'owner_id,question_id' }); if (progressError) throw progressError }
        notify(`Imported or updated ${saved?.length ?? 0} questions${problems.length ? `; skipped ${problems.length} invalid rows` : ''}.`, problems.length ? 'info' : 'success')
        await loadQuestions()
      } catch (error: any) { notify(error?.message ?? 'CSV import failed.', 'error') }
      finally { setImporting(false) }
    }, error: error => { setImporting(false); notify(error.message, 'error') } })
  }

  function exportCsv() {
    const csv = Papa.unparse(questions.map(q => ({ title: q.title, url: q.url, source: q.source, status: q.status, topic: q.topic ?? '', pattern: q.pattern ?? '', difficulty: q.difficulty ?? '', priority: q.priority ?? '', is_love_babbar_priority: q.is_love_babbar_priority, source_group: q.source_group ?? '', notes: q.notes ?? '' })))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'dsa-questions-export.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (!authReady) return <div className="screen-center"><LoaderCircle className="spin" size={26}/><span>Preparing your workspace…</span></div>
  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session) return <main className="auth-shell"><div className="auth-card"><Brand/><div className="eyebrow">PERSONAL DSA WORKSPACE</div><h1>Welcome back.</h1><p className="muted">Sign in to manage your question library and keep your revision data in sync.</p><form onSubmit={signIn} className="stack-form"><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password"/></label><button className="btn btn-primary btn-wide" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={16}/> : null} Sign in</button></form><div className="auth-note"><ShieldCheck size={15}/> Your account is protected by Supabase authentication and row-level security.</div></div></main>

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <Brand/><div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list">
        <button className={`nav-item ${view === 'Dashboard' ? 'active' : ''}`} onClick={() => {setView('Dashboard');setMobileNav(false)}}><LayoutDashboard size={17}/> Dashboard</button>
        <button className={`nav-item ${view === 'Practice' ? 'active' : ''}`} onClick={() => {setView('Practice');setMobileNav(false)}}><Timer size={17}/> Daily practice <span className="nav-count">{practiceQueue.length}</span></button>
        <div className="nav-section-label">QUESTION LIBRARY</div>
        <button className={`nav-item ${view === 'All Questions' ? 'active' : ''}`} onClick={() => {setView('All Questions');setMobileNav(false)}}><ClipboardList size={17}/> All questions <span className="nav-count">{counts.all}</span></button>
        <button className={`nav-item ${view === 'Solved' ? 'active' : ''}`} onClick={() => {setView('Solved');setMobileNav(false)}}><CheckCircle2 size={17}/> Solved <span className="nav-count">{counts.solved}</span></button>
        <button className={`nav-item ${view === 'Unsolved' ? 'active' : ''}`} onClick={() => {setView('Unsolved');setMobileNav(false)}}><CircleDot size={17}/> Unsolved <span className="nav-count">{counts.unsolved}</span></button>
        <button className={`nav-item ${view === 'Needs Revision' ? 'active' : ''}`} onClick={() => {setView('Needs Revision');setMobileNav(false)}}><Clock3 size={17}/> Needs revision <span className="nav-count">{counts.revision}</span></button>
        <button className={`nav-item ${view === 'Recommendations' ? 'active' : ''}`} onClick={() => {setView('Recommendations');setMobileNav(false)}}><BrainCircuit size={17}/> Recommendations <span className="nav-count">{recommendations.filter(r => r.decision === 'pending').length}</span></button>
        <div className="nav-section-label">PRIORITY</div>
        <button className={`nav-item ${priorityOnly ? 'active' : ''}`} onClick={() => {setPriorityOnly(v => !v);setView('All Questions');setMobileNav(false)}}><Flame size={17}/> Love Babbar list <span className="nav-count">{counts.priority}</span></button>
        <div className="nav-section-label">ACCOUNT</div>
        <button className={`nav-item ${view === 'Profile' ? 'active' : ''}`} onClick={() => {setView('Profile');setMobileNav(false)}}><Settings2 size={17}/> Profile &amp; settings</button>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Sparkles size={16}/><div><strong>Small steps compound.</strong><p>Only activity recorded after Phase 4 is counted toward streaks and achievements.</p></div></div><button className="nav-item" onClick={signOut}><LogOut size={17}/> Sign out</button></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-panel">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Open navigation"><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{view}</strong></div><div className="topbar-right"><span className="sync-state"><span className="live-dot"/> Supabase connected</span><div className="avatar"><UserRound size={17}/></div></div></header>
      <div className="page-content">
        {view === 'Dashboard' ? <DashboardPage
          metrics={dashboardMetrics}
          dailyGoal={profile?.daily_goal ?? defaultPreferences.daily_goal}
          weeklyGoal={profile?.weekly_goal ?? defaultPreferences.weekly_goal}
          loading={loading || activityLoading || profileLoading}
          questionError={loadError}
          activityError={activityError}
          profileError={profileError}
          onRetry={() => { void loadQuestions(); void loadActivity(); void loadProfile() }}
        /> : view === 'Practice' ? <PracticePage
          items={practiceQueue}
          timeZone={profile?.timezone || 'Asia/Kolkata'}
          loading={loading || activityLoading || recommendationsLoading}
          questionError={loadError}
          activityError={activityError}
          recommendationError={recommendationError}
          reviewHistory={activityEvents.filter(event => event.event_type === 'review_completed').slice(-10).reverse()}
          onRetry={() => { void loadQuestions(); void loadActivity(); void loadRecommendations() }}
          onReview={question => {
            const existing = questions.find(item => item.id === question.id)
            if (existing) openReview(existing)
          }}
          onAccept={recommendation => {
            const existing = recommendations.find(item => item.id === recommendation.id)
            if (existing) void decideRecommendation(existing, 'accepted')
          }}
          onDismiss={recommendation => {
            const existing = recommendations.find(item => item.id === recommendation.id)
            if (existing) void decideRecommendation(existing, 'dismissed')
          }}
          busyRecommendationId={recommendationActionId}
        /> : view === 'Profile' ? <ProfilePage
          profile={profile}
          draft={profileDraft}
          topics={topics}
          loading={profileLoading}
          saving={profileSaving}
          error={profileError}
          timeZones={timeZoneOptions}
          onChange={updateProfileDraft}
          onSubmit={saveProfile}
          onRetry={() => void loadProfile()}
        /> : <>
        <section className="page-heading"><div><div className="eyebrow">YOUR PRACTICE, ORGANIZED</div><h1>{view}</h1><p className="muted">Manage your DSA questions in one place. Changes sync to your private workspace.</p></div><button className="btn btn-primary" onClick={openAdd}><Plus size={17}/> Add question</button></section>
        <section className="stats-grid">
          <StatCard label="Total questions" value={counts.all} detail="In your library" icon={<BookOpen size={18}/>} tone="amber"/>
          <StatCard label="Solved" value={counts.solved} detail={`${counts.all ? Math.round(counts.solved / counts.all * 100) : 0}% of library`} icon={<CheckCircle2 size={18}/>} tone="green"/>
          <StatCard label="Unsolved" value={counts.unsolved} detail="Ready for practice" icon={<CircleDot size={18}/>} tone="blue"/>
          <StatCard label="Priority pending" value={counts.priority} detail="Love Babbar list" icon={<Flame size={18}/>} tone="rose"/>
        </section>
        {view === 'Recommendations' && <section className="recommendation-panel">
          <div className="recommendation-heading"><div><div className="eyebrow">PERSONALIZED EXTERNAL PRACTICE</div><h2>New questions to try</h2><p className="muted">Recommendations come from an expandable external-question catalogue, then match topics, patterns and difficulty in your library. The built-in LeetCode catalogue is a curated snapshot, not live search. Accept saves the original link and metadata as a new Unsolved question.</p></div><button className="btn btn-primary" onClick={() => void generateRecommendations()} disabled={recommendationsBusy || !questions.length}>{recommendationsBusy ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>} Find external questions</button></div>
          {recommendationError && <div className="error-banner"><AlertTriangle size={17}/><div><strong>Couldn't load recommendations</strong><p>{recommendationError}</p><small>Check that both Phase 3 migrations are applied.</small></div><button className="icon-btn" onClick={() => void loadRecommendations()}><ArrowDownUp size={16}/></button></div>}
          <div className="recommendation-filters">
            <select aria-label="Filter recommendations by topic" value={recommendationTopicFilter} onChange={e => setRecommendationTopicFilter(e.target.value)}><option>All topics</option>{[...new Set(recommendations.map(rec => rec.suggested_topic).filter((topic): topic is string => Boolean(topic)))].sort().map(topic => <option key={topic}>{topic}</option>)}</select>
            <select aria-label="Filter recommendations by difficulty" value={recommendationDifficultyFilter} onChange={e => setRecommendationDifficultyFilter(e.target.value)}><option>All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
            <select aria-label="Filter recommendations by platform" value={recommendationPlatformFilter} onChange={e => setRecommendationPlatformFilter(e.target.value)}><option>All platforms</option>{[...new Set(recommendations.map(rec => rec.suggested_source).filter((platform): platform is string => Boolean(platform)))].sort().map(platform => <option key={platform}>{platform}</option>)}</select>
            <span className="result-count">{visibleRecommendations.length} matching recommendations</span>
          </div>
          {recommendationsLoading ? <div className="recommendation-empty"><LoaderCircle className="spin" size={22}/> Loading suggestions…</div> : recommendations.length === 0 ? <div className="recommendation-empty"><BrainCircuit size={28}/><strong>No external recommendations yet</strong><span>Add topic or pattern tags to your questions, then find external questions. Recommendations exclude every URL and platform question ID already in your library.</span></div> : visibleRecommendations.length === 0 ? <div className="recommendation-empty"><BrainCircuit size={28}/><strong>No matches for these filters</strong><span>Try a different topic, difficulty or platform.</span></div> : <div className="recommendation-list">{visibleRecommendations.map(rec => <article className="recommendation-card" key={rec.id}>
            <div className="recommendation-card-top"><div><span className={`recommendation-state state-${rec.decision}`}>{rec.decision.replace('_',' ')}</span><h3>{rec.suggested_title}</h3><div className="recommendation-tags"><span className="topic-tag">{rec.suggested_source ?? 'External platform'}</span>{rec.suggested_topic && <span className="topic-tag">{rec.suggested_topic}</span>}{rec.suggested_pattern && <span className="pattern-text">{rec.suggested_pattern}</span>}{rec.suggested_difficulty && <span className="recommendation-difficulty">{rec.suggested_difficulty}</span>}</div></div></div>
            <a href={rec.suggested_url} target="_blank" rel="noreferrer" className="recommendation-external-url">{rec.suggested_url}<ExternalLink size={14}/></a>
            <p>{rec.reason || 'Matched against topics and patterns in your question library.'}</p>
            <div className="recommendation-actions">{rec.decision === 'pending' ? <><button className="btn btn-primary" onClick={() => void decideRecommendation(rec, 'accepted')} disabled={Boolean(recommendationActionId)}>{recommendationActionId === rec.id ? <LoaderCircle className="spin" size={15}/> : <ThumbsUp size={15}/>} Add to Unsolved</button><button className="btn btn-secondary" onClick={() => void decideRecommendation(rec, 'dismissed')} disabled={Boolean(recommendationActionId)}><ThumbsDown size={15}/> Dismiss</button></> : <span className="muted">Decision saved · {rec.decision === 'accepted' ? 'Question added to Unsolved' : rec.decision === 'already_added' ? 'Already in your library' : 'Recommendation dismissed'}</span>}</div>
          </article>)}</div>}
        </section>}
        {view !== 'Recommendations' && <>
        {loadError && <div className="error-banner"><AlertTriangle size={17}/><div><strong>Couldn't load questions</strong><p>{loadError}</p><small>Check that the SQL migration has been applied to your Supabase project.</small></div><button className="icon-btn" onClick={() => void loadQuestions()}><ArrowDownUp size={16}/></button></div>}
        <section className="table-card">
          <div className="table-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, topic, pattern or link…"/><kbd>⌘ K</kbd></div><div className="toolbar-actions"><button className="btn btn-secondary" onClick={() => importRef.current?.click()} disabled={importing}><FileUp size={16}/>{importing ? 'Importing…' : 'Import CSV'}</button><input ref={importRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv}/><button className="btn btn-secondary" onClick={exportCsv} disabled={!questions.length}><Download size={16}/> Export</button></div></div>
          <div className="filter-row"><div className="filter-label"><SlidersHorizontal size={15}/> Filters</div><select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}><option>All topics</option>{topics.map(t => <option key={t}>{t}</option>)}</select><select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}><option>All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select><select value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="difficulty">Difficulty</option><option value="priority">Priority</option><option value="status">Status</option></select>{priorityOnly && <button className="filter-chip" onClick={() => setPriorityOnly(false)}>Love Babbar priority <X size={13}/></button>}<span className="result-count">{visibleQuestions.length} result{visibleQuestions.length === 1 ? '' : 's'}</span></div>
          <div className="table-scroll"><table><thead><tr><th>QUESTION</th><th>TOPIC / PATTERN</th><th>DIFFICULTY</th><th>PRIORITY</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {loading ? <tr><td colSpan={6} className="table-state"><LoaderCircle className="spin" size={22}/><span>Loading your questions…</span></td></tr> : visibleQuestions.length === 0 ? <tr><td colSpan={6}><EmptyState hasQuestions={questions.length > 0} onAdd={openAdd} onReset={() => {setSearch('');setTopicFilter('All topics');setDifficultyFilter('All difficulties');setPriorityOnly(false);setView('All Questions')}}/></td></tr> : visibleQuestions.map(q => <QuestionRow key={q.id} question={q} onEdit={() => openEdit(q)} onDelete={() => void deleteQuestion(q)} onStatus={status => void changeStatus(q, status)} onReview={() => openReview(q)}/>) }
          </tbody></table></div>
          <div className="table-footer"><span>Showing <strong>{visibleQuestions.length}</strong> of <strong>{questions.length}</strong> questions</span><span><ShieldCheck size={14}/> Private to your account</span></div>
        </section>
        <div className="phase-note"><Activity size={16}/><span><strong>Phase 3 recommendations</strong> — topic/pattern-based suggestions with explicit Accept/Dismiss controls. AI classification is optional and remains disabled until a secure server-side endpoint is configured.</span></div>
        </>}
        </>}
      </div>
    </main>
    {modalOpen && <QuestionModal draft={draft} editing={Boolean(editing)} saving={saving} onChange={updateDraft} onClose={() => setModalOpen(false)} onSubmit={saveQuestion}/>}
    {reviewQuestion && <ReviewModal
      question={reviewQuestion}
      outcome={reviewOutcome}
      confidence={reviewConfidence}
      saving={reviewSaving}
      error={reviewError}
      onOutcome={setReviewOutcome}
      onConfidence={setReviewConfidence}
      onClose={closeReview}
      onSubmit={submitReview}
    />}
    {toast && <div className={`toast toast-${toast.type}`}><span>{toast.type === 'success' ? <Check size={17}/> : toast.type === 'error' ? <AlertTriangle size={17}/> : <CircleHelp size={17}/>}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>
}

function DashboardPage({
  metrics, dailyGoal, weeklyGoal, loading, questionError, activityError, profileError, onRetry,
}: {
  metrics: DashboardMetrics
  dailyGoal: number
  weeklyGoal: number
  loading: boolean
  questionError: string
  activityError: string
  profileError: string
  onRetry: () => void
}) {
  const dailyPercent = Math.min(100, Math.round(metrics.todaySolved / dailyGoal * 100))
  const weeklyPercent = Math.min(100, Math.round(metrics.weekSolved / weeklyGoal * 100))
  const milestones = [1, 10, 25, 50, 100]
  const maxTopicCount = Math.max(1, ...metrics.topicMetrics.map(topic => topic.total))
  const maxDifficultyCount = Math.max(1, ...metrics.difficultyMetrics.map(item => item.total))
  const maxDailyCount = Math.max(1, ...metrics.dailyActivity.map(day => day.solved))
  const maxWeeklyCount = Math.max(1, ...metrics.weeklyActivity.map(day => day.solved))

  return <section className="dashboard-page">
    <section className="page-heading"><div><div className="eyebrow">YOUR PRACTICE, IN FOCUS</div><h1>Dashboard</h1><p className="muted">A live summary of your question library and recorded practice activity.</p></div><div className="dashboard-timezone"><MapPin size={14}/>{profileError ? 'Timezone unavailable' : 'Profile timezone'}</div></section>
    {(questionError || activityError || profileError) && <div className="error-banner" role="alert"><AlertTriangle size={17}/><div><strong>Some dashboard data could not be loaded</strong><p>{questionError || activityError || profileError}</p><small>Check the Phase 4 migration and profile settings, then retry.</small></div><button className="icon-btn" onClick={onRetry} aria-label="Retry dashboard loading"><RefreshCw size={16}/></button></div>}
    {loading ? <div className="dashboard-state"><LoaderCircle className="spin" size={23}/> Loading your dashboard…</div> : <>
      <section className="stats-grid dashboard-stats" aria-label="Question progress">
        <StatCard label="Total questions" value={metrics.counts.total} detail="Current library" icon={<BookOpen size={18}/>} tone="amber"/>
        <StatCard label="Solved" value={metrics.counts.Solved} detail="Current status" icon={<CheckCircle2 size={18}/>} tone="green"/>
        <StatCard label="Unsolved" value={metrics.counts.Unsolved} detail="Ready for practice" icon={<CircleDot size={18}/>} tone="blue"/>
        <StatCard label="Attempted" value={metrics.counts.Attempted} detail="In progress" icon={<Activity size={18}/>} tone="amber"/>
        <StatCard label="Needs revision" value={metrics.counts['Needs Revision']} detail="Flagged for review" icon={<Clock3 size={18}/>} tone="rose"/>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card goal-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">TODAY</span><h2><Target size={18}/> Daily goal</h2></div><strong>{metrics.todaySolved} <small>/ {dailyGoal}</small></strong></div>
          <div className="goal-track" role="progressbar" aria-label="Daily solving goal" aria-valuenow={Math.min(dailyGoal, metrics.todaySolved)} aria-valuemin={0} aria-valuemax={dailyGoal}><span style={{ width: `${dailyPercent}%` }}/></div>
          <p>{dailyPercent >= 100 ? 'Daily goal complete. Great work!' : `${Math.max(0, dailyGoal - metrics.todaySolved)} more to reach today's goal.`}</p>
        </section>
        <section className="dashboard-card goal-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">THIS WEEK</span><h2><CalendarDays size={18}/> Weekly goal</h2></div><strong>{metrics.weekSolved} <small>/ {weeklyGoal}</small></strong></div>
          <div className="goal-track weekly" role="progressbar" aria-label="Weekly solving goal" aria-valuenow={Math.min(weeklyGoal, metrics.weekSolved)} aria-valuemin={0} aria-valuemax={weeklyGoal}><span style={{ width: `${weeklyPercent}%` }}/></div>
          <p>{weeklyPercent >= 100 ? 'Weekly goal complete. Keep the momentum.' : `${Math.max(0, weeklyGoal - metrics.weekSolved)} more this week.`}</p>
        </section>
        <section className="dashboard-card streak-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">CONSISTENCY</span><h2><Flame size={18}/> Solving streak</h2></div></div>
          <div className="streak-values"><div><strong>{metrics.currentStreak}</strong><span>current days</span></div><div><strong>{metrics.bestStreak}</strong><span>best days</span></div></div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-charts">
        <section className="dashboard-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2><BarChart3 size={18}/> Last 7 days</h2></div></div>
          <ActivityBars days={metrics.dailyActivity} max={maxDailyCount}/>
        </section>
        <section className="dashboard-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">CURRENT WEEK</span><h2><CalendarDays size={18}/> Solved each day</h2></div></div>
          <ActivityBars days={metrics.weeklyActivity} max={maxWeeklyCount}/>
        </section>
        <section className="dashboard-card chart-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">LIBRARY BREAKDOWN</span><h2>Topic progress</h2></div></div>
          {metrics.topicMetrics.length ? <div className="horizontal-bars">{metrics.topicMetrics.slice(0, 8).map(topic => <div className="horizontal-bar-row" key={topic.name}><span title={topic.name}>{topic.name}</span><div><i style={{ width: `${Math.round(topic.total / maxTopicCount * 100)}%` }}/></div><small>{topic.solved}/{topic.total}</small></div>)}</div> : <p className="chart-empty">Add questions to see topic progress.</p>}
        </section>
        <section className="dashboard-card chart-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">LIBRARY BREAKDOWN</span><h2>Difficulty progress</h2></div></div>
          {metrics.difficultyMetrics.length ? <div className="horizontal-bars">{metrics.difficultyMetrics.map(item => <div className="horizontal-bar-row" key={item.name}><span>{item.name}</span><div><i className={`difficulty-bar difficulty-bar-${item.name.toLowerCase()}`} style={{ width: `${Math.round(item.total / maxDifficultyCount * 100)}%` }}/></div><small>{item.solved}/{item.total}</small></div>)}</div> : <p className="chart-empty">Add questions to see difficulty progress.</p>}
        </section>
      </div>

      <section className="dashboard-card heatmap-card">
        <div className="dashboard-card-heading"><div><span className="eyebrow">RECORDED SOLVES</span><h2>Contribution history</h2><p className="muted">Activity recorded after Phase 4 was enabled. Earlier solved statuses are not backfilled.</p></div><span className="heatmap-total">{metrics.uniqueQuestionsSolved} unique questions solved</span></div>
        <div className="heatmap-grid" role="img" aria-label="Contribution heatmap for the last 365 days. Each square shows qualifying solves in the user's selected timezone.">
          {metrics.heatmap.map(day => <span key={day.date} className={`heatmap-cell heatmap-level-${Math.min(day.solved, 4)}`} title={`${formatDateLabel(day.date)}: ${day.solved} solved`} aria-hidden="true"/>)}
        </div>
        <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`heatmap-cell heatmap-level-${level}`}/>)}<span>More</span></div>
      </section>
      {activityError ? <div className="dashboard-state muted">Activity charts are unavailable until the activity data can be loaded.</div> : metrics.uniqueQuestionsSolved === 0 && <div className="dashboard-note"><Activity size={15}/> No tracked solves yet. Existing Solved statuses are shown in your library totals, but are not treated as historical activity.</div>}

      <div className="dashboard-grid dashboard-bottom-grid">
        <section className="dashboard-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">PRACTICE NEXT</span><h2>Topics to focus on</h2></div></div>
          {metrics.weakTopics.length ? <div className="focus-list">{metrics.weakTopics.map(topic => <div key={topic.name}><span className="topic-tag">{topic.name}</span><span>{topic.needsRevision ? `${topic.needsRevision} need revision` : `${topic.attempted} attempted`}</span><small>{topic.total} total</small></div>)}</div> : <p className="chart-empty">{metrics.topicMetrics.length ? 'No topics are currently marked Attempted or Needs Revision.' : 'Add topics to questions to get practice suggestions.'}</p>}
        </section>
        <section className="dashboard-card">
          <div className="dashboard-card-heading"><div><span className="eyebrow">MILESTONES</span><h2><Trophy size={18}/> Achievements</h2></div></div>
          <div className="achievement-list">{milestones.map(milestone => {
            const earned = metrics.uniqueQuestionsSolved >= milestone
            return <div className={earned ? 'achievement-earned' : ''} key={milestone}><span>{earned ? <CheckCircle2 size={16}/> : <Target size={16}/>}</span><strong>{milestone} unique solves</strong><small>{earned ? 'Earned' : `${Math.max(0, milestone - metrics.uniqueQuestionsSolved)} to go`}</small></div>
          })}</div>
          <p className="achievement-footnote">Milestones are derived from distinct recorded solve events, so refreshes cannot award duplicates.</p>
        </section>
      </div>
    </>}
  </section>
}

function ActivityBars({ days, max }: { days: DashboardMetrics['dailyActivity']; max: number }) {
  return <div className="activity-bars" role="list">
    {days.map(day => <div className="activity-bar-item" role="listitem" key={day.date} title={`${formatDateLabel(day.date)}: ${day.solved} solved`}>
      <div className="activity-bar-track"><span style={{ height: `${day.solved ? Math.max(8, day.solved / max * 100) : 0}%` }}/></div>
      <strong>{day.solved}</strong><small>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en', { timeZone: 'UTC', weekday: 'short' })}</small>
    </div>)}
  </div>
}

function ProfilePage({
  profile, draft, topics, loading, saving, error, timeZones, onChange, onSubmit, onRetry,
}: {
  profile: ProfilePreferences | null
  draft: ProfilePreferences
  topics: string[]
  loading: boolean
  saving: boolean
  error: string
  timeZones: string[]
  onChange: <K extends keyof ProfilePreferences>(key: K, value: ProfilePreferences[K]) => void
  onSubmit: (event: FormEvent) => void
  onRetry: () => void
}) {
  const zones = [...new Set([...timeZones, draft.timezone])].sort((a, b) => a.localeCompare(b))
  const availableTopics = [...new Set([...topics, ...draft.target_topics])].sort((a, b) => a.localeCompare(b))
  return <section className="profile-page">
    <section className="page-heading"><div><div className="eyebrow">YOUR ACCOUNT</div><h1>Profile &amp; settings</h1><p className="muted">Personalize your workspace, timezone, and practice goals.</p></div><div className="dashboard-timezone"><ShieldCheck size={14}/>Private to your account</div></section>
    {error && <div className="error-banner" role="alert"><AlertTriangle size={17}/><div><strong>Profile settings unavailable</strong><p>{error}</p><small>Check your connection and profile owner policy, then retry.</small></div><button className="icon-btn" onClick={onRetry} aria-label="Retry profile loading"><RefreshCw size={16}/></button></div>}
    {loading ? <div className="dashboard-state"><LoaderCircle className="spin" size={23}/> Loading your profile…</div> : <form className="dashboard-card profile-form" onSubmit={onSubmit}>
      <div className="profile-section-heading"><div className="profile-avatar"><UserRound size={22}/></div><div><h2>{draft.display_name || 'Your profile'}</h2><p className="muted">Settings are saved to your existing Supabase profile.</p></div></div>
      <div className="profile-fields">
        <label>Display name<input value={draft.display_name} maxLength={80} onChange={event => onChange('display_name', event.target.value)} placeholder="How should we address you?"/></label>
        <label>Timezone<select value={draft.timezone} onChange={event => onChange('timezone', event.target.value)}>{zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select><small>Used to calculate daily activity, goals, and streak days.</small></label>
        <label>Daily solving goal<input type="number" min={1} max={500} step={1} required value={draft.daily_goal} onChange={event => onChange('daily_goal', Number(event.target.value))}/><small>Whole number from 1 to 500 questions per day.</small></label>
        <label>Weekly solving goal<input type="number" min={1} max={3500} step={1} required value={draft.weekly_goal} onChange={event => onChange('weekly_goal', Number(event.target.value))}/><small>Whole number from 1 to 3500 questions per week.</small></label>
        <label>Preferred difficulty<select value={draft.preferred_difficulty ?? ''} onChange={event => onChange('preferred_difficulty', (event.target.value || null) as ProfilePreferences['preferred_difficulty'])}><option value="">No preference</option><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option></select></label>
      </div>
      <fieldset className="target-topic-fieldset"><legend>Target topics</legend><p className="muted">Choose topics you'd like to focus on. These are stored as preferences and do not change your question data.</p>
        {availableTopics.length ? <div className="target-topic-list">{availableTopics.map(topic => <label key={topic}><input type="checkbox" checked={draft.target_topics.includes(topic)} onChange={event => onChange('target_topics', event.target.checked ? [...new Set([...draft.target_topics, topic])] : draft.target_topics.filter(item => item !== topic))}/><span>{topic}</span></label>)}</div> : <p className="chart-empty">Add topic labels to questions to select target topics.</p>}
      </fieldset>
      <div className="profile-form-footer"><span className="muted">{profile ? 'Your changes are not saved until you select Save preferences.' : 'Profile data has not loaded; saving is disabled.'}</span><button className="btn btn-primary" type="submit" disabled={saving || !profile}>{saving ? <LoaderCircle className="spin" size={16}/> : <Save size={16}/>} Save preferences</button></div>
    </form>}
  </section>
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

function PracticePage({
  items, timeZone, loading, questionError, activityError, recommendationError, reviewHistory,
  onRetry, onReview, onAccept, onDismiss, busyRecommendationId,
}: {
  items: PracticeQueueItem[]
  timeZone: string
  loading: boolean
  questionError: string
  activityError: string
  recommendationError: string
  reviewHistory: ActivityEvent[]
  onRetry: () => void
  onReview: (question: SchedulableQuestion) => void
  onAccept: (recommendation: ExternalSuggestion) => void
  onDismiss: (recommendation: ExternalSuggestion) => void
  busyRecommendationId: string
}) {
  const buckets: Array<{ id: PracticeQueueItem['bucket']; title: string; detail: string }> = [
    { id: 'overdue', title: 'Overdue revisions', detail: 'Review these first.' },
    { id: 'today', title: 'Due today', detail: 'Scheduled for today in your profile timezone.' },
    { id: 'upcoming', title: 'Upcoming revisions', detail: 'Scheduled within the next 7 days.' },
    { id: 'unscheduled', title: 'Unscheduled solved questions', detail: 'Legacy solved questions with no review schedule; no due date has been invented.' },
    { id: 'priority', title: 'Priority questions', detail: 'Priority practice not already listed in a revision queue.' },
    { id: 'weak_topic', title: 'Weak-topic practice', detail: 'Attempted or revision-flagged topics, excluding questions already queued.' },
    { id: 'recommendation', title: 'New external recommendations', detail: 'Pending suggestions not already present in your library.' },
  ]
  const reviewEntries = reviewHistory.map(event => {
    const metadata = event.metadata ?? {}
    return {
      id: event.id,
      title: typeof metadata.question_title === 'string' ? metadata.question_title : 'Question review',
      outcome: typeof metadata.outcome === 'string' ? metadata.outcome : 'Review',
      confidence: typeof metadata.confidence === 'number' ? metadata.confidence : null,
      nextDate: typeof metadata.next_revision_at === 'string' ? metadata.next_revision_at : null,
      occurredAt: event.occurred_at,
    }
  })

  return <section className="practice-page">
    <section className="page-heading"><div><div className="eyebrow">SPACED REVISION</div><h1>Daily practice</h1><p className="muted">A prioritized queue combining scheduled reviews, priority practice, weak topics, and external suggestions.</p></div><button className="btn btn-secondary" onClick={onRetry}><RefreshCw size={15}/> Refresh queue</button></section>
    {(questionError || activityError || recommendationError) && <div className="error-banner" role="alert"><AlertTriangle size={17}/><div><strong>Some practice data is unavailable</strong><p>{questionError || activityError || recommendationError}</p><small>Queue items are based only on successfully loaded records.</small></div><button className="icon-btn" onClick={onRetry} aria-label="Retry practice queue loading"><RefreshCw size={16}/></button></div>}
    {loading ? <div className="dashboard-state"><LoaderCircle className="spin" size={22}/> Loading your practice queue…</div> : <>
      <div className="practice-overview"><span><Timer size={15}/>{items.length} unique queue item{items.length === 1 ? '' : 's'}</span><span>Due dates use {timeZone}.</span></div>
      {buckets.map(bucket => {
        const bucketItems = items.filter(item => item.bucket === bucket.id)
        return <section className="practice-section" key={bucket.id}>
          <div className="practice-section-heading"><div><h2>{bucket.title}</h2><p>{bucket.detail}</p></div><span>{bucketItems.length}</span></div>
          {bucketItems.length === 0 ? <div className="practice-empty">Nothing here right now.</div> : <div className="practice-items">{bucketItems.map(item =>
            item.kind === 'question'
              ? <article className="practice-item" key={`${item.bucket}:${item.question.id}`}>
                  <div className="practice-item-main"><a href={item.question.url} target="_blank" rel="noreferrer">{item.question.title}<ExternalLink size={13}/></a><div className="practice-item-meta">
                    {item.question.topic && <span>{item.question.topic}</span>}
                    <span>{item.question.status}</span>
                    {item.question.priority && <span>{item.question.priority} priority</span>}
                    {item.bucket !== 'unscheduled' && item.question.next_revision_at && <span>Due {formatLocalDueDate(item.question.next_revision_at, timeZone)}</span>}
                  </div></div>
                  <button className="btn btn-primary" onClick={() => onReview(item.question)}><CheckCircle2 size={15}/> Review</button>
                </article>
              : <article className="practice-item" key={`recommendation:${item.recommendation.id}`}>
                  <div className="practice-item-main"><a href={item.recommendation.suggested_url} target="_blank" rel="noreferrer">{item.recommendation.suggested_title}<ExternalLink size={13}/></a><div className="practice-item-meta">
                    <span>{item.recommendation.suggested_source ?? 'External'}</span>
                    {item.recommendation.suggested_topic && <span>{item.recommendation.suggested_topic}</span>}
                    {item.recommendation.suggested_difficulty && <span>{item.recommendation.suggested_difficulty}</span>}
                  </div></div>
                  <div className="practice-item-actions"><button className="btn btn-primary" onClick={() => onAccept(item.recommendation)} disabled={Boolean(busyRecommendationId)}><ThumbsUp size={14}/> Add</button><button className="btn btn-secondary" onClick={() => onDismiss(item.recommendation)} disabled={Boolean(busyRecommendationId)}><ThumbsDown size={14}/> Dismiss</button></div>
                </article>,
          )}</div>}
        </section>
      })}
      <section className="practice-section review-history-section">
        <div className="practice-section-heading"><div><h2>Recent review history</h2><p>Recorded review outcomes and resulting next-review dates.</p></div><span>{reviewEntries.length}</span></div>
        {activityError ? <div className="practice-empty">Review history is unavailable until activity records load.</div> : reviewEntries.length === 0 ? <div className="practice-empty">Your recorded reviews will appear here.</div> : <div className="review-history-list">{reviewEntries.map(entry => <article key={entry.id}>
          <div><strong>{entry.title}</strong><span>{entry.outcome}{entry.confidence ? ` · Confidence ${entry.confidence}/5` : ''}</span></div>
          <small>{new Date(entry.occurredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{entry.nextDate ? ` · Next ${formatLocalDueDate(entry.nextDate, timeZone)}` : ''}</small>
        </article>)}</div>}
      </section>
    </>}
  </section>
}

function ReviewModal({
  question, outcome, confidence, saving, error, onOutcome, onConfidence, onClose, onSubmit,
}: {
  question: Question
  outcome: ReviewOutcome
  confidence: number
  saving: boolean
  error: string
  onOutcome: (outcome: ReviewOutcome) => void
  onConfidence: (confidence: number) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="modal-header"><div><div className="eyebrow">RECORD A REVIEW</div><h2 id="review-title">{question.title}</h2><p className="muted">Reviewing does not change the question's status or its personal notes.</p></div><button className="icon-btn" onClick={onClose} disabled={saving} aria-label="Close review"><X size={19}/></button></div>
      <form className="question-form" onSubmit={onSubmit}>
        {error && <div className="error-banner" role="alert"><AlertTriangle size={16}/><span>{error} Retrying uses the same submission identifier to avoid duplicate history.</span></div>}
        <label className="field-full">Review outcome<select value={outcome} onChange={event => onOutcome(event.target.value as ReviewOutcome)}>{reviewOutcomes.map(value => <option key={value} value={value}>{value}</option>)}</select><small>Again 1 day · Hard ×1.2 · Good ×2.5 · Easy ×3.5 (first Easy: 4 days; maximum 365 days).</small></label>
        <label className="field-full">Confidence after review<select value={confidence} onChange={event => onConfidence(Number(event.target.value))}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} / 5{value === 1 ? ' · Low' : value === 5 ? ' · High' : ''}</option>)}</select></label>
        <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || confidence < 1 || confidence > 5}>{saving ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} Save review</button></div>
      </form>
    </section>
  </div>
}

function priorityRank(q: Question['priority']) { return ({ Critical: 0, High: 1, Medium: 2, Review: 3, Low: 4, '': 5 } as Record<string, number>)[q ?? ''] ?? 6 }
async function hashString(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8)
}
function awaitHashPlaceholder(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-8) || 'imported' }

function Brand() { return <div className="brand"><div className="brand-mark"><Code2 size={20}/></div><div><strong>DSA <span>Workspace</span></strong><small>PERSONAL REVISION HUB</small></div></div> }
function StatCard({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: ReactNode; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value.toLocaleString('en-IN')}</div><div className="stat-detail">{detail}</div></div>
}
function QuestionRow({ question: q, onEdit, onDelete, onStatus, onReview }: { question: Question; onEdit: () => void; onDelete: () => void; onStatus: (status: QuestionStatus) => void; onReview: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  return <tr><td><div className="question-cell"><div className="question-icon"><Code2 size={16}/></div><div className="question-main"><a href={q.url} target="_blank" rel="noreferrer" className="question-title">{q.title}<ExternalLink size={12}/></a><div className="question-meta"><span>{q.source || 'Custom'}</span>{q.is_love_babbar_priority && <span className="priority-mini"><Flame size={11}/> Love Babbar</span>}</div></div></div></td><td><div className="topic-cell">{q.topic ? <span className="topic-tag">{q.topic}</span> : <span className="empty-value">No topic</span>}{q.pattern && <span className="pattern-text">{q.pattern}</span>}</div></td><td><DifficultyBadge difficulty={q.difficulty}/></td><td>{q.priority ? <span className={`priority-badge priority-${q.priority.toLowerCase().replace(' ', '-')}`}>{q.priority}</span> : <span className="empty-value">—</span>}</td><td><div className="status-wrapper"><button className={`status-badge status-${q.status.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setStatusOpen(v => !v)}>{q.status === 'Solved' ? <CheckCircle2 size={13}/> : q.status === 'Needs Revision' ? <Clock3 size={13}/> : <CircleDot size={13}/>} {q.status}<ChevronDown size={12}/></button>{statusOpen && <div className="status-menu">{statusOptions.map(s => <button key={s} onClick={() => {setStatusOpen(false);onStatus(s)}}>{s === q.status && <Check size={13}/>}<span>{s}</span></button>)}</div>}</div></td><td><div className="row-actions"><button className="icon-btn" title="Review question" onClick={onReview}><Timer size={15}/></button><button className="icon-btn" title="Edit question" onClick={onEdit}><Pencil size={15}/></button><div className="more-wrapper"><button className="icon-btn" title="More actions" onClick={() => setMenuOpen(v => !v)}><MoreHorizontal size={17}/></button>{menuOpen && <div className="action-menu"><button onClick={() => {setMenuOpen(false);onReview()}}><Timer size={14}/> Review</button><button onClick={() => {setMenuOpen(false);onEdit()}}><Pencil size={14}/> Edit</button><a href={q.url} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><ArrowUpRight size={14}/> Open link</a><button className="danger-action" onClick={() => {setMenuOpen(false);onDelete()}}><Trash2 size={14}/> Delete</button></div>}</div></div></td></tr>
}
function DifficultyBadge({ difficulty }: { difficulty: Question['difficulty'] }) { return difficulty ? <span className={`difficulty difficulty-${difficulty.toLowerCase()}`}><span/> {difficulty}</span> : <span className="empty-value">—</span> }
function EmptyState({ hasQuestions, onAdd, onReset }: { hasQuestions: boolean; onAdd: () => void; onReset: () => void }) { return <div className="empty-state"><div className="empty-icon"><FolderOpen size={25}/></div><h3>{hasQuestions ? 'No questions match these filters' : 'Your question library starts here'}</h3><p>{hasQuestions ? 'Try another topic or clear the current filters.' : 'Add a question manually or import your validated workbook CSV.'}</p>{hasQuestions ? <button className="btn btn-secondary" onClick={onReset}>Clear filters</button> : <button className="btn btn-primary" onClick={onAdd}><Plus size={16}/> Add first question</button>}</div> }
function SetupScreen() { return <main className="auth-shell"><div className="auth-card setup-card"><Brand/><div className="eyebrow">ONE-TIME SETUP</div><h1>Connect your workspace.</h1><p className="muted">The question manager is ready, but Supabase credentials have not been configured on this machine.</p><ol className="setup-steps"><li><span>1</span><div><strong>Create or open your Supabase project</strong><p>In Project Settings → API, copy the project URL and publishable/anon key.</p></div></li><li><span>2</span><div><strong>Configure environment variables</strong><p>Copy <code>.env.example</code> to <code>.env</code> in the project root and fill in both values.</p></div></li><li><span>3</span><div><strong>Apply the database migration</strong><p>Run <code>supabase/migrations/20261015_phase2_question_manager.sql</code> in the Supabase SQL Editor.</p></div></li><li><span>4</span><div><strong>Create your private account</strong><p>Create your user in Supabase Authentication, then sign in here. Public sign-up is intentionally not exposed in this single-user build.</p></div></li></ol><div className="setup-warning"><ShieldCheck size={17}/><span>Never put a Supabase service-role key in a frontend <code>.env</code>. Only use the publishable/anon key; row-level security protects your data.</span></div></div></main> }
function QuestionModal({ draft, editing, saving, onChange, onClose, onSubmit }: { draft: QuestionDraft; editing: boolean; saving: boolean; onChange: <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => { titleRef.current?.focus() }, [])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className="modal-card"><div className="modal-header"><div><div className="eyebrow">QUESTION LIBRARY</div><h2>{editing ? 'Edit question' : 'Add a question'}</h2><p className="muted">Keep the link and metadata accurate for better filtering later.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close modal"><X size={19}/></button></div><form onSubmit={onSubmit} className="question-form"><label className="field-full">Question title <span className="required">*</span><input ref={titleRef} required value={draft.title} onChange={e => onChange('title', e.target.value)} placeholder="e.g. Longest Substring Without Repeating Characters"/></label><label className="field-full">Question URL <span className="required">*</span><div className="input-with-icon"><Link2 size={16}/><input required type="url" value={draft.url} onChange={e => {onChange('url',e.target.value); if (!editing) onChange('source',inferSource(e.target.value))}} placeholder="https://leetcode.com/problems/..."/></div></label><div className="form-grid"><label>Source<input value={draft.source} onChange={e => onChange('source', e.target.value)} placeholder="LeetCode"/></label><label>Status<select value={draft.status} onChange={e => onChange('status', e.target.value as QuestionStatus)}>{statusOptions.map(s => <option key={s}>{s}</option>)}</select></label><label>Topic<input value={draft.topic} onChange={e => onChange('topic', e.target.value)} placeholder="Arrays, Graphs…"/></label><label>Pattern<input value={draft.pattern} onChange={e => onChange('pattern', e.target.value)} placeholder="Sliding Window…"/></label><label>Difficulty<select value={draft.difficulty} onChange={e => onChange('difficulty', e.target.value as Difficulty)}>{difficultyOptions.map(d => <option key={d} value={d}>{d || 'Unknown'}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={e => onChange('priority', e.target.value as QuestionDraft['priority'])}>{priorityOptions.map(p => <option key={p} value={p}>{p || 'Not set'}</option>)}</select></label><label className="field-full">Source group<input value={draft.source_group} onChange={e => onChange('source_group', e.target.value)} placeholder="e.g. Love Babbar 450, JTG"/></label><label className="field-full">Notes<textarea rows={3} value={draft.notes} onChange={e => onChange('notes', e.target.value)} placeholder="Approach, mistakes, or revision notes…"/></label></div><label className="check-field"><input type="checkbox" checked={draft.is_love_babbar_priority} onChange={e => onChange('is_love_babbar_priority', e.target.checked)}/><span><strong>Love Babbar priority question</strong><small>Show this question in the priority list.</small></span></label><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {editing ? 'Save changes' : 'Add question'}</button></div></form></section></div>
}

export default App
