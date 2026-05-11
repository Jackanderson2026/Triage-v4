import { describe, expect, it } from 'vitest';
import { detectIssues, selectActiveIssue, type PartnerSignals } from '@/lib/triage/activeIssue';

const baseline: PartnerSignals = {
  openRate7d: 0.99,
  daysSinceLastOrder: 1,
  missingItemsPct7d: 0.005,
  riderWait5minPct7d: 0.04,
  rating28d: 4.7,
  overallCompliant: true,
  hasEmptyComplianceLists: false,
  opsStale: false,
  hostStatus: 'Core Estate',
  daysUntilResume: null,
  inactiveMenuCount: 0,
};

describe('hierarchy active-issue selection', () => {
  it('open rate 96% with low missing items + good rating → open_rate_breach (Tier 8)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: 0.96, // < 0.98 internal target
    };
    const issues = detectIssues(signals);
    expect(issues).toContain('open_rate_breach');
    expect(selectActiveIssue(issues)).toBe('open_rate_breach');
  });

  it('lowest tier wins: paused_in_window (T2) beats missing_items_breach (T6)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      hostStatus: 'Paused',
      daysUntilResume: 10,
      missingItemsPct7d: 0.05,
    };
    expect(selectActiveIssue(detectIssues(signals))).toBe('paused_in_window');
  });

  it('paused with negative daysUntilResume → paused_overdue, still T2', () => {
    const signals: PartnerSignals = {
      ...baseline,
      hostStatus: 'Paused',
      daysUntilResume: -5,
    };
    const active = selectActiveIssue(detectIssues(signals));
    expect(active).toBe('paused_overdue');
  });

  it('inactive ≥ 2 days fires Tier 3 inactive_partner regardless of platform', () => {
    const signals: PartnerSignals = {
      ...baseline,
      daysSinceLastOrder: 3,
    };
    expect(detectIssues(signals)).toContain('inactive_partner');
  });

  it('inactive 1 day does NOT fire Tier 3 (threshold is ≥ 2)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      daysSinceLastOrder: 1,
    };
    expect(detectIssues(signals)).not.toContain('inactive_partner');
  });

  it('inactive_menus is NOT surfaced in the queue (moved to /inactive-menus tab May 2026)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      inactiveMenuCount: 5,
    };
    expect(detectIssues(signals)).not.toContain('inactive_menus');
  });

  it('clean partner — no issues', () => {
    expect(detectIssues(baseline)).toEqual([]);
    expect(selectActiveIssue([])).toBeNull();
  });

  it('null signals do not fire their thresholds', () => {
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: null,
      missingItemsPct7d: null,
      riderWait5minPct7d: null,
      rating28d: null,
      daysSinceLastOrder: null,
    };
    expect(detectIssues(signals)).toEqual([]);
  });

  it('overall_compliant=false with empty item lists is a Tier-1 data-quality flag (not Tier-5 compliance)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      overallCompliant: false,
      hasEmptyComplianceLists: true,
    };
    const issues = detectIssues(signals);
    expect(issues).toContain('data_quality_compliance_empty');
    expect(issues).not.toContain('compliance_non_compliant');
    expect(selectActiveIssue(issues)).toBe('data_quality_compliance_empty');
  });

  it('rating < 4.2 fires Tier 7 (was 4.4 — May 2026 retune)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      rating28d: 4.15,
    };
    expect(detectIssues(signals)).toContain('rating_below_target');
  });

  it('rating 4.21 does NOT fire (just above the threshold)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      rating28d: 4.21,
    };
    expect(detectIssues(signals)).not.toContain('rating_below_target');
  });

  it('open rate 0.97 fires Tier 8 (Sessions internal 98%, stricter than the contractual 95%)', () => {
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: 0.97,
    };
    expect(detectIssues(signals)).toContain('open_rate_breach');
  });

  it('reject_rate is no longer surfaced in the queue (its tier is null)', () => {
    // detectIssues never adds reject_rate_breach as a queue trigger.
    const issues = detectIssues(baseline);
    expect(issues).not.toContain('reject_rate_breach');
  });
});
