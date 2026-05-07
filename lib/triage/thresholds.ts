// Canonical thresholds. Brief §6.
// Every value carries a `@source` comment naming a Partner Agreement clause,
// Service Pack section, or Sessions internal target. No magic numbers anywhere
// in the app: import from this module.
//
// Conventions:
//   - Percentages stored as fractions (0.95, not 95).
//   - Currency in GBP.
//   - Days as integers.

export const OPEN_RATE_BENCHMARK = 0.95;
// @source Partner Agreement §2.2 / §18 (Sessions Benchmarks). Below 95% is breach.

export const MISSING_ITEMS_INTERNAL_TARGET = 0.02;
// @source Sessions internal target (§6 metric 3).

export const MISSING_ITEMS_OFFBOARDING = 0.04;
// @source Deliveroo Service Pack 2025 Renewal — Host Site Termination (§7.2.1).
// > 4% over previous 3 months → immediate offboarding eligible.

export const MISSING_ITEMS_BANDS = {
  amber: 0.03, // ≥ 3% over 3m → Amber per §7.2.1
  red: 0.035, // ≥ 3.5% → Red
  critical: 0.04, // ≥ 4% over full 3m → Critical (offboarding trigger)
};
// @source Deliveroo Service Pack 2025 Renewal §7.2.1 risk bands.

export const RIDER_WAIT_BENCHMARK = 0.07;
// @source Partner Agreement §18 / Service Pack §9.1.3. ≤ 7% target.

export const RIDER_WAIT_OFFBOARDING = 0.13;
// @source Deliveroo Service Pack 2025 Renewal — Host Site Termination (§7.2.1).
// > 13% over previous 3 months → immediate offboarding eligible.

export const RIDER_WAIT_BANDS = {
  amber: 0.09, // ≥ 9% → Amber
  red: 0.11, // ≥ 11% → Red
  critical: 0.13, // ≥ 13% over full 3m → Critical
};
// @source Deliveroo Service Pack 2025 Renewal §7.2.1.

export const INACTIVE_BANDS_DAYS = {
  amber: 14, // 14–20 days → Amber
  red: 21, // 21–27 days → Red
  critical: 28, // 28+ days → Critical (offboarding trigger)
};
// @source Deliveroo Service Pack 2025 Renewal §7.2.1.
// "has not processed any orders in the preceding month" → 28+ days fires.

export const INACTIVE_CORE_THRESHOLD_DAYS = 1;
// @source Brief §7 Tab 3 — sites in Core Estate / Trial that haven't ordered for 1+ days.

export const INACTIVE_MENU_THRESHOLD_DAYS = 7;
// @source Brief §7 Tab 4 — menus with no orders in 7+ days.

export const RATING_TARGET = 4.4;
// @source Sessions internal target (§6 metric 9). Avg New Rating ≥ 4.4*.

export const REJECT_RATE_LIMIT = 0.01;
// @source Deliveroo Service Pack 2025 Renewal §9.1.1. Reject < 1% of orders.

export const PEAK_OPEN_HOURS_BANDS = {
  // PfP Adjustment Metric — Open Hours at Peak.
  // > 99% gives -1.2% commission credit; falls to 0 at < 88%.
  greatThreshold: 0.99,
  zeroCreditThreshold: 0.88,
};
// @source Deliveroo Service Pack 2025 Renewal — PfP Adjustment Metrics.

// Peak window. SESSIONS_DEFINITION matches Sessions's existing Looker logic and
// what AMs see today (`hour BETWEEN 17 AND 21`). SERVICE_PACK_DEFINITION is the
// contractual window (17:00–20:59). Brief §7.2.1 / §15 #17b — discrepancy is an
// open item; keeping both here so the resolution is a single edit when Jack picks.
export const PEAK_HOUR_RANGE_SESSIONS = { startHour: 17, endHour: 21 } as const;
export const PEAK_HOUR_RANGE_SERVICE_PACK = { startHour: 17, endHour: 20 } as const;
// @source Sessions Looker (existing) vs Deliveroo Service Pack 2025 Renewal Appendix A.

export const ACTIONED_SNOOZE_HOURS = 24;
// @source Brief §7 Tab 1 — "actioned today" snoozes for 24h.

export const COMPLIANCE_DATA_QUALITY_FLAG_NOTE =
  'overall_compliant=false with empty food/packaging item lists. Check scoring breakdown.';
// @source Brief §7.6 edge case + §7.0 detail-card warning.

/**
 * HubSpot column on `analytics.pos_code_detail_prod` that flags refurbishment /
 * planned closure. Brief §15 #5 — name is still **[OPEN]**; once Jack confirms,
 * one edit here propagates to:
 *   - lib/bq/queries/offboardingSignals.ts (excludes flagged sites or marks them excluded)
 *   - lib/bq/queries/granularOps.ts (carries the flag through to PartnerOpsRow)
 *   - app/inactive-core/page.tsx (toggle that hides flagged sites by default)
 * Keeping it as a single string avoids string-typed magic across the codebase.
 */
export const REFURBISHMENT_HUBSPOT_FIELD: string | null = null;
// @source Brief §15 #5 — pending HubSpot owner confirmation.
