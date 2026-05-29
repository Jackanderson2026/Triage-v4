// Canonical list of queue tier-bucket keys. Mirrored from the queue page's
// TIER_BUCKETS — shared here so the admin UI can show the same set when
// configuring per-exec visibility.

import type { IssueCode } from '@/lib/triage/hierarchy';

export interface QueueTierBucket {
  key: string;
  label: string;
  codes: IssueCode[];
}

export const QUEUE_TIER_BUCKETS: QueueTierBucket[] = [
  { key: 'platform', label: 'Platform', codes: ['data_quality_compliance_empty'] },
  { key: 'paused', label: 'Paused', codes: ['paused_overdue', 'paused_in_window'] },
  { key: 'inactive', label: 'Inactive', codes: ['inactive_partner'] },
  { key: 'non-compliant', label: 'Non-Compliant', codes: ['compliance_non_compliant'] },
  { key: 'missing-items', label: 'Missing Items', codes: ['missing_items_breach'] },
  { key: 'rating', label: 'Rating', codes: ['rating_below_target'] },
  { key: 'open-rate', label: 'Open Rate', codes: ['open_rate_breach'] },
  { key: 'rider-wait', label: 'Rider Wait', codes: ['rider_wait_breach'] },
];

export const QUEUE_TIER_KEYS = QUEUE_TIER_BUCKETS.map((b) => b.key);
