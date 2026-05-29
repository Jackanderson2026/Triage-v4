# Sessions Triage v4 — Handover

**Audience:** the next Claude session (or a new dev) picking this up.

**Read this first.** Then dip into the brief / CLAUDE.md only when you need detail
on a specific subsystem.

---

## What this is

An internal Next.js 14 app used by Sessions account managers (AMs) to triage their
partner estate. Replaces a patchwork of Looker dashboards + CSV exports + Notion
docs with one live BigQuery-powered view that ranks "what to action now" by a
9-tier triage hierarchy. Live preview on Vercel; production domain not yet cut over.

- **Source brief:** `../Sessions Triage v4 — Build Brief.md` (one level up from this folder)
- **Org operating rules:** `../CLAUDE.md` — plan-mode-first workflow, brand voice, EM checklist
- **GitHub:** https://github.com/Jackanderson2026/Triage-v4 (private)
- **Vercel preview:** https://triage-v4.vercel.app (Google SSO restricted to `@sessions.co.uk`)

---

## Local-dev quickstart

```bash
cd "C:/Users/jack/OneDrive/Documents/Claude/Projects/New Triage/sessions-triage-v4"
npm run dev      # → http://localhost:3000
```

**OneDrive gotcha:** OneDrive's file sync locks `.next/*.json` mid-write during
hot reloads, producing `ENOENT: middleware-manifest.json` errors. **Pause OneDrive
sync (taskbar icon → Pause syncing → 2 hours) before starting dev.** A junction
approach was tried and abandoned — it breaks Node's `node_modules` resolution.

**Env vars (`.env.local`):** Mirrors the Vercel env. `GOOGLE_APPLICATION_CREDENTIALS`
points to the gcloud ADC file at
`C:/Users/jack/AppData/Roaming/gcloud/application_default_credentials.json`.
Re-auth with `gcloud auth application-default login` when the token expires
(~60 min).

---

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js 14, App Router, TS strict | All pages are server components except a handful of clients (PartnerCard, AdminClient, AnnotationButton, GlobalFilterBar, ReloadButton). |
| Hosting | Vercel Pro | 60s serverless ceiling — fine for current BQ queries. |
| Auth | NextAuth v5 (beta) + Google OAuth | `@sessions.co.uk` hd-restricted. Dev fallback Credentials provider exists if `GOOGLE_CLIENT_ID` is missing — **latent risk** (see Open dependencies). |
| Styling | Inline `style` props, design tokens in `components/primitives/tokens.ts` | No Tailwind, no UI library. Brand: black/white/grape `#8517b5`, Farmacia display, ABCDiatype body. |
| Data — BigQuery | `@google-cloud/bigquery`, region `europe-west2` | Project `sessions-core-data`. Service account: `triage-bq-reader@sessions-core-data.iam`. |
| Data — Postgres | Neon serverless | Annotations + ops-exec config. Schema in `db/schema.sql`. |
| AI | Anthropic SDK (`@anthropic-ai/sdk`), Claude Haiku 4.5 | Powers the "AI summary" bullets inside an expanded partner card. Server action only — no client exposure of the key. |
| Tests | vitest (27 passing), Playwright (2 e2e) | `npm test`, `npm run test:e2e`. |

---

## Repo layout

```
app/
  layout.tsx, loading.tsx, page.tsx   — root shell + skeleton + redirect to /queue
  queue/                              — Triage Queue (the main worklist, 3-section split)
  top-partners/                       — Portfolio overview, ranked by avg weekly GMV (4w)
  offboarding-risk/                   — Menu-grain Deliveroo offboarding signals
  inactive-menus/                     — Menus scheduled to be open but not taking orders
  rejected-orders/                    — Sites with rejected orders > 0
  ad-spend/                           — Partners with ad spend in last 28d
  admin/                              — Ops-exec allocation config
  api/auth/[...nextauth]/             — NextAuth handlers

components/
  layout/                             — Shell, TabNav, SubTabNav, Pager, PartnerCard,
                                        ComplianceBlock, FeedFreshnessIndicator,
                                        DetailPanel, GlobalFilterBar, ReloadButton,
                                        AnnotationButton, actions.ts (revalidate tags)
  primitives/                         — MetricChip, SparkLine, IssuePill, Tag, TagModal,
                                        tokens.ts (design tokens)
  tables/                             — PartnerTable (used by the report tabs)
  admin/                              — AdminClient (per-exec editing UI)

lib/
  bq/
    client.ts                         — BigQuery client + runQuery (auto-normalises
                                        BigQueryDate wrappers — see Gotchas)
    keys.ts                           — pos_code helpers (partnerId = LEFT 7,
                                        menuId = LEFT 10, platform = RIGHT 3)
    cache.ts                          — TAB_TAGS + cachedQuery (unstable_cache wrap)
    use.ts                            — Live-or-fixture switch (getPartnerOps etc.)
    queries/                          — One per BQ aggregate (granularOps,
                                        compliance, sparklines, brandOps,
                                        brandPlatformOps, platformOps, menuOps,
                                        menuOffboardingSignals, offboardingSignals,
                                        feedFreshness)
    fixtures/                         — Matching fixture data for each query
  triage/
    hierarchy.ts                      — IssueCode catalogue + tier ordering
    activeIssue.ts                    — detectIssues + selectActiveIssue
    thresholds.ts                     — Every threshold value with @source citation
    scope.ts                          — computeScope (queue) + buildAssignedPartnerIds
    signals.ts                        — daysUntilResume + buildInactiveMenuCounts
    tabCounts.ts                      — Tab-badge count computation
    compliance.ts                     — buildComplianceByPartner
    rejectedOrders.ts                 — buildRejectedOrders helper
    enums.ts                          — Live BQ enum values (host_status etc.)
    globalFilters.ts                  — extractGlobalParams (which params survive
                                        tab navigation)
    queueTiers.ts                     — QUEUE_TIER_BUCKETS (shared by /queue + admin)
  offboarding-risk/scoring.ts         — RiskBand logic (legacy partner-grain, still
                                        used as scoreSite by older tests; menu-grain
                                        is the live path)
  admin/opsExecs.ts                   — CRUD + scope-config server actions
  annotations/index.ts                — Annotation read/write server actions
  ai/summary.ts                       — Anthropic SDK call for partner-card AI bullets
  db/client.ts                        — Neon serverless `sql` template-literal client

db/schema.sql                         — Postgres schema (annotations, ops_execs,
                                        allocation_rules, scope_limits)

scripts/discover-enums.ts             — Pulls DISTINCT values from BQ into enums.ts.
                                        Re-run after adding/changing partner types
                                        or brand codes.

tests/                                — vitest unit tests + tests/e2e/ Playwright
```

---

## Key conventions

### pos_code structure (universal join key)
- `LEFT(pos_code, 7)` → **partner_id** (host/venue)
- `LEFT(pos_code, 10)` → **menu_id** (partner + brand)
- `RIGHT(pos_code, 3)` → **platform code** (`ROO` / `UBR` / `JET`)
- Helpers in `lib/bq/keys.ts` — never use `LEFT(pos_code, …)` directly elsewhere

### Real BQ enum values (don't assume snake_case)
Captured from live `sessions-core-data` 2026-05-08:

- `hubspot_host_status`: `Core Estate`, `Trial Period`, `Paused`, `Churn`,
  `Closing`, `Failed`, `Waiting to Go Live`, `Churn - Never Launched`
- `host_partner_bucket`: `Duet only` (normalised to `Delivery`), `Duet + POS`,
  `Icon`, `QSR`, `Solo Serve`
- `brand_stack`: 3-letter codes — `SBB` (SoBe), `RUD` (Rudi's), `SMA` (Smashed),
  `KAR` (Karaage), `OTHER`

Filter chip values use the **codes**; display labels go through `BRAND_STACK_LABELS`
in `lib/triage/enums.ts`.

### Triage hierarchy (May 2026 ordering)
Lower tier = more urgent. One partner, one active issue (`selectActiveIssue`).

1. Platform / data quality
2. Paused (overdue or in-window)
3. Inactive partner (≥ 2 days)
4. *(was Inactive Menus — moved to its own top-level tab)*
5. Non-compliant
6. Missing items (> 2%)
7. Rating (< 4.2)
8. Open rate (< 98%, Sessions internal — stricter than contractual 95%)
9. Rider wait > 5 min (> 7% benchmark)

Within tier: `service_pack > partner_agreement > sessions_internal`.
Then 28d GMV desc as final tiebreak.

### Time zone + week boundaries
All date filters use `Europe/London`. Week starts Monday (`WEEK(MONDAY)`).
"Avg weekly GMV over 4 complete weeks" excludes the current partial week.

### CTE-aggregate-then-join (avoid fan-out)
When joining `delivery_core_ops` to `ppc_daily_pos_code` /
`platform_offer_daily_pos_code_view` / `daily_reports_report_five_production_view`,
**aggregate each side in its own CTE before joining**. Joining then SUMming
fan-outs by the number of order rows in each window. Pattern repeated in
`granularOps.ts`, `brandOps.ts`, etc.

### BigQuery date/timestamp normalisation
`runQuery` in `lib/bq/client.ts` walks every row and unwraps class instances
(`BigQueryDate { value: '...' }`) to their `.value` strings. **Don't add new
queries that bypass `runQuery`** — React production rejects non-plain objects
crossing server→client.

### Empty-array params
`runQuery` auto-tags empty `params` arrays as `STRING` (BQ refuses untyped
empty arrays). If you add an array param of a different type, update the
helper.

---

## What's live (every tab)

### Triage Queue (`/queue`)
- 9-tier hierarchy, one row per partner, ranked by active issue tier
- **Sub-tab chips** at the top filter by tier — All / Platform / Paused /
  Inactive / Non-Compliant / Missing Items / Rating / Open Rate / Rider Wait /
  Clean. Per-exec hidden tiers (set in Admin) drop their chips here.
- **3-section split** per logged-in exec:
  - **In scope for the week** — assigned partners (via allocation rules),
    capped at the exec's scope limit, priority-ranked
  - **Out of scope for the week** — collapsed `<details>` by default, click
    to expand. Greyed (opacity 0.55), still actionable.
  - **Actioned this week** — partners with any annotation since Monday
- Each card expands inline → AI summary bullets, compliance block, metric
  chips, brand sub-rows (with per-platform breakdown inside each brand),
  per-partner platform tiles, quick links.
- "↗ also in Roo Offboarding Risk" badge on the tile when the partner has
  ≥1 menu firing an offboarding trigger.

### Top Partners (`/top-partners`)
- Every partner (within the logged-in exec's allocation), ranked by **avg
  weekly GMV over the prior 4 complete weeks**
- Same PartnerCard as Queue (expandable). `headlineGmv="avgWeekly4w"`.
- Sub-tabs: All / SoBe / Rudi's / Smashed (matches `brand_stack` substring)
- Paginated (Pager, 50/page).

### Roo Offboarding Risk (`/offboarding-risk`)
- **Menu-grain** (one row per brand × platform × site, not per partner)
- Per-platform summary cards at the top
- Cells coloured by Service Pack severity bands (amber/red/critical)
- "Xmo above amber" line under each cell shows how many consecutive months
  the menu has been above that band (monthly resolution; the contractual
  windows are 3-month)
- Filter chips: Inactive / Missing items / Rider wait
- Badge format: `9 partners · 12 menus` (dropped the C/R/A codes per request)

### Inactive Menus (`/inactive-menus`)
- Menus that have been **scheduled to be open** (`scheduledMinutes7d > 1`)
  **but haven't taken an order** in 7+ days
- Discontinued menus filtered out via
  `production.restaurants_live_operations_status.is_active` (Squid Game,
  Yardbirds etc. don't appear)
- Blue banner above the table explains the filter rule

### Rejected Orders (`/rejected-orders`)
- Sites with rejected count > 0 over trailing 7d
- Service Pack §9.1.1 threshold: `> 1%` reject rate gets an amber flag

### Ad Spend (`/ad-spend`)
- Partners with ad spend > 0 in last 28d
- Sortable: 7d / 28d / MTD / Spend ÷ GMV ratio

### Admin (`/admin`)
- **Per ops exec:**
  - Name + `@sessions.co.uk` email (used as SSO matcher)
  - Role: `Ops exec` (default) or `Trainer` (label only — no behavioural
    diff yet)
  - Allocation rules: any combination of partner type / brand / specific
    partner ID (datalist picker by name). Multiple rules = OR.
  - Queue sub-tab visibility checkboxes (per exec)
  - Max in-scope partners per tab (currently just Queue)
- No admin role-gating — any signed-in `@sessions.co.uk` user can edit.

### Header indicator
- `● Live · Xh` pill (top-right of every tab) shows global ETL freshness.
  Goes amber after 36h, red after 72h. Shows "App error" with the exception
  message in the tooltip if the BQ query fails (so we can tell our bugs
  from real outages).

---

## Open dependencies / known gaps

| # | Item | Status |
|---|---|---|
| 1 | **Nucleus zone-utilisation tab** | Deferred. The user provided Looker SQL but we agreed to skip until later. Cross-references `core-agatha.model_outputs.battleships_model_reporting_view` which isn't in `sessions-core-data` and may need separate auth. |
| 2 | **Refurbishment HubSpot field** | `REFURBISHMENT_HUBSPOT_FIELD` placeholder in code; the offboarding-risk + queue logic assumes `refurbishment = false` for every partner. One-line change once Jack confirms the HubSpot column name. |
| 3 | **Peak-window discrepancy** | Sessions Looker uses `hour BETWEEN 17 AND 21`; Service Pack says `17:00–20:59`. Both windows are defined as constants in `lib/triage/thresholds.ts`. Sessions's window is the current default. |
| 4 | **Dev-credentials auth fallback** | If `GOOGLE_CLIENT_ID` ever goes missing on Vercel, auth silently falls back to a password-less dev provider. Latent risk. Recommend hardening to throw on startup when prod creds absent. |
| 5 | **Admin role gating** | Any signed-in user can edit `/admin`. Should be restricted to an allow-list. |
| 6 | **Trainer role behaviour** | The label exists; behaviour is currently identical to Ops Exec. Define what "trainer" actually means before relying on it. |
| 7 | **AM owner field** | Doesn't exist in BQ schema. Listed as out-of-scope for v4 in the brief. The ops-exec allocation model substitutes for it. |
| 8 | **Vercel preview is fixture-or-live depending on creds** | The Vercel env has the service account JSON set, so it's live. Confirm by checking the header pill says "Live" not "App error". |

---

## How a fresh chat should pick this up

1. **Read this file** (you're here).
2. **Skim `../Sessions Triage v4 — Build Brief.md`** — full context on data model
   and triage philosophy.
3. **Skim `../CLAUDE.md`** — Sessions operating rules (plan mode → EM review →
   tests → preview → deploy).
4. **Run `npm run dev`** to confirm local dev still boots. If OneDrive throws
   ENOENT on `.next/middleware-manifest.json`, pause OneDrive sync first.
5. **Don't ship without typecheck + tests:** `npm run typecheck && npm test`.
6. **Pushing to `main` auto-deploys to Vercel.** Run a local
   `DATABASE_URL=stub NEXTAUTH_SECRET=stub npm run build` first if you've
   changed anything ESLint-sensitive — Vercel's lint step has caught
   unused-import and similar bugs in this session.

---

## Recent commit highlights (most → least recent)

- `a33ef77` Per-platform breakdown inside each brand + admin role / queue-tier visibility
- `8909434` Persist global filters across tabs · Roo Offboarding Risk · Inactive Menus schedule filter
- `0905c8b` Offboarding-risk badge: show menus AND affected partners
- `673f664` A: collapse out-of-scope on Queue · B: paginate the 5 report tabs
- `5e6bffc` Add app-wide loading skeleton
- `3766338` Scope all tabs to allocation, cross-tab offboarding flag, specific-partner assignment
- `30dc681` Ops-exec scope model: Admin tab + in/out/actioned sections on the Queue
- `a7dc4cf` Exclude inactive menus using restaurants_live_operations_status
- `3792a5c` Tab + data restructure: Inactive Menus back, Top Partners expandable, Offboarding by menu
- `4f3601b` Filters: chip buttons + Status filter + restrict Partner type + Smashed stack
- `ef8e18b` Fix BQ region + align hardcoded enum values to live data
- `89cec10` Auto-tag empty array params as STRING for BigQuery
- `3b20563` Normalise BigQuery date/timestamp wrappers in runQuery
- `52e3e8b` Drop /inactive-core, /inactive-menus, /paused, /non-compliant tabs (then later restored Inactive Menus)
- `eae817e` Rework triage hierarchy to AM-set 9-tier list

Full log: `git log --oneline` (~30 commits this session).

---

## Conversations to expect

- **"Add a new tab for X"** — pattern is: new BQ query + fixture + `use.ts`
  wiring + a page in `app/X/` + add to `TabNav.TABS` + add to `TAB_TAGS` +
  allowed-tags in `actions.ts` + (if filterable) `extractGlobalParams`
  propagation.
- **"Pages feel slow"** — see the pagination discussion in chat history.
  Options A (collapse out-of-scope) and B (page-based pagination on report
  tabs) are done. C (server-side pagination — push LIMIT/OFFSET into BQ)
  and D (virtualisation) are documented but not built.
- **"Add a metric"** — extend the relevant query SQL + types + fixture +
  surface as a MetricChip in PartnerCard / a column in the table.

---

*Last updated: 2026-05-29. Maintained by Claude across multiple sessions.*
