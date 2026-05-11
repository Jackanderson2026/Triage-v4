// Per-tab count badges. Brief §8.2 — every tab sees every other tab's count.
//
// Counts are derived from already-cached data (lib/bq/use.ts). Calling all four
// fetchers from each page is cheap because every fetcher is wrapped in
// unstable_cache; subsequent tabs hit the same cache entry.

import { getCompliance, getMenuOps, getOffboardingSignals, getPartnerOps } from '@/lib/bq/use';
import { detectIssues, selectActiveIssue } from '@/lib/triage/activeIssue';
import { listActiveAnnotations } from '@/lib/annotations';
import { scoreSite } from '@/lib/offboarding-risk/scoring';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';

export interface TabCounts {
  queue: number;
  offboarding: { critical: number; red: number; amber: number };
  inactiveMenus: number;
  rejectedOrders: number;
}

export async function getTabCounts(): Promise<TabCounts> {
  const [partners, menus, signals, compliance] = await Promise.all([
    getPartnerOps(),
    getMenuOps(),
    getOffboardingSignals(),
    getCompliance(),
  ]);
  const annotations = await listActiveAnnotations(partners.map((p) => p.partnerId));

  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  // Queue: number of partners with at least one issue firing, excluding
  // churned-snoozed annotations. Paused partners now stay in the queue.
  let queue = 0;
  for (const p of partners) {
    const ann = annotations.get(p.partnerId);
    if (ann?.annotationType === 'churned') continue;
    const pcomp = complianceByPartner.get(p.partnerId)?.row;
    const issues = detectIssues({
      openRate7d: p.openRate7d,
      daysSinceLastOrder: p.daysSinceLastOrder,
      missingItemsPct7d: p.missingItemsPct7d,
      riderWait5minPct7d: p.riderWait5minPct7d,
      rating28d: p.rating28d,
      overallCompliant: pcomp ? pcomp.overallCompliant : null,
      hasEmptyComplianceLists: pcomp ? pcomp.hasEmptyLists : false,
      opsStale: p.opsStale,
      hostStatus: p.hostStatus,
      daysUntilResume: daysUntilResume(p.pausedUntil),
      inactiveMenuCount: inactiveMenuCounts.get(p.partnerId) ?? 0,
    });
    if (selectActiveIssue(issues)) queue += 1;
  }

  const risks = signals.map(scoreSite);
  const offboarding = {
    critical: risks.filter((r) => r.band === 'critical').length,
    red: risks.filter((r) => r.band === 'red').length,
    amber: risks.filter((r) => r.band === 'amber').length,
  };

  const rejectedOrders = partners.filter((p) => p.rejectedCount7d > 0).length;

  const inactiveMenusCount = menus.filter(
    (m) => m.daysSinceLastOrder === null || m.daysSinceLastOrder >= 7,
  ).length;

  return { queue, offboarding, inactiveMenus: inactiveMenusCount, rejectedOrders };
}

export function applyTabCounts(
  tabs: { href: string; label: string; countLabel?: string }[],
  counts: TabCounts,
): { href: string; label: string; countLabel?: string }[] {
  return tabs.map((t) => {
    switch (t.href) {
      case '/queue':
        return { ...t, countLabel: counts.queue ? `${counts.queue} firing` : undefined };
      case '/offboarding-risk':
        return {
          ...t,
          countLabel:
            counts.offboarding.critical || counts.offboarding.red || counts.offboarding.amber
              ? `${counts.offboarding.critical}C · ${counts.offboarding.red}R · ${counts.offboarding.amber}A`
              : undefined,
        };
      case '/rejected-orders':
        return { ...t, countLabel: counts.rejectedOrders ? `${counts.rejectedOrders}` : undefined };
      case '/inactive-menus':
        return { ...t, countLabel: counts.inactiveMenus ? `${counts.inactiveMenus}` : undefined };
      default:
        return t;
    }
  });
}
