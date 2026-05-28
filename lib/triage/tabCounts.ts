// Per-tab count badges. Brief §8.2 — every tab sees every other tab's count.
//
// Counts are derived from already-cached data (lib/bq/use.ts). Calling all four
// fetchers from each page is cheap because every fetcher is wrapped in
// unstable_cache; subsequent tabs hit the same cache entry.

import { getCompliance, getMenuOffboardingSignals, getMenuOps, getPartnerOps } from '@/lib/bq/use';
import { detectIssues, selectActiveIssue } from '@/lib/triage/activeIssue';
import { listActiveAnnotations } from '@/lib/annotations';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
import {
  INACTIVE_BANDS_DAYS,
  MISSING_ITEMS_BANDS,
  RIDER_WAIT_BANDS,
} from '@/lib/triage/thresholds';

export interface TabCounts {
  queue: number;
  /** Per-severity menu counts AND the unique partner count affected. */
  offboarding: {
    critical: number;
    red: number;
    amber: number;
    /** Unique partners with at least one menu in any non-green band. */
    partnersAffected: number;
  };
  inactiveMenus: number;
  rejectedOrders: number;
}

type Severity = 'green' | 'amber' | 'red' | 'critical';
const RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2, critical: 3 };

function inactiveSev(days: number | null): Severity {
  if (days === null) return 'green';
  if (days >= INACTIVE_BANDS_DAYS.critical) return 'critical';
  if (days >= INACTIVE_BANDS_DAYS.red) return 'red';
  if (days >= INACTIVE_BANDS_DAYS.amber) return 'amber';
  return 'green';
}
function pctSev(v: number | null, bands: { critical: number; red: number; amber: number }): Severity {
  if (v === null) return 'green';
  if (v >= bands.critical) return 'critical';
  if (v >= bands.red) return 'red';
  if (v >= bands.amber) return 'amber';
  return 'green';
}

export async function getTabCounts(): Promise<TabCounts> {
  const [partners, menus, signals, compliance] = await Promise.all([
    getPartnerOps(),
    getMenuOps(),
    getMenuOffboardingSignals(),
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
      hostStatus: p.hostStatus,
      daysUntilResume: daysUntilResume(p.pausedUntil),
      inactiveMenuCount: inactiveMenuCounts.get(p.partnerId) ?? 0,
    });
    if (selectActiveIssue(issues)) queue += 1;
  }

  // Menu-grain offboarding counts (matches what the /offboarding-risk tab
  // renders) PLUS the unique partner count affected so the badge can show both.
  const offboardingMenuBands = { critical: 0, red: 0, amber: 0 };
  const affectedPartners = new Set<string>();
  for (const s of signals) {
    if (s.refurbishment) continue;
    const worst = Math.max(
      RANK[inactiveSev(s.daysSinceLastOrder)],
      RANK[pctSev(s.riderWait3m, RIDER_WAIT_BANDS)],
      RANK[pctSev(s.missingItems3m, MISSING_ITEMS_BANDS)],
    );
    if (worst === RANK.critical) offboardingMenuBands.critical += 1;
    else if (worst === RANK.red) offboardingMenuBands.red += 1;
    else if (worst === RANK.amber) offboardingMenuBands.amber += 1;
    if (worst > RANK.green) affectedPartners.add(s.partnerId);
  }
  const offboarding = {
    ...offboardingMenuBands,
    partnersAffected: affectedPartners.size,
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
      case '/offboarding-risk': {
        const o = counts.offboarding;
        const totalMenus = o.critical + o.red + o.amber;
        return {
          ...t,
          // Simplified — drops the C/R/A breakdown (was confusing). The
          // tab's per-platform summary cards already show the severity split.
          countLabel: totalMenus > 0 ? `${o.partnersAffected} partners · ${totalMenus} menus` : undefined,
        };
      }
      case '/rejected-orders':
        return { ...t, countLabel: counts.rejectedOrders ? `${counts.rejectedOrders}` : undefined };
      case '/inactive-menus':
        return { ...t, countLabel: counts.inactiveMenus ? `${counts.inactiveMenus}` : undefined };
      default:
        return t;
    }
  });
}
