# Combined Phase 2 + Phase 3 project

This package contains the Phase 3 source snapshot, including Phase 2 functionality and the Phase 3 recommendations migration.

## Setup
1. Extract this ZIP.
2. Preserve your existing local `.env` separately; `.env` is intentionally NOT included for security.
3. If you already have Supabase credentials configured, create `.env` from `.env.example` and copy your values locally.
4. Run `npm install`, `npm run build`, then `npm run dev`.
5. Apply `supabase/migrations/20261015_phase3_recommendations.sql`, then `supabase/migrations/20261015_phase3z_external_recommendations.sql` in the Supabase SQL Editor before using Recommendations. The Phase 2 migration should already have been applied; do not re-run unless needed.

## Important
- Do not upload `.env` or secret/service-role keys.
- Recommendations use a curated built-in LeetCode catalogue snapshot by default, not live platform search. See `README.md` for the optional public catalogue endpoint format and fallback behavior.
- The project package is not proof of a successful local build or live Supabase test; follow the app's test report.
- `node_modules/` and `dist/` are intentionally excluded. Install dependencies and build locally.
