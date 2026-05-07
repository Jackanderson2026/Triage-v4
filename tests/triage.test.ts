import { describe, expect, it } from 'vitest';
import { detectIssues, selectActiveIssue, type PartnerSignals } from '@/lib/triage/activeIssue';

const baseline: PartnerSignals = {
  openRate7d: 0.98,
  daysSinceLastOrder: 1,
  missingItemsPct7d: 0.005,
  riderWait5minPct7d: 0.04,
  rejectedRate7d: 0.005,
  rating28d: 4.7,
  overallCompliant: true,
  hasEmptyComplianceLists: false,
  opsStale: false,
  isOnDeliveroo: true,
};

describe('hierarchy active-issue selection', () => {
  // Brief §14 EM checklist item 2 — the locked-in success-criteria assertion.
  it('§14 success criteria: open rate 92% with low missing items + good rating ranks Open Rate breach top, no offboarding flag', () => {
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: 0.92,
      missingItemsPct7d: 0.015,
      rating28d: 4.5,
      daysSinceLastOrder: 1, // explicitly NOT inactive
    };
    const issues = detectIssues(signals);
    expect(issues).toContain('open_rate_breach');
    expect(issues).not.toContain('inactive_offboarding_band');
    expect(issues).not.toContain('missing_items_breach');
    expect(selectActiveIssue(issues)).toBe('open_rate_breach');
  });

  it('lowest tier wins: a Tier-2 issue beats a Tier-3 issue on the same partner', () => {
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: 0.9, // Tier 2
      missingItemsPct7d: 0.05, // Tier 3
    };
    expect(selectActiveIssue(detectIssues(signals))).toBe('open_rate_breach');
  });

  it('within-tier tiebreak: Service Pack beats Partner Agreement beats Sessions internal', () => {
    // All three are Tier 2 but the inactive band is Service Pack-sourced and should win.
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: 0.9, // partner_agreement
      daysSinceLastOrder: 22, // service_pack
      overallCompliant: false, // sessions_internal
      hasEmptyComplianceLists: false,
    };
    expect(selectActiveIssue(detectIssues(signals))).toBe('inactive_offboarding_band');
  });

  it('inactive-offboarding only fires for Deliveroo partners', () => {
    const signals: PartnerSignals = {
      ...baseline,
      isOnDeliveroo: false,
      daysSinceLastOrder: 30,
    };
    expect(detectIssues(signals)).not.toContain('inactive_offboarding_band');
  });

  it('clean partner — no issues', () => {
    const issues = detectIssues(baseline);
    expect(issues).toEqual([]);
    expect(selectActiveIssue(issues)).toBeNull();
  });

  it('null signals do not trigger their thresholds', () => {
    const signals: PartnerSignals = {
      ...baseline,
      openRate7d: null,
      missingItemsPct7d: null,
      riderWait5minPct7d: null,
      rejectedRate7d: null,
      rating28d: null,
      daysSinceLastOrder: null,
    };
    expect(detectIssues(signals)).toEqual([]);
  });

  it('overall_compliant=false with empty item lists is a Tier-1 data-quality flag (not Tier-2 compliance)', () => {
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
});
