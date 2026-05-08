// Triage hierarchy. Brief §1 (one partner, one active issue) + AM-set ordering
// from May 2026. The 9-tier list below is the source of truth for queue ordering.
//
// 1. Platform issues          — system bugs (data quality)
// 2. Paused                   — every paused partner enters the queue; sort by
//                               daysUntilResume so overdues surface first
// 3. Inactive partner         — ≥ 2 days since last order
// 4. Inactive menus           — partner has ≥ 1 menu inactive 7+ days
// 5. Non-compliant            — overall_compliant = false
// 6. Missing items            — > 2% over trailing 7d
// 7. Average rating           — < 4.2 over trailing 28d
// 8. Open rate                — < 98% over trailing 7d (Sessions internal)
// 9. Rider wait > 5 min       — > 7% over trailing 7d (ROO)
//
// Issue codes for things NOT in the queue (reject rate, AOV, conversion, ad
// spend, discount, menu views, prep time) stay defined here so PartnerDetail
// and MetricChips can still reference them by code, but `detectIssues()` no
// longer fires them as triage issues.

import type { IssueKind } from '@/components/primitives/IssuePill';

export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type IssueCode =
  // Tier 1 — platform / data-quality
  | 'data_quality_compliance_empty'
  | 'data_quality_ops_stale'
  // Tier 2 — paused
  | 'paused_overdue'
  | 'paused_in_window'
  // Tier 3 — inactive partner (broad, all platforms)
  | 'inactive_partner'
  // Tier 4 — inactive menus
  | 'inactive_menus'
  // Tier 5 — compliance
  | 'compliance_non_compliant'
  // Tier 6 — missing items
  | 'missing_items_breach'
  // Tier 7 — rating
  | 'rating_below_target'
  // Tier 8 — open rate
  | 'open_rate_breach'
  // Tier 9 — rider wait
  | 'rider_wait_breach'
  // Not surfaced in the queue (kept here for MetricChip / detail labels).
  | 'reject_rate_breach'
  | 'prep_time_outlier'
  | 'aov_decline'
  | 'conversion_decline'
  | 'ad_spend_shortfall'
  | 'discount_misaligned'
  | 'menu_views_low'
  // Deliveroo-specific offboarding band (still used by /offboarding-risk).
  | 'inactive_offboarding_band';

export type SeveritySource = 'service_pack' | 'partner_agreement' | 'sessions_internal';

export interface IssueDef {
  code: IssueCode;
  /** null = not surfaced in the queue (won't be picked as active issue). */
  tier: Tier | null;
  kind: IssueKind;
  label: string;
  source: SeveritySource;
  sourceRef: string;
}

// @source Brief §1 + AM hierarchy May 2026.
export const ISSUE_CATALOGUE: Record<IssueCode, IssueDef> = {
  // ── Tier 1 ──
  data_quality_compliance_empty: {
    code: 'data_quality_compliance_empty',
    tier: 1, kind: 'platform',
    label: 'Data flag — empty compliance list',
    source: 'sessions_internal',
    sourceRef: 'Brief §7.6 edge case',
  },
  data_quality_ops_stale: {
    code: 'data_quality_ops_stale',
    tier: 1, kind: 'platform',
    label: 'Data flag — ops feed stale > 24h',
    source: 'sessions_internal',
    sourceRef: 'Brief §11 failure modes',
  },
  // ── Tier 2 ──
  paused_overdue: {
    code: 'paused_overdue',
    tier: 2, kind: 'compliance',
    label: 'Paused — overdue to return',
    source: 'sessions_internal',
    sourceRef: 'pos_code_detail_prod.date_company_paused_until < today',
  },
  paused_in_window: {
    code: 'paused_in_window',
    tier: 2, kind: 'compliance',
    label: 'Paused',
    source: 'sessions_internal',
    sourceRef: 'pos_code_detail_prod.hubspot_host_status = paused',
  },
  // ── Tier 3 ──
  inactive_partner: {
    code: 'inactive_partner',
    tier: 3, kind: 'compliance',
    label: 'Inactive ≥ 2 days',
    source: 'sessions_internal',
    sourceRef: 'AM hierarchy May 2026',
  },
  // ── Tier 4 ──
  inactive_menus: {
    code: 'inactive_menus',
    tier: 4, kind: 'behaviour',
    label: 'Has inactive menu(s)',
    source: 'sessions_internal',
    sourceRef: 'menu_ops aggregate — ≥ 1 menu inactive 7d+',
  },
  // ── Tier 5 ──
  compliance_non_compliant: {
    code: 'compliance_non_compliant',
    tier: 5, kind: 'compliance',
    label: 'Non-compliant (current month)',
    source: 'sessions_internal',
    sourceRef: 'serve.prod_venues_sessions_score_stg.overall_compliant',
  },
  // ── Tier 6 ──
  missing_items_breach: {
    code: 'missing_items_breach',
    tier: 6, kind: 'operations',
    label: 'Missing items above target',
    source: 'service_pack',
    sourceRef: 'Service Pack 2025 — > 4% / 3 months → offboarding (Sessions target 2%)',
  },
  // ── Tier 7 ──
  rating_below_target: {
    code: 'rating_below_target',
    tier: 7, kind: 'operations',
    label: 'Rating below target',
    source: 'sessions_internal',
    sourceRef: 'Sessions internal target ≥ 4.2*',
  },
  // ── Tier 8 ──
  open_rate_breach: {
    code: 'open_rate_breach',
    tier: 8, kind: 'compliance',
    label: 'Open Rate below 98%',
    source: 'sessions_internal',
    sourceRef: 'Sessions internal — stricter than the 95% Partner Agreement floor',
  },
  // ── Tier 9 ──
  rider_wait_breach: {
    code: 'rider_wait_breach',
    tier: 9, kind: 'operations',
    label: 'Rider wait > 5 min above benchmark',
    source: 'service_pack',
    sourceRef: 'Service Pack §9.1.3 / Host Site Termination — > 13% / 3m → offboarding',
  },

  // ── Not in queue (tier: null) — kept for MetricChip + detail labels ──
  reject_rate_breach: {
    code: 'reject_rate_breach',
    tier: null, kind: 'operations',
    label: 'Reject rate above limit',
    source: 'service_pack',
    sourceRef: 'Service Pack §9.1.1 — < 1% expected. Surfaced in /rejected-orders, not the queue.',
  },
  prep_time_outlier: {
    code: 'prep_time_outlier',
    tier: null, kind: 'operations',
    label: 'Prep time outlier',
    source: 'sessions_internal',
    sourceRef: 'Sessions internal target — visible on detail card only.',
  },
  aov_decline: {
    code: 'aov_decline',
    tier: null, kind: 'commercial',
    label: 'AOV declining',
    source: 'sessions_internal',
    sourceRef: 'Detail card only — not a queue trigger.',
  },
  conversion_decline: {
    code: 'conversion_decline',
    tier: null, kind: 'commercial',
    label: 'Conversion rate declining',
    source: 'sessions_internal',
    sourceRef: 'Detail card only — not a queue trigger.',
  },
  ad_spend_shortfall: {
    code: 'ad_spend_shortfall',
    tier: null, kind: 'commercial',
    label: 'Ad spend below plan',
    source: 'sessions_internal',
    sourceRef: 'Detail card only — not a queue trigger.',
  },
  discount_misaligned: {
    code: 'discount_misaligned',
    tier: null, kind: 'commercial',
    label: 'Discount mix off-pattern',
    source: 'sessions_internal',
    sourceRef: 'Detail card only — not a queue trigger.',
  },
  menu_views_low: {
    code: 'menu_views_low',
    tier: null, kind: 'behaviour',
    label: 'Menu views low vs peers',
    source: 'sessions_internal',
    sourceRef: 'Detail card only — not a queue trigger.',
  },
  inactive_offboarding_band: {
    code: 'inactive_offboarding_band',
    tier: null, kind: 'compliance',
    label: 'Inactive — Deliveroo offboarding window',
    source: 'service_pack',
    sourceRef: 'Service Pack 2025 — Host Site Termination. Surfaced on /offboarding-risk.',
  },
};

const SOURCE_PRIORITY: Record<SeveritySource, number> = {
  service_pack: 0,
  partner_agreement: 1,
  sessions_internal: 2,
};

export function compareIssueSeverity(a: IssueCode, b: IssueCode): number {
  const ai = ISSUE_CATALOGUE[a];
  const bi = ISSUE_CATALOGUE[b];
  // Issues with tier=null sort to the bottom.
  const at = ai.tier ?? 99;
  const bt = bi.tier ?? 99;
  if (at !== bt) return at - bt;
  return SOURCE_PRIORITY[ai.source] - SOURCE_PRIORITY[bi.source];
}

/** Issue codes that participate in the queue (tier !== null). */
export const QUEUEABLE_ISSUES: IssueCode[] = Object.values(ISSUE_CATALOGUE)
  .filter((d) => d.tier !== null)
  .map((d) => d.code);
