// Enumerated values from analytics.pos_code_detail_prod and analytics.host_brand_stacks.
// Brief §15 #12, #13, #14 — derived from `npm run discover-enums` 2026-05-08.
//
// Discover-enums overwrites the *_RAW arrays with the live distinct values.
// The exported lists below are AM-curated subsets layered on top — kept manual
// so the filter UI stays focused. Re-running discover-enums won't clobber them.

import type { PlatformName } from '@/lib/bq/keys';

export const PLATFORMS: PlatformName[] = ['DELIVEROO', 'UBER', 'JUSTEAT'];

// host_status — full live list captured 2026-05-08:
//   Churn · Churn - Never Launched · Closing · Core Estate · Failed ·
//   Paused · Trial Period · Waiting to Go Live
// AM-curated subset surfaced as filter chips:
export const HOST_STATUSES = [
  'Core Estate',
  'Trial Period',
  'Paused',
  'Churn',
] as const;
export type HostStatus = (typeof HOST_STATUSES)[number];

// Canonical strings used in code that compares against PartnerOpsRow.hostStatus.
// Keep these centralised so a future rename in HubSpot only changes one place.
export const HOST_STATUS_PAUSED = 'Paused' as const;
export const HOST_STATUS_CORE_ESTATE = 'Core Estate' as const;
export const HOST_STATUS_TRIAL_PERIOD = 'Trial Period' as const;
export const HOST_STATUS_CHURN = 'Churn' as const;

// partner_type — full live list captured 2026-05-08:
//   Duet + POS · Duet only · Icon · QSR · Solo Serve
// 'Duet only' is normalised to 'Delivery' in lib/bq/queries/granularOps.ts
// (per Brief §5.2). AM-set May 2026: filter restricted to the two AMs care
// about — QSR and Delivery. Other raw values still flow through data rows
// but aren't exposed as filter buttons.
export const PARTNER_TYPES = ['Delivery', 'QSR'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

// brand_stack — full live list captured 2026-05-08:
//   KAR · OTHER · RUD · SBB · SMA
// Stored as 3-letter codes in the column. Filter values use the codes (so
// `brandStack=SBB` matches `brand_stack` directly with substring); display
// labels are mapped to friendly names via BRAND_STACK_LABELS.
export const BRAND_STACKS: readonly string[] = ['SBB', 'RUD', 'SMA'];
export const BRAND_STACK_LABELS: Record<string, string> = {
  SBB: 'SoBe',
  RUD: "Rudi's",
  SMA: 'Smashed',
  KAR: 'Karaage',
  OTHER: 'Other',
};

// Normalisation helper from §5.2.
export function normalisePartnerType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === 'Duet only') return 'Delivery';
  return raw;
}
