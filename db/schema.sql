-- Annotations table — Brief §5.3 option A.
-- Single table; AMs share state across sessions. Soft-delete via cleared_at,
-- never hard-delete (audit trail).
--
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS annotations (
  id              BIGSERIAL PRIMARY KEY,
  partner_id      TEXT        NOT NULL,
  annotation_type TEXT        NOT NULL CHECK (annotation_type IN ('actioned', 'known_issue', 'churned', 'paused')),
  note            TEXT,
  actor           TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at      TIMESTAMPTZ
);

-- Lookup pattern from lib/annotations/index.ts:listActiveAnnotations —
-- WHERE partner_id = ANY($1) AND cleared_at IS NULL ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS annotations_active_lookup_idx
  ON annotations (partner_id, created_at DESC)
  WHERE cleared_at IS NULL;

-- "What did Sarah action this week" / audit queries.
CREATE INDEX IF NOT EXISTS annotations_actor_idx
  ON annotations (actor, created_at DESC);

-- partner_id is LEFT(pos_code, 7). 7-char invariant enforced in
-- lib/annotations/index.ts:createAnnotation; the CHECK below is a belt-and-braces
-- guard for direct INSERTs.
ALTER TABLE annotations
  DROP CONSTRAINT IF EXISTS annotations_partner_id_length_check;
ALTER TABLE annotations
  ADD CONSTRAINT annotations_partner_id_length_check
  CHECK (char_length(partner_id) = 7);

-- ──────────────────────────────────────────────────────────────────────────
-- Ops-exec assignment model (May 2026). Drives the in-scope / out-of-scope /
-- actioned split on the triage tabs. Configured via the /admin tab.
-- ──────────────────────────────────────────────────────────────────────────

-- One row per ops exec. email matches the Google SSO session email.
CREATE TABLE IF NOT EXISTS ops_execs (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  role       TEXT        NOT NULL DEFAULT 'ops_exec',
  hidden_queue_tiers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotent migrations for existing DBs.
ALTER TABLE ops_execs ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'ops_exec';
ALTER TABLE ops_execs ADD COLUMN IF NOT EXISTS hidden_queue_tiers TEXT[] NOT NULL DEFAULT '{}';

-- Allocation rules: a partner is assigned to an exec if it matches every
-- non-null field on any of that exec's rules (AND within a rule; OR across
-- rules). NULL = wildcard ("any partner type" / "any brand").
CREATE TABLE IF NOT EXISTS allocation_rules (
  id           BIGSERIAL PRIMARY KEY,
  ops_exec_id  BIGINT      NOT NULL REFERENCES ops_execs(id) ON DELETE CASCADE,
  partner_type TEXT,                 -- e.g. 'QSR' / 'Delivery' / NULL = any
  brand_stack  TEXT,                 -- e.g. 'SBB' / 'RUD' / NULL = any
  partner_id   TEXT,                 -- LEFT(pos_code,7) — pins one specific partner; overrides type/brand
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A rule with both fields null would assign everything; allow it but make it
  -- explicit (an exec who owns the whole estate).
  CHECK (partner_type IS NOT NULL OR brand_stack IS NOT NULL OR TRUE)
);

-- Added May 2026 — specific-partner assignment. Idempotent for existing DBs.
ALTER TABLE allocation_rules ADD COLUMN IF NOT EXISTS partner_id TEXT;

CREATE INDEX IF NOT EXISTS allocation_rules_exec_idx ON allocation_rules (ops_exec_id);

-- Per-exec, per-tab cap on how many partners are "in scope" for the week.
-- tab is the route key, e.g. 'queue'. One row per (exec, tab).
CREATE TABLE IF NOT EXISTS scope_limits (
  id           BIGSERIAL PRIMARY KEY,
  ops_exec_id  BIGINT      NOT NULL REFERENCES ops_execs(id) ON DELETE CASCADE,
  tab          TEXT        NOT NULL,
  max_partners INTEGER     NOT NULL CHECK (max_partners >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ops_exec_id, tab)
);
