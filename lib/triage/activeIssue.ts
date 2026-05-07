// Active-issue selector. Brief §1 "one partner, one active issue".
// Replaces v3's categorise() with a hierarchy-table-driven implementation.
//
// Inputs are partner-grain metrics; outputs are the firing IssueCodes plus the
// single active issue (lowest tier wins, with within-tier tiebreak by source
// priority service_pack > partner_agreement > sessions_internal). 28d GMV is the
// final tiebreaker, applied at the queue-sort layer in app/queue/page.tsx, not
// here.

import {
  ISSUE_CATALOGUE,
  type IssueCode,
  compareIssueSeverity,
} from './hierarchy';
import {
  INACTIVE_BANDS_DAYS,
  MISSING_ITEMS_INTERNAL_TARGET,
  OPEN_RATE_BENCHMARK,
  RATING_TARGET,
  REJECT_RATE_LIMIT,
  RIDER_WAIT_BENCHMARK,
} from './thresholds';

export interface PartnerSignals {
  /** AVG bad_avg_open_rate over trailing 7d. Null when no orders. */
  openRate7d: number | null;
  /** Days since last delivered order. Null = never ordered. */
  daysSinceLastOrder: number | null;
  /** SAFE_DIVIDE missing-items / orders, trailing 7d. */
  missingItemsPct7d: number | null;
  /** SAFE_DIVIDE rider-wait>5min / orders, ROO only, trailing 7d. */
  riderWait5minPct7d: number | null;
  /** SAFE_DIVIDE rejected / (rejected + accepted), trailing 7d. */
  rejectedRate7d: number | null;
  /** Avg rating, trailing 28d. */
  rating28d: number | null;
  /** Most recent compliance row's overall_compliant flag. Null = no scored month yet. */
  overallCompliant: boolean | null;
  /** True when overall_compliant=false but both food & packaging item lists are empty (data-quality flag). */
  hasEmptyComplianceLists: boolean;
  /** True when delivery_core_ops's most recent row for this partner is > 24h stale. */
  opsStale: boolean;
  /** True when the partner is on Deliveroo. Inactive offboarding only fires for ROO partners. */
  isOnDeliveroo: boolean;
}

export function detectIssues(signals: PartnerSignals): IssueCode[] {
  const issues: IssueCode[] = [];

  // Tier 1
  if (signals.overallCompliant === false && signals.hasEmptyComplianceLists) {
    issues.push('data_quality_compliance_empty');
  }
  if (signals.opsStale) {
    issues.push('data_quality_ops_stale');
  }

  // Tier 2
  if (signals.openRate7d !== null && signals.openRate7d < OPEN_RATE_BENCHMARK) {
    issues.push('open_rate_breach');
  }
  if (
    signals.isOnDeliveroo &&
    signals.daysSinceLastOrder !== null &&
    signals.daysSinceLastOrder >= INACTIVE_BANDS_DAYS.amber
  ) {
    issues.push('inactive_offboarding_band');
  }
  if (signals.overallCompliant === false && !signals.hasEmptyComplianceLists) {
    issues.push('compliance_non_compliant');
  }

  // Tier 3
  if (signals.missingItemsPct7d !== null && signals.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET) {
    issues.push('missing_items_breach');
  }
  if (signals.riderWait5minPct7d !== null && signals.riderWait5minPct7d > RIDER_WAIT_BENCHMARK) {
    issues.push('rider_wait_breach');
  }
  if (signals.rejectedRate7d !== null && signals.rejectedRate7d > REJECT_RATE_LIMIT) {
    issues.push('reject_rate_breach');
  }
  if (signals.rating28d !== null && signals.rating28d < RATING_TARGET) {
    issues.push('rating_below_target');
  }

  return issues;
}

export function selectActiveIssue(issues: IssueCode[]): IssueCode | null {
  if (issues.length === 0) return null;
  return [...issues].sort(compareIssueSeverity)[0];
}

export function activeIssueLabel(code: IssueCode): string {
  return ISSUE_CATALOGUE[code].label;
}
