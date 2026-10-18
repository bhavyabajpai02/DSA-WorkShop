# DSA Workspace — Question Manager and External Recommendations

A React + TypeScript question manager with Supabase authentication and PostgreSQL persistence. The workspace includes question management, external recommendations, a progress dashboard, and profile preferences.

**Live app:** [Open the deployed application](https://dsa-work-shop-r3j7-1veiqm2uv-bhavyabajpai02s-projects.vercel.app/)

## Features implemented

- Supabase email/password sign-in (single-user workspace; no public sign-up UI).
- Private question list with live counts for all, solved, unsolved and priority-pending.
- Add/edit/delete questions.
- Status updates: Unsolved, Attempted, Solved, Needs Revision.
- Search across title, URL, topic, pattern, source and notes.
- Filters for topic, difficulty and Love Babbar priority.
- Sorting by recently updated, title, difficulty, priority and status.
- CSV import and export; import uses the Phase 1 `questions_import.csv` columns and is also tolerant of the original workbook column names.
- Responsive dark interface, keyboard-friendly forms and reduced-motion support.
- Supabase row-level security policies for profile, questions and progress.
- Dashboard totals from current question records; charts, heatmap, goals, streaks and milestones from explicitly recorded activity.
- Profile preferences for display name, timezone, daily/weekly goals, preferred difficulty and target topics.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project
- An Auth user created in the Supabase dashboard

## Setup

1. Open the Supabase SQL Editor and run `supabase/migrations/20261015_phase2_question_manager.sql`.
2. In Supabase Authentication, create your user (email/password). Public sign-up is not exposed by this app.
3. Copy `.env.example` to `.env` and set:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Sign in with the account created in Supabase.
6. Choose **Import CSV** and select `data/questions_import.csv` from this project to import your existing 81 canonical questions. Review the import results before relying on the counts.

## Security notes

- Never use the Supabase service-role key in browser environment variables.
- The SQL migration enables row-level security and scopes reads/writes to `auth.uid() = owner_id`.
- This repository does not contain credentials and does not connect to a live database until `.env` is configured.

## Phase 2 verification checklist

- [ ] SQL migration applies successfully in Supabase.
- [ ] Login succeeds for the created Auth user.
- [ ] Import `data/questions_import.csv` and verify 81 questions (46 solved, 35 unsolved).
- [ ] Add a question and refresh; it persists.
- [ ] Edit title/topic/priority and verify persistence.
- [ ] Change status and verify counts update.
- [ ] Search and filters narrow the table correctly.
- [ ] Duplicate URL import updates the existing question instead of creating a duplicate.
- [ ] Export CSV and confirm title, URL and status columns are present.
- [ ] Delete a test question and verify it disappears.
- [ ] Confirm a second unauthorised user cannot read the first user's data.

## Validation status

The production build and focused recommendation-engine checks pass in this workspace. A live Supabase project was not configured, so database migrations, authenticated accept/dismiss persistence and browser-level CRUD/import/export flows still require verification against your own project. Never provide or commit service-role credentials for this verification.

## Phase 3 — Recommendations
1. Apply `supabase/migrations/20261015_phase3_recommendations.sql` in Supabase SQL Editor after the Phase 2 migration.
2. Apply `supabase/migrations/20261015_phase3z_external_recommendations.sql` after the original Phase 3 migration. This adds external recommendation identity and an authenticated, transactional accept operation; it does not delete or rewrite existing questions.
3. Restart the Vite dev server and open **Recommendations** in the sidebar.
4. Click **Find external questions**. Recommendations are selected from `src/externalQuestionCatalogue.ts`, then matched against all question statuses by topic, pattern and difficulty. The bundled LeetCode catalogue is a curated snapshot, not live search; its external links open the original problem pages.
5. The list can be filtered by topic, difficulty and platform. Candidates already in your library are excluded by normalized URL and platform question ID.
6. **Add to Unsolved** inserts the external question with its original URL/metadata and new Unsolved progress. **Dismiss** only records a dismissed recommendation decision.

### Optional catalogue endpoint
Set `VITE_EXTERNAL_QUESTION_CATALOG_URL` to a public JSON catalogue endpoint that you control. It accepts either a JSON array or `{ "questions": [...] }`, with records containing `id`, `title`, `url`, `platform`, `topic`, `pattern`, and `difficulty`. Keep it public and credential-free; a catalogue endpoint is not treated as live platform search. HTTP errors (including rate limits), invalid responses and timeouts are reported, and the curated built-in catalogue is used as a fallback. Add new built-in entries in `src/externalQuestionCatalogue.ts`.

Optional question metadata classification remains available through `VITE_AI_CLASSIFICATION_ENDPOINT`; point it only to your own secure server-side endpoint. Never expose provider API keys in frontend `VITE_` variables.

See `PHASE3_TEST_REPORT.md` for current verification status and acceptance tests.

## Phase 4 — Dashboard, Profile and Analytics

1. Apply `supabase/migrations/20261016_phase4_dashboard_analytics.sql` after both Phase 3 migrations. It extends profile preferences and the activity schema, enables owner-only activity reads, and adds the authenticated `record_question_status` RPC.
2. Reload the app and open **Dashboard** for current question status totals, timezone-aware goals, recorded solve activity, streaks, a contribution heatmap, topic/difficulty breakdowns, weak topics and milestones.
3. Open **Profile & settings** to save your name, timezone, goals, preferred difficulty and target topics to your existing Supabase profile.

Activity events are created for explicit status transitions and accepted external recommendations. Re-selecting the current status does not create another event. Statuses already present in the library and statuses imported by CSV are not converted into historical activity; the dashboard labels activity as recorded after Phase 4 tracking was enabled. Solve activity is deduplicated by question within each local calendar day, and streaks use the profile timezone. Changing the timezone changes the local-day grouping of event timestamps.

The Phase 4 migration is additive and does not delete questions or replace existing activity rows. It extends the earlier `activity_events` shape from the Phase 1 schema reference when present. The activity table is readable only by its owner; writes for tracked transitions and accepted external recommendations are handled by database functions/triggers.

## Phase 5 — Smart Revision Engine

1. Apply `supabase/migrations/20261016_phase5_revision_engine.sql` after the Phase 4 migration. It adds the current interval to `question_progress`, an idempotency key to `activity_events`, and the authenticated `record_question_review` RPC. It does not assign schedules to existing questions or modify their statuses/notes.
2. Open **Daily practice** for Overdue, Due today, Upcoming (within seven local calendar days), Unscheduled solved questions, Priority questions, Weak-topic practice, and pending external recommendations. A question appears once; recommendations are excluded when their URL or platform identity is already in the library.
3. Select **Review** to record Again, Hard, Good, or Easy plus confidence (1–5). A successful review increments attempts and updates confidence, `last_attempt_at`, `review_interval_days`, and `next_revision_at`, without changing status or question notes. The submission identifier is retained for retries, so a retried request does not create another event.

### Review intervals

Intervals are whole local calendar days: **Again** resets to 1 day; **Hard** uses `max(1, round(previous × 1.2))`; **Good** starts at 1 day and then uses `round(previous × 2.5)`; **Easy** starts at 4 days and then uses `round(previous × 3.5)`. Intervals are capped at 365 days. The due time is local midnight in the saved profile timezone, converted to a timestamp with timezone/DST rules. A missing/invalid timezone falls back to Asia/Kolkata. Existing solved questions without a due date remain unscheduled until reviewed; no historical activity is invented.

The Phase 5 migration is additive and keeps review history in the existing `activity_events` table; outcomes, confidence, interval and resulting due timestamp are stored in its metadata. Use `npm test` for deterministic interval, timezone, queue, deduplication and migration idempotency checks. These tests do not replace a live Supabase/RLS integration test.
