// Active-issue selector. Brief §1 "one partner, one active issue".
// Drives queue ordering: lowest tier wins, then within-tier by source priority
// (service_pack > partner_agreement > sessions_internal). 28d GMV is the final
// tiebreaker, applied at the queue-sort layer in app/queue/page.tsx, not here.

import {
  ISSUE_CATALOGUE,
  type IssueCode,
  compareIssueSeverity,
} from './hierarchy';
import {
  INACTIVE_PARTNER_THRESHOLD_DAYS,
  MISSING_ITEMS_INTERNAL_TARGET,
  OPEN_RATE_BENCHMARK,
  RATING_TARGET,
  RIDER_WAIT_BENCHMARK,
} from './thresholds';
import { HOST_STATUS_PAUSED } from './enums';

export interface PartnerSignals {
  /** AVG bad_avg_open_rate over trailing 7d. Null when no orders. */
  openRate7d: number | null;
  /** Days since last delivered order. Null = never ordered. */
  daysSinceLastOrder: number | null;
  /** SAFE_DIVIDE missing-items / orders, trailing 7d. */
  missingItemsPct7d: number | null;
  /** SAFE_DIVIDE rider-wait>5min / orders, ROO only, trailing 7d. */
  riderWait5minPct7d: number | null;
  /** Avg rating, trailing 28d. */
  rating28d: number | null;
  /** Most recent compliance row's overall_compliant flag. Null = no scored month yet. */
  overallCompliant: boolean | null;
  /** True when overall_compliant=false but both food & packaging item lists are empty (data-quality flag). */
  hasEmptyComplianceLists: boolean;
  /** True when delivery_core_ops's most recent row for this partner is > 24h stale. */
  opsStale: boolean;
  /** HubSpot host status mirrored into BigQuery (e.g. 'paused', 'core_estate'). */
  hostStatus: string | null;
  /** Days until pause window ends. Negative = overdue. Null = no paused_until set or not paused. */
  daysUntilResume: number | null;
  /** Count of menus belonging to this partner that are inactive ≥ INACTIVE_MENU_THRESHOLD_DAYS days. */
  inactiveMenuCount: number;
}

export function detectIssues(signals: PartnerSignals): IssueCode[] {
  const issues: IssueCode[] = [];

  // Tier 1 — platform / data-quality
  if (signals.overallCompliant === false && signals.hasEmptyComplianceLists) {
    issues.push('data_quality_compliance_empty');
  }
  if (signals.opsStale) {
    issues.push('data_quality_ops_stale');
  }

  // Tier 2 — paused. All paused partners enter the queue; row sort handles ordering by daysUntilResume.
  if (signals.hostStatus === HOST_STATUS_PAUSED) {
    if (signals.daysUntilResume !== null && signals.daysUntilResume < 0) {
      issues.push('paused_overdue');
    } else {
      issues.push('paused_in_window');
    }
  }

  // Tier 3 — inactive partner (≥ 2 days, all platforms)
  if (
    signals.daysSinceLastOrder !== null &&
    signals.daysSinceLastOrder >= INACTIVE_PARTNER_THRESHOLD_DAYS
  ) {
    issues.push('inactive_partner');
  }

  // Tier 4 — partner has at least one inactive menu (≥ 7 days)
  if (signals.inactiveMenuCount > 0) {
    issues.push('inactive_menus');
  }

  // Tier 5 — non-compliant
  if (signals.overallCompliant === false && !signals.hasEmptyComplianceLists) {
    issues.push('compliance_non_compliant');
  }

  // Tier 6 — missing items
  if (signals.missingItemsPct7d !== null && signals.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET) {
    issues.push('missing_items_breach');
  }

  // Tier 7 — rating
  if (signals.rating28d !== null && signals.rating28d < RATING_TARGET) {
    issues.push('rating_below_target');
  }

  // Tier 8 — open rate
  if (signals.openRate7d !== null && signals.openRate7d < OPEN_RATE_BENCHMARK) {
    issues.push('open_rate_breach');
  }

  // Tier 9 — rider wait > 5 min
  if (signals.riderWait5minPct7d !== null && signals.riderWait5minPct7d > RIDER_WAIT_BENCHMARK) {
    issues.push('rider_wait_breach');
  }

  return issues;
}

export function selectActiveIssue(issues: IssueCode[]): IssueCode | null {
  if (issues.length === 0) return null;
  return [...issues].sort(compareIssueSeverity)[0]!;
}

export function activeIssueLabel(code: IssueCode): string {
  return ISSUE_CATALOGUE[code].label;
}
