# Phase 3 — External Question Recommendations

## Implemented
- Recommendations are sourced from an expandable external-question catalogue, not from rows already in `questions`.
- The default source is a bundled, curated LeetCode catalogue snapshot. It is not live search and uses no undocumented API or platform scraping.
- An optional credential-free JSON catalogue endpoint can be configured with `VITE_EXTERNAL_QUESTION_CATALOG_URL`. Network errors, HTTP errors/rate limits, timeouts and invalid payloads fall back to the built-in catalogue with a user-visible notice.
- Personalization considers question topics, patterns, difficulty and all library statuses. Every status is checked when excluding already-owned questions.
- Recommendations are deduplicated by canonical URL and platform question ID; filters are available for topic, difficulty and platform.
- Each card shows title, platform, topic, algorithm pattern, difficulty, original link, match reason, Add to Unsolved and Dismiss actions.
- The additive external-recommendations migration adds persisted external IDs and `accept_external_recommendation`. The owner-scoped transaction checks existing URLs/IDs, creates the question and Unsolved progress atomically, and makes repeated accepts idempotent. Dismiss only updates its recommendation record.
- Existing AI metadata classification remains an optional server-side integration. No API or service-role key is exposed in browser code.

## Database setup
Apply the Phase 2 migration first, then:
1. `supabase/migrations/20261015_phase3_recommendations.sql`
2. `supabase/migrations/20261015_phase3z_external_recommendations.sql`

The new migration is additive and does not delete or rewrite question data. Existing Phase 3 library-to-library recommendation records are not shown as external recommendations.

## External data source and limitations
The built-in catalogue is hand-curated static metadata and direct LeetCode problem links in `src/externalQuestionCatalogue.ts`. It is intentionally labeled as a snapshot, not live discovery; coverage is finite and may become stale as public problem metadata changes. The default catalogue supports LeetCode only. I did not verify a documented, permitted unauthenticated LeetCode API or a clearly licensed public problem dataset; the official LeetCode terms page returned HTTP 403 to the research request, and a GitHub repository search for licensed problem metadata returned no results. To avoid undocumented APIs, unlicensed datasets and scraping, no live LeetCode API is used. To add more questions/platforms, extend the catalogue with reliable public metadata or configure a public JSON catalogue endpoint you control.

## Verification
`npm run build` passed (Vite reports a bundle-size warning: minified JS is about 521 kB, above its 500 kB threshold). Focused checks passed for canonical URL normalization, platform-ID and all-status library exclusion, duplicate candidate removal, personalization/reasoning, combined filters, configured catalogue loading, and HTTP 429/503/invalid-response fallbacks. Static migration assertions passed for authenticated ownership checks, advisory duplicate locks, Unsolved progress insertion and additive-only schema changes. A live Supabase database was not configured in this workspace, so the migration/RPC, persistent accept/dismiss flows and refreshed question counts could not be integration-tested here.

## Manual Supabase acceptance checks
1. Apply both Phase 3 migrations; confirm the external identity index and `accept_external_recommendation` RPC are present.
2. Generate recommendations from a library with topic/pattern metadata; confirm external titles/links and no existing question appears.
3. Test a URL variant (query/trailing slash/LeetCode description path) and platform slug already in the library; confirm it is excluded.
4. Filter by topic, difficulty and platform.
5. Add one recommendation; confirm one new question row with original URL and metadata and one `Unsolved` progress row. Repeat the accept request; confirm no duplicate row.
6. Dismiss another; confirm its recommendation decision persists and no library row is deleted or changed.
7. Configure an unavailable or rate-limited catalogue endpoint; confirm a visible fallback notice and usable built-in recommendations.
