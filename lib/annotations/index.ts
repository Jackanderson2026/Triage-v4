'use server';

import { revalidateTag } from 'next/cache';
import { auth } from '@/auth';
import { sql } from '@/lib/db/client';
import { ACTIONED_SNOOZE_HOURS } from '@/lib/triage/thresholds';

export type AnnotationType = 'actioned' | 'known_issue' | 'churned' | 'paused';

export interface Annotation {
  id: number;
  partnerId: string;
  annotationType: AnnotationType;
  note: string | null;
  actor: string;
  createdAt: string;
  clearedAt: string | null;
}

interface AnnotationRow {
  id: number;
  partner_id: string;
  annotation_type: AnnotationType;
  note: string | null;
  actor: string;
  created_at: string;
  cleared_at: string | null;
}

const ANNOTATION_TAG = 'annotations';

function annotationsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    partnerId: row.partner_id,
    annotationType: row.annotation_type,
    note: row.note,
    actor: row.actor,
    createdAt: row.created_at,
    clearedAt: row.cleared_at,
  };
}

async function requireSessionEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new Error('Not authenticated');
  return email;
}

export async function listActiveAnnotations(partnerIds: string[]): Promise<Map<string, Annotation>> {
  if (partnerIds.length === 0) return new Map();
  // No DATABASE_URL → preview / E2E mode without Postgres. Pages render as if no
  // partner has an active annotation. Writes still throw — they require a DB.
  if (!annotationsEnabled()) return new Map();
  // Compute the snooze cut-off in JS so it can be passed as a real bind param.
  // Don't try to interpolate inside a SQL string literal — Neon's tagged template
  // parameterises every ${…} and Postgres won't bind inside quotes.
  const actionedCutoff = new Date(Date.now() - ACTIONED_SNOOZE_HOURS * 3600 * 1000).toISOString();
  const rows = (await sql`
    SELECT DISTINCT ON (partner_id)
      id, partner_id, annotation_type, note, actor, created_at, cleared_at
    FROM annotations
    WHERE partner_id = ANY(${partnerIds}::text[])
      AND cleared_at IS NULL
      AND (annotation_type <> 'actioned' OR created_at > ${actionedCutoff}::timestamptz)
    ORDER BY partner_id, created_at DESC
  `) as unknown as AnnotationRow[];
  const map = new Map<string, Annotation>();
  for (const row of rows) map.set(row.partner_id, rowToAnnotation(row));
  return map;
}

export async function createAnnotation(
  partnerId: string,
  annotationType: AnnotationType,
  note: string | null,
): Promise<Annotation> {
  if (!annotationsEnabled()) {
    throw new Error('Annotations require DATABASE_URL. Set it in .env.local before writing.');
  }
  const actor = await requireSessionEmail();
  if (partnerId.length !== 7) {
    throw new Error(`partnerId must be 7 chars (LEFT(pos_code,7)); got ${partnerId.length}`);
  }
  const trimmedNote = note?.trim() || null;
  const rows = (await sql`
    INSERT INTO annotations (partner_id, annotation_type, note, actor)
    VALUES (${partnerId}, ${annotationType}, ${trimmedNote}, ${actor})
    RETURNING id, partner_id, annotation_type, note, actor, created_at, cleared_at
  `) as unknown as AnnotationRow[];
  revalidateTag(ANNOTATION_TAG);
  if (!rows[0]) throw new Error('Insert returned no row');
  return rowToAnnotation(rows[0]);
}

export async function clearAnnotation(annotationId: number): Promise<void> {
  await requireSessionEmail();
  await sql`UPDATE annotations SET cleared_at = NOW() WHERE id = ${annotationId} AND cleared_at IS NULL`;
  revalidateTag(ANNOTATION_TAG);
}
