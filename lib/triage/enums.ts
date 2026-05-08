// Enumerated values from analytics.pos_code_detail_prod and analytics.host_brand_stacks.
// Brief §15 #12, #13, #14 — full lists are derived day-1 by `npm run discover-enums`.
// Until the script runs against the live dataset, the lists below carry the
// values explicitly named in the brief plus the working defaults flagged in §5.2.
//
// When discover-enums.ts runs, it overwrites the three arrays below in place
// (preserving the surrounding comments).

import type { PlatformName } from '@/lib/bq/keys';

export const PLATFORMS: PlatformName[] = ['DELIVEROO', 'UBER', 'JUSTEAT'];

// host_status — brief §15 #12 (full list still [OPEN] until discover-enums runs).
// Seeded from §7.3 (core_estate, trial_period) and §7.5 (paused) plus the
// implicit churned terminal value referenced throughout §5.2.
export const HOST_STATUSES = [
  'core_estate',
  'trial_period',
  'paused',
  'churned',
] as const;
export type HostStatus = (typeof HOST_STATUSES)[number];

// partner_type — brief §15 #13 + §5.2 normalisation note ('Duet only' → 'Delivery').
// AM-set May 2026: filter restricted to QSR + Delivery only. Other raw values
// in the column ('Multi-site', 'Independent', etc.) still flow through to data
// rows but aren't exposed as filter buttons.
export const PARTNER_TYPES = ['Delivery', 'QSR'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

// brand_stack — brief §15 #14. Filter buttons match brand_stack via
// case-insensitive substring (so 'SoBe + Rudi's' counts as both SoBe and Rudis).
export const BRAND_STACKS: string[] = ['SoBe', "Rudi's", 'Smashed'];

// Normalisation helper from §5.2.
export function normalisePartnerType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === 'Duet only') return 'Delivery';
  return raw;
}
