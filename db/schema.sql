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
