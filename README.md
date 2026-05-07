# Sessions Triage v4

Internal AM triage tool. Live BigQuery + Postgres-backed annotations + Google
Workspace SSO. Brief: `../Sessions Triage v4 — Build Brief.md`. Architecture
overview in §4 of the brief; pipeline in §13.

## First-time setup

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL` — Neon Postgres connection string (annotations).
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — read-only service-account JSON, base64-encoded. When unset, every BQ-backed page falls back to fixtures (see `lib/bq/use.ts`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth client. When unset, `auth.ts` falls back to a dev-only Credentials provider that accepts any `@sessions.co.uk` email. **Do not deploy without the Google client.**
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`.

Then:

```bash
npm install
psql "$DATABASE_URL" -f db/schema.sql   # one-off, idempotent
npm run dev
```

Open `http://localhost:3000` — middleware redirects to sign-in; once signed in, the app lands on `/queue`.

## Scripts

- `npm run dev` — Next.js dev server.
- `npm run build` / `npm start` — production build + serve.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` / `npm run test:watch` — vitest.
- `npm run test:e2e` — Playwright happy-path (requires dev server running on `:3000`).
- `npm run discover-enums` — pulls DISTINCT values for `hubspot_host_status`, `host_partner_bucket`, `brand_stack` and rewrites `lib/triage/enums.ts`. Requires live BQ creds.

## Layout

- `app/` — App Router; one folder per tab (§4).
- `lib/bq/` — BigQuery client, query builders, fixtures, cache wrappers.
- `lib/triage/` — hierarchy, thresholds, active-issue selector. Numbers come from `thresholds.ts`; sources cited via `// @source` comments per brief §3 conventions.
- `lib/offboarding-risk/` — Service Pack risk-band scoring.
- `lib/annotations/` — server actions; backed by `db/schema.sql` table.
- `components/primitives/` — `IssuePill`, `MetricChip`, `SparkLine`, `Tag`, `TagModal`, design tokens.
- `components/layout/` — `Shell`, `TabNav`, `GlobalFilterBar`, `DetailPanel`, `ReloadButton`.
- `tests/` — vitest units; `tests/e2e/` Playwright.

## Live vs. fixture data

`lib/bq/use.ts` returns fixture rows when `GOOGLE_APPLICATION_CREDENTIALS_JSON` is unset. Every tab renders an amber banner in fixture mode so it's visually obvious. Production deploys must have the credential blob — there's no silent fallback in CI/CD checklist; see `.env.example`.

## Open dependencies

Tracked in brief §15. The ones that block production:

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` (data team) — until granted, every tab is fixture-only.
- `GOOGLE_CLIENT_ID` / `_SECRET` (Sessions GCP) — without these the dev Credentials provider is wired and **insecure** for prod.
- Refurbishment-flag HubSpot field name — `lib/bq/queries/offboardingSignals.ts` and `app/inactive-core/page.tsx` default it to false; one-line edit once confirmed.
- Peak-window discrepancy (`17–21` vs `17:00–20:59`) — both windows are in `thresholds.ts`; flip in `scoring.ts` once Jack picks.
