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
  getBrandPlatformOps,
  getCompliance,
  getMenuOffboardingSignals,
  getMenuOps,
  getPartnerOps,
  getPlatformOps,
  getSparklines,
  isLive,
} from '@/lib/bq/use';
import { INACTIVE_BANDS_DAYS, MISSING_ITEMS_BANDS, RIDER_WAIT_BANDS } from '@/lib/triage/thresholds';
import { listActiveAnnotations } from '@/lib/annotations';
import { detectIssues, selectActiveIssue } from '@/lib/triage/activeIssue';
import { compareIssueSeverity, type IssueCode } from '@/lib/triage/hierarchy';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';
import { extractGlobalParams } from '@/lib/triage/globalFilters';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
import { computeScope, isThisWeek } from '@/lib/triage/scope';
import { listOpsExecConfig } from '@/lib/admin/opsExecs';
import { auth } from '@/auth';
import { QUEUE_TIER_BUCKETS } from '@/lib/triage/queueTiers';
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

// Sub-tab filter buckets — shared constant in lib/triage/queueTiers.ts so the
// admin UI can render the same set when picking which sub-tabs to hide per
// exec. The 'clean' bucket is special: partners with no active issue.
const CLEAN_KEY = 'clean';
const TIER_BUCKETS = QUEUE_TIER_BUCKETS;

export default async function QueuePage({ searchParams }: PageProps) {
  const partnerType = asString(searchParams.partnerType);
  const brandStack = asString(searchParams.brandStack);
  const hostStatus = asString(searchParams.hostStatus);
  const tierFilter = asString(searchParams.tier);

  const [
    partners, compliance, sparklines, counts, menus, brands, platforms, brandPlatforms,
    offboarding, execConfig, session,
  ] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
    getMenuOps(),
    getBrandOps(),
    getPlatformOps(),
    getBrandPlatformOps(),
    getMenuOffboardingSignals(),
    listOpsExecConfig(),
    auth(),
  ]);
  const sessionEmail = session?.user?.email ?? null;
  const annotations = await listActiveAnnotations(partners.map((p) => p.partnerId));

  // Partners with at least one menu firing an offboarding trigger (amber+).
  // Used to badge queue tiles "also in Offboarding Risk" so the partner isn't
  // double-actioned across tabs.
  const offboardingPartnerIds = new Set<string>();
  for (const s of offboarding) {
    if (s.refurbishment) continue;
    const inactiveHit = s.daysSinceLastOrder !== null && s.daysSinceLastOrder >= INACTIVE_BANDS_DAYS.amber;
    const riderHit = s.riderWait3m !== null && s.riderWait3m >= RIDER_WAIT_BANDS.amber;
    const missingHit = s.missingItems3m !== null && s.missingItems3m >= MISSING_ITEMS_BANDS.amber;
    if (inactiveHit || riderHit || missingHit) offboardingPartnerIds.add(s.partnerId);
  }
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  const views = partners
    .filter((p) => (partnerType ? p.partnerType === partnerType : true))
    .filter((p) => (brandStack ? p.brandStack?.toLowerCase().includes(brandStack.toLowerCase()) : true))
    .filter((p) => (hostStatus ? p.hostStatus === hostStatus : true))
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
        annotation: ann
          ? { type: toTagAnn(ann.annotationType), note: ann.note, actor: ann.actor, createdAt: ann.createdAt }
          : null,
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
  let cleanCount = 0;
  for (const v of views) {
    if (!v.activeIssue) {
      cleanCount += 1;
      continue;
    }
    for (const b of TIER_BUCKETS) {
      if (b.codes.includes(v.activeIssue)) {
        bucketCounts.set(b.key, (bucketCounts.get(b.key) ?? 0) + 1);
      }
    }
  }

  // Per-exec tier visibility — drop sub-tab chips AND partners whose active
  // issue is in a hidden tier. Looked up against the SSO email; unregistered
  // user → no tiers hidden.
  const myExec = execConfig.find((c) => c.exec.email === (sessionEmail ?? '').toLowerCase())?.exec;
  const hiddenTiers = new Set(myExec?.hiddenQueueTiers ?? []);
  const isCodeInHiddenTier = (code: IssueCode): boolean =>
    TIER_BUCKETS.some((b) => hiddenTiers.has(b.key) && b.codes.includes(code));
  const visibleTierBuckets = TIER_BUCKETS.filter((b) => !hiddenTiers.has(b.key));

  // Apply the tier filter (if any) to the visible views, plus the per-exec
  // hidden-tier filter.
  const tierBucket = tierFilter && tierFilter !== CLEAN_KEY ? visibleTierBuckets.find((b) => b.key === tierFilter) : null;
  const visibleViews =
    tierFilter === CLEAN_KEY
      ? views.filter((v) => v.activeIssue === null)
      : tierBucket
        ? views.filter((v) => v.activeIssue !== null && tierBucket.codes.includes(v.activeIssue))
        : views.filter((v) => v.activeIssue !== null && !isCodeInHiddenTier(v.activeIssue));

  // Build the sub-tab list with hrefs that preserve global filters.
  const baseParams = new URLSearchParams();
  if (partnerType) baseParams.set('partnerType', partnerType);
  if (brandStack) baseParams.set('brandStack', brandStack);
  if (hostStatus) baseParams.set('hostStatus', hostStatus);
  function tierHref(tier: string | null): string {
    const p = new URLSearchParams(baseParams.toString());
    if (tier) p.set('tier', tier);
    const qs = p.toString();
    return qs ? `/queue?${qs}` : '/queue';
  }
  const allCount = views.filter((v) => v.activeIssue !== null && !isCodeInHiddenTier(v.activeIssue)).length;
  const subTabs: SubTab[] = [
    { key: 'all', label: 'All', href: tierHref(null), count: allCount, active: !tierFilter },
    ...visibleTierBuckets.map((b) => ({
      key: b.key,
      label: b.label,
      href: tierHref(b.key),
      count: bucketCounts.get(b.key) ?? 0,
      active: tierFilter === b.key,
    })),
    { key: CLEAN_KEY, label: 'Clean', href: tierHref(CLEAN_KEY), count: cleanCount, active: tierFilter === CLEAN_KEY },
  ];

  // Split the visible (tier-filtered) views into actioned / in-scope / out-of-scope
  // for the logged-in ops exec. Unregistered email → unscoped (all in-scope).
  const scope = computeScope({
    email: sessionEmail,
    tab: 'queue',
    config: execConfig,
    views: visibleViews,
    getPartner: (v) => ({
      partnerId: v.partner.partnerId,
      partnerType: v.partner.partnerType,
      brandStack: v.partner.brandStack,
    }),
    isActionedThisWeek: (v) => isThisWeek(v.annotation?.createdAt),
  });

  type QView = (typeof visibleViews)[number];
  const renderCard = (v: QView, rank: number) => (
    <PartnerCard
      key={v.partner.partnerId}
      partner={v.partner}
      rank={rank}
      activeIssue={v.activeIssue}
      issues={v.issues}
      compliance={v.compliance}
      sparkline={sparklines.get(v.partner.partnerId)}
      brands={brands.get(v.partner.partnerId) ?? []}
      platforms={platforms.get(v.partner.partnerId) ?? []}
      brandPlatforms={brandPlatforms}
      annotation={v.annotation}
      daysUntilResume={v.daysUntilResume}
      alsoIn={offboardingPartnerIds.has(v.partner.partnerId) ? ['Roo Offboarding Risk'] : []}
    />
  );

  const sectionHeading = (titleText: string, count: number, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3], margin: `${space[5]} 0 ${space[3]}` }}>
      <span style={{ fontFamily: fonts.display, fontSize: text.lg, fontWeight: 700, color: colors.ink }}>
        {titleText}
      </span>
      <span style={{ fontSize: text.xs, color: colors.ink50, fontWeight: 600 }}>{count}</span>
      {sub && <span style={{ fontSize: text.xs, color: colors.ink50 }}>{sub}</span>}
    </div>
  );

  const everythingEmpty =
    scope.inScope.length === 0 && scope.outOfScope.length === 0 && scope.actioned.length === 0;

  return (
    <Shell
      tabName="Triage Queue"
      tabTag={TAB_TAGS.queue}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/queue" tabs={applyTabCounts(TABS, counts)} globalParams={extractGlobalParams(searchParams)} />}
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

      {scope.scopedExec && (
        <div style={{ fontSize: text.xs, color: colors.ink50, fontFamily: fonts.body, marginBottom: space[2] }}>
          Scoped to <strong style={{ color: colors.ink70 }}>{scope.scopedExec.name}</strong> · in-scope sites
          assigned by the allocation rules in Admin.
        </div>
      )}

      {everythingEmpty ? (
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
          {tierFilter === CLEAN_KEY
            ? 'No clean partners. Every partner has at least one issue firing.'
            : tierFilter
              ? `No partners with an active ${tierBucket?.label ?? tierFilter} issue.`
              : partnerType || brandStack
                ? 'No partners match the current filters. Clear filters to see all.'
                : 'No partners with active issues. Check back after the next data refresh.'}
        </div>
      ) : (
        <>
          {/* In scope for the week */}
          {sectionHeading('In scope for the week', scope.inScope.length)}
          {scope.inScope.length === 0 ? (
            <div style={{ fontSize: text.sm, color: colors.ink50, fontFamily: fonts.body, marginBottom: space[3] }}>
              Nothing in scope — either you&apos;re under your limit with no assigned issues, or your
              allocation rules don&apos;t match any firing partners.
            </div>
          ) : (
            scope.inScope.map((v, i) => renderCard(v, i + 1))
          )}

          {/* Out of scope — collapsed by default to keep the page snappy.
              <details> is the native disclosure widget — no JS, no state. */}
          {scope.outOfScope.length > 0 && (
            <details style={{ marginTop: space[5] }}>
              <summary
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: space[3],
                  padding: `${space[2]} 0`,
                  userSelect: 'none',
                }}
              >
                <span style={{ fontFamily: fonts.display, fontSize: text.lg, fontWeight: 700, color: colors.ink }}>
                  Out of scope for the week
                </span>
                <span style={{ fontSize: text.xs, color: colors.ink50, fontWeight: 600 }}>
                  {scope.outOfScope.length}
                </span>
                <span style={{ fontSize: text.xs, color: colors.grape, fontWeight: 600 }}>
                  click to show ▾
                </span>
                <span style={{ fontSize: text.xs, color: colors.ink50 }}>
                  over limit / assigned elsewhere / unassigned — still actionable
                </span>
              </summary>
              <div style={{ opacity: 0.55, marginTop: space[3] }}>
                {scope.outOfScope.map((v, i) => renderCard(v, i + 1))}
              </div>
            </details>
          )}

          {/* Actioned this week */}
          {scope.actioned.length > 0 && (
            <>
              {sectionHeading('Actioned this week', scope.actioned.length)}
              <div style={{ opacity: 0.7 }}>
                {scope.actioned.map((v, i) => renderCard(v, i + 1))}
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
