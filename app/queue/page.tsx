export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { PartnerCard } from '@/components/layout/PartnerCard';
import { SubTabNav, type SubTab } from '@/components/layout/SubTabNav';
import { tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import {
  getBrandOps,
  getCompliance,
  getMenuOps,
  getPartnerOps,
  getSparklines,
  isLive,
} from '@/lib/bq/use';
import { listActiveAnnotations } from '@/lib/annotations';
import { detectIssues, selectActiveIssue } from '@/lib/triage/activeIssue';
import { compareIssueSeverity, type IssueCode } from '@/lib/triage/hierarchy';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
import type { AnnotationType as TagAnnotationType } from '@/components/primitives/TagModal';
import type { AnnotationType } from '@/lib/annotations';

const { colors, fonts, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

// AnnotationType from lib/annotations is structurally identical to the modal's
// TagAnnotationType — they share the same string union. Adapter just narrows.
function toTagAnn(a: AnnotationType): TagAnnotationType {
  return a;
}

// Sub-tab filter buckets — each maps to a set of issue codes that mean "this
// partner belongs in this bucket". Order matches the queue hierarchy.
const TIER_BUCKETS: Array<{ key: string; label: string; codes: IssueCode[] }> = [
  { key: 'platform', label: 'Platform', codes: ['data_quality_compliance_empty', 'data_quality_ops_stale'] },
  { key: 'paused', label: 'Paused', codes: ['paused_overdue', 'paused_in_window'] },
  { key: 'inactive', label: 'Inactive', codes: ['inactive_partner'] },
  { key: 'inactive-menus', label: 'Inactive Menus', codes: ['inactive_menus'] },
  { key: 'non-compliant', label: 'Non-Compliant', codes: ['compliance_non_compliant'] },
  { key: 'missing-items', label: 'Missing Items', codes: ['missing_items_breach'] },
  { key: 'rating', label: 'Rating', codes: ['rating_below_target'] },
  { key: 'open-rate', label: 'Open Rate', codes: ['open_rate_breach'] },
  { key: 'rider-wait', label: 'Rider Wait', codes: ['rider_wait_breach'] },
];

export default async function QueuePage({ searchParams }: PageProps) {
  const partnerType = asString(searchParams.partnerType);
  const brandStack = asString(searchParams.brandStack);
  const tierFilter = asString(searchParams.tier);

  const [partners, compliance, sparklines, counts, menus, brands] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
    getMenuOps(),
    getBrandOps(),
  ]);
  const annotations = await listActiveAnnotations(partners.map((p) => p.partnerId));
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  const views = partners
    .filter((p) => (partnerType ? p.partnerType === partnerType : true))
    .filter((p) => (brandStack ? p.brandStack?.includes(brandStack) : true))
    .map((partner) => {
      const pcomp = complianceByPartner.get(partner.partnerId) ?? null;
      const cRow = pcomp?.row ?? null;
      const dur = daysUntilResume(partner.pausedUntil);
      const issues = detectIssues({
        openRate7d: partner.openRate7d,
        daysSinceLastOrder: partner.daysSinceLastOrder,
        missingItemsPct7d: partner.missingItemsPct7d,
        riderWait5minPct7d: partner.riderWait5minPct7d,
        rating28d: partner.rating28d,
        overallCompliant: cRow ? cRow.overallCompliant : null,
        hasEmptyComplianceLists: cRow ? cRow.hasEmptyLists : false,
        opsStale: partner.opsStale,
        hostStatus: partner.hostStatus,
        daysUntilResume: dur,
        inactiveMenuCount: inactiveMenuCounts.get(partner.partnerId) ?? 0,
      });
      const ann = annotations.get(partner.partnerId) ?? null;
      return {
        partner,
        issues,
        activeIssue: selectActiveIssue(issues),
        compliance: pcomp,
        annotation: ann ? { type: toTagAnn(ann.annotationType), note: ann.note, actor: ann.actor } : null,
        daysUntilResume: dur,
      };
    })
    .filter((v) => v.annotation?.type !== 'churned')
    .sort((a, b) => {
      // 1. Active issue tier (lower is more urgent)
      if (a.activeIssue && b.activeIssue) {
        const sev = compareIssueSeverity(a.activeIssue, b.activeIssue);
        if (sev !== 0) return sev;
      }
      if (a.activeIssue && !b.activeIssue) return -1;
      if (!a.activeIssue && b.activeIssue) return 1;

      // 2. Paused: ascending daysUntilResume so overdue (negative) surfaces first
      const aPaused = a.activeIssue === 'paused_overdue' || a.activeIssue === 'paused_in_window';
      const bPaused = b.activeIssue === 'paused_overdue' || b.activeIssue === 'paused_in_window';
      if (aPaused && bPaused) {
        const ar = a.daysUntilResume ?? Number.POSITIVE_INFINITY;
        const br = b.daysUntilResume ?? Number.POSITIVE_INFINITY;
        if (ar !== br) return ar - br;
      }

      // 3. 28d GMV descending — bigger commercial exposure surfaces first within tier.
      return b.partner.gmv28d - a.partner.gmv28d;
    });

  // Counts per bucket — pre-tier-filter so chips show the unfiltered totals.
  const bucketCounts = new Map<string, number>();
  for (const v of views) {
    if (!v.activeIssue) continue;
    for (const b of TIER_BUCKETS) {
      if (b.codes.includes(v.activeIssue)) {
        bucketCounts.set(b.key, (bucketCounts.get(b.key) ?? 0) + 1);
      }
    }
  }

  // Apply the tier filter (if any) to the visible views.
  const tierBucket = tierFilter ? TIER_BUCKETS.find((b) => b.key === tierFilter) : null;
  const visibleViews = tierBucket
    ? views.filter((v) => v.activeIssue !== null && tierBucket.codes.includes(v.activeIssue))
    : views;

  // Build the sub-tab list with hrefs that preserve global filters.
  const baseParams = new URLSearchParams();
  if (partnerType) baseParams.set('partnerType', partnerType);
  if (brandStack) baseParams.set('brandStack', brandStack);
  function tierHref(tier: string | null): string {
    const p = new URLSearchParams(baseParams.toString());
    if (tier) p.set('tier', tier);
    const qs = p.toString();
    return qs ? `/queue?${qs}` : '/queue';
  }
  const subTabs: SubTab[] = [
    { key: 'all', label: 'All', href: tierHref(null), count: views.length, active: !tierFilter },
    ...TIER_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      href: tierHref(b.key),
      count: bucketCounts.get(b.key) ?? 0,
      active: tierFilter === b.key,
    })),
  ];

  return (
    <Shell
      tabName="Triage Queue"
      tabTag={TAB_TAGS.queue}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/queue" tabs={applyTabCounts(TABS, counts)} />}
    >
      {!isLive() && (
        <div
          style={{
            background: colors.amberSoft,
            border: `1px solid ${colors.amber}30`,
            borderRadius: 6,
            padding: `${space[3]} ${space[4]}`,
            marginBottom: space[4],
            color: colors.amber,
            fontSize: text.sm,
            fontFamily: fonts.body,
          }}
        >
          Showing fixture data. GOOGLE_APPLICATION_CREDENTIALS_JSON is not set — the
          Vercel preview will switch to live BigQuery once the data team grants the
          service account.
        </div>
      )}
      <SubTabNav tabs={subTabs} />
      {visibleViews.length === 0 ? (
        <div
          style={{
            padding: `${space[12]} ${space[6]}`,
            textAlign: 'center',
            color: colors.ink50,
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            fontFamily: fonts.body,
          }}
        >
          {tierFilter
            ? `No partners with an active ${tierBucket?.label ?? tierFilter} issue.`
            : partnerType || brandStack
              ? 'No partners match the current filters. Clear filters to see all.'
              : 'No partners with active issues. Check back after the next data refresh.'}
        </div>
      ) : (
        visibleViews.map((v, i) => (
          <PartnerCard
            key={v.partner.partnerId}
            partner={v.partner}
            rank={i + 1}
            activeIssue={v.activeIssue}
            issues={v.issues}
            compliance={v.compliance}
            sparkline={sparklines.get(v.partner.partnerId)}
            brands={brands.get(v.partner.partnerId) ?? []}
            annotation={v.annotation}
            daysUntilResume={v.daysUntilResume}
          />
        ))
      )}
    </Shell>
  );
}
