// Helpers that derive PartnerSignals fields from raw query rows. Kept out of
// activeIssue.ts so the selector stays pure (no I/O, no date math).
//
// Callers compose like:
//   detectIssues({
//     ...partner,
//     hostStatus: partner.hostStatus,
//     daysUntilResume: daysUntilResume(partner.pausedUntil),
//     inactiveMenuCount: inactiveMenuCounts.get(partner.partnerId) ?? 0,
//     overallCompliant: …,
//     hasEmptyComplianceLists: …,
//   });

import type { MenuOpsRow } from '@/lib/bq/queries/menuOps';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import { INACTIVE_MENU_THRESHOLD_DAYS } from './thresholds';

/** Number of days from today until pausedUntil. Negative = overdue. Null when missing. */
export function daysUntilResume(pausedUntil: string | null): number | null {
  if (!pausedUntil) return null;
  const target = new Date(pausedUntil + 'T00:00:00Z').getTime();
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((target - todayUtc) / 86400000);
}

/** Count of menus per partner where daysSinceLastOrder ≥ INACTIVE_MENU_THRESHOLD_DAYS. */
export function buildInactiveMenuCounts(
  partners: PartnerOpsRow[],
  menus: MenuOpsRow[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of partners) counts.set(p.partnerId, 0);
  for (const m of menus) {
    const days = m.daysSinceLastOrder;
    if (days === null || days >= INACTIVE_MENU_THRESHOLD_DAYS) {
      counts.set(m.partnerId, (counts.get(m.partnerId) ?? 0) + 1);
    }
  }
  return counts;
}
