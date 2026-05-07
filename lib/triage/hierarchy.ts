// Triage hierarchy mapping. Plan Hierarchy Mapping section.
// Brief §1 (5-tier hierarchy: System bugs → Customer harm "will" → "skill" →
// Growth blockers → Behaviour). One partner, one active issue.
//
// This file is DATA, not logic — auditable and editable without touching the
// active-issue selector in activeIssue.ts.

import type { IssueKind } from '@/components/primitives/IssuePill';

export type Tier = 1 | 2 | 3 | 4 | 5;

export type IssueCode =
  // Tier 1 — system bugs
  | 'data_quality_compliance_empty'
  | 'data_quality_ops_stale'
  // Tier 2 — customer harm "will"
  | 'open_rate_breach'
  | 'inactive_offboarding_band'
  | 'compliance_non_compliant'
  // Tier 3 — customer harm "skill"
  | 'missing_items_breach'
  | 'rider_wait_breach'
  | 'reject_rate_breach'
  | 'rating_below_target'
  | 'prep_time_outlier'
  // Tier 4 — growth blockers
  | 'ad_spend_shortfall'
  | 'discount_misaligned'
  | 'aov_decline'
  | 'conversion_decline'
  // Tier 5 — behaviour
  | 'menu_inactive'
  | 'menu_views_low';

export type SeveritySource = 'service_pack' | 'partner_agreement' | 'sessions_internal';

export interface IssueDef {
  code: IssueCode;
  tier: Tier;
  kind: IssueKind;
  label: string;
  source: SeveritySource;
  /** Reference back to the contractual / brief source so an AM can cite the agreement on a call. */
  sourceRef: string;
}

// @source Brief §1 + plan Hierarchy Mapping table.
export const ISSUE_CATALOGUE: Record<IssueCode, IssueDef> = {
  data_quality_compliance_empty: {
    code: 'data_quality_compliance_empty',
    tier: 1,
    kind: 'platform',
    label: 'Data flag — empty compliance list',
    source: 'sessions_internal',
    sourceRef: 'Brief §7.6 edge case',
  },
  data_quality_ops_stale: {
    code: 'data_quality_ops_stale',
    tier: 1,
    kind: 'platform',
    label: 'Data flag — ops feed stale > 24h',
    source: 'sessions_internal',
    sourceRef: 'Brief §11 failure modes',
  },
  open_rate_breach: {
    code: 'open_rate_breach',
    tier: 2,
    kind: 'compliance',
    label: 'Open Rate breach',
    source: 'partner_agreement',
    sourceRef: 'Partner Agreement §2.2 / §18 — Sessions Benchmarks ≥ 95%',
  },
  inactive_offboarding_band: {
    code: 'inactive_offboarding_band',
    tier: 2,
    kind: 'compliance',
    label: 'Inactive — Deliveroo offboarding window',
    source: 'service_pack',
    sourceRef: 'Service Pack 2025 — Host Site Termination',
  },
  compliance_non_compliant: {
    code: 'compliance_non_compliant',
    tier: 2,
    kind: 'compliance',
    label: 'Non-compliant (current month)',
    source: 'sessions_internal',
    sourceRef: 'serve.prod_venues_sessions_score_stg.overall_compliant',
  },
  missing_items_breach: {
    code: 'missing_items_breach',
    tier: 3,
    kind: 'operations',
    label: 'Missing items above target',
    source: 'service_pack',
    sourceRef: 'Service Pack 2025 — > 4% / 3 months → offboarding',
  },
  rider_wait_breach: {
    code: 'rider_wait_breach',
    tier: 3,
    kind: 'operations',
    label: 'Rider wait > 5 min above benchmark',
    source: 'service_pack',
    sourceRef: 'Service Pack §9.1.3 / Host Site Termination — > 13% / 3m → offboarding',
  },
  reject_rate_breach: {
    code: 'reject_rate_breach',
    tier: 3,
    kind: 'operations',
    label: 'Reject rate above limit',
    source: 'service_pack',
    sourceRef: 'Service Pack §9.1.1 — < 1% expected',
  },
  rating_below_target: {
    code: 'rating_below_target',
    tier: 3,
    kind: 'operations',
    label: 'Rating below target',
    source: 'sessions_internal',
    sourceRef: 'Sessions internal target ≥ 4.4*',
  },
  prep_time_outlier: {
    code: 'prep_time_outlier',
    tier: 3,
    kind: 'operations',
    label: 'Prep time outlier',
    source: 'sessions_internal',
    sourceRef: 'Sessions internal target — see thresholds.ts',
  },
  ad_spend_shortfall: {
    code: 'ad_spend_shortfall',
    tier: 4,
    kind: 'commercial',
    label: 'Ad spend below plan',
    source: 'sessions_internal',
    sourceRef: 'Sessions ads team plan',
  },
  discount_misaligned: {
    code: 'discount_misaligned',
    tier: 4,
    kind: 'commercial',
    label: 'Discount mix off-pattern',
    source: 'sessions_internal',
    sourceRef: 'Partner Agreement §16 + Sessions playbook',
  },
  aov_decline: {
    code: 'aov_decline',
    tier: 4,
    kind: 'commercial',
    label: 'AOV declining',
    source: 'sessions_internal',
    sourceRef: 'Service Pack — Headline Commission banded on AOV',
  },
  conversion_decline: {
    code: 'conversion_decline',
    tier: 4,
    kind: 'commercial',
    label: 'Conversion rate declining',
    source: 'sessions_internal',
    sourceRef: 'Brief §6 metric 13',
  },
  menu_inactive: {
    code: 'menu_inactive',
    tier: 5,
    kind: 'behaviour',
    label: 'Menu inactive',
    source: 'sessions_internal',
    sourceRef: 'Brief §7 Tab 4 — 7+ day threshold',
  },
  menu_views_low: {
    code: 'menu_views_low',
    tier: 5,
    kind: 'behaviour',
    label: 'Menu views low vs peers',
    source: 'sessions_internal',
    sourceRef: 'Brief §6 metric 14',
  },
};

const SOURCE_PRIORITY: Record<SeveritySource, number> = {
  // Lower number = wins the within-tier tiebreak.
  service_pack: 0,
  partner_agreement: 1,
  sessions_internal: 2,
};

export function compareIssueSeverity(a: IssueCode, b: IssueCode): number {
  const ai = ISSUE_CATALOGUE[a];
  const bi = ISSUE_CATALOGUE[b];
  if (ai.tier !== bi.tier) return ai.tier - bi.tier;
  return SOURCE_PRIORITY[ai.source] - SOURCE_PRIORITY[bi.source];
}
