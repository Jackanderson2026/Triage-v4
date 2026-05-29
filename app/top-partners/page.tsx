export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { SubTabNav, type SubTab } from '@/components/layout/SubTabNav';
import { Pager, paginate } from '@/components/layout/Pager';
import { PartnerCard } from '@/components/layout/PartnerCard';
import { tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import {
  getBrandOps,
  getBrandPlatformOps,
  getCompliance,
  getMenuOps,
  getPartnerOps,
  getPlatformOps,
  getSparklines,
  isLive,
} from '@/lib/bq/use';
import { listActiveAnnotations } from '@/lib/annotations';
import { detectIssues, selectActiveIssue } from '@/lib/triage/activeIssue';
import type { IssueCode } from '@/lib/triage/hierarchy';
import { buildComplianceByPartner, type PartnerCompliance } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
import { buildAssignedPartnerIds } from '@/lib/triage/scope';
import { listOpsExecConfig } from '@/lib/admin/opsExecs';
import { auth } from '@/auth';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';
import { extractGlobalParams } from '@/lib/triage/globalFilters';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import type { AnnotationType as TagAnnotationType } from '@/components/primitives/TagModal';
import type { AnnotationType } from '@/lib/annotations';

const { colors, fonts, radii, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

function toTagAnn(a: AnnotationType): TagAnnotationType {
  return a;
}

interface PartnerView {
  partner: PartnerOpsRow;
  issues: IssueCode[];
  activeIssue: IssueCode | null;
  compliance: PartnerCompliance | null;
  annotation: { type: TagAnnotationType; note: string | null; actor: string } | null;
  daysUntilResume: number | null;
}

// Brand-stack sub-tabs. brand_stack stores 3-letter codes (SBB / RUD / SMA / KAR / OTHER).
const BRAND_SUBTABS: Array<{ key: string; label: string; matches: (stack: string) => boolean }> = [
  { key: 'sbb', label: 'SoBe', matches: (s) => /SBB/i.test(s) },
  { key: 'rud', label: "Rudi's", matches: (s) => /RUD/i.test(s) },
  { key: 'sma', label: 'Smashed', matches: (s) => /SMA/i.test(s) },
];

export default async function TopPartnersPage({ searchParams }: PageProps) {
  const partnerType = asString(searchParams.partnerType);
  const brandStack = asString(searchParams.brandStack);
  const hostStatus = asString(searchParams.hostStatus);
  const brandTab = asString(searchParams.brand);

  const [
    partners, compliance, menus, sparklines, brands, platforms, brandPlatforms, counts,
    execConfig, session,
  ] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getMenuOps(),
    getSparklines(),
    getBrandOps(),
    getPlatformOps(),
    getBrandPlatformOps(),
    getTabCounts(),
    listOpsExecConfig(),
    auth(),
  ]);
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);
  const annotations = await listActiveAnnotations(partners.map((p) => p.partnerId));

  // Scope to the logged-in exec's assigned partners (null = unscoped → show all).
  const assignedIds = buildAssignedPartnerIds(
    partners.map((p) => ({ partnerId: p.partnerId, partnerType: p.partnerType, brandStack: p.brandStack })),
    execConfig,
    session?.user?.email ?? null,
  );

  const views: PartnerView[] = partners
    .filter((p) => (assignedIds ? assignedIds.has(p.partnerId) : true))
    .filter((p) => (partnerType ? p.partnerType === partnerType : true))
    .filter((p) => (brandStack ? p.brandStack?.toLowerCase().includes(brandStack.toLowerCase()) : true))
    .filter((p) => (hostStatus ? p.hostStatus === hostStatus : true))
    .map((p) => {
      const pcomp = complianceByPartner.get(p.partnerId) ?? null;
      const cRow = pcomp?.row ?? null;
      const dur = daysUntilResume(p.pausedUntil);
      const issues = detectIssues({
        openRate7d: p.openRate7d,
        daysSinceLastOrder: p.daysSinceLastOrder,
        missingItemsPct7d: p.missingItemsPct7d,
        riderWait5minPct7d: p.riderWait5minPct7d,
        rating28d: p.rating28d,
        overallCompliant: cRow ? cRow.overallCompliant : null,
        hasEmptyComplianceLists: cRow ? cRow.hasEmptyLists : false,
        hostStatus: p.hostStatus,
        daysUntilResume: dur,
        inactiveMenuCount: inactiveMenuCounts.get(p.partnerId) ?? 0,
      });
      const ann = annotations.get(p.partnerId) ?? null;
      return {
        partner: p,
        issues,
        activeIssue: selectActiveIssue(issues),
        compliance: pcomp,
        annotation: ann
          ? { type: toTagAnn(ann.annotationType), note: ann.note, actor: ann.actor }
          : null,
        daysUntilResume: dur,
      };
    });

  // Brand-tab counts (computed from the unfiltered views so chips show totals).
  const brandCounts = new Map<string, number>();
  for (const v of views) {
    const stack = v.partner.brandStack ?? '';
    for (const tab of BRAND_SUBTABS) {
      if (tab.matches(stack)) brandCounts.set(tab.key, (brandCounts.get(tab.key) ?? 0) + 1);
    }
  }

  const activeBrand = brandTab ? BRAND_SUBTABS.find((t) => t.key === brandTab) : null;
  const brandFilteredViews = activeBrand
    ? views.filter((v) => activeBrand.matches(v.partner.brandStack ?? ''))
    : views;

  // Flat list, ranked by avg weekly GMV over the prior 4 complete weeks desc.
  const ranked = [...brandFilteredViews].sort(
    (a, b) => b.partner.avgWeeklyGmv4w - a.partner.avgWeeklyGmv4w,
  );

  const pageRaw = asString(searchParams.page);
  const paged = paginate(ranked, pageRaw ?? undefined);

  // Build the brand sub-tab list with hrefs that preserve global filters.
  const baseParams = new URLSearchParams();
  if (partnerType) baseParams.set('partnerType', partnerType);
  if (brandStack) baseParams.set('brandStack', brandStack);
  if (hostStatus) baseParams.set('hostStatus', hostStatus);
  function brandHref(brand: string | null): string {
    const p = new URLSearchParams(baseParams.toString());
    if (brand) p.set('brand', brand);
    const qs = p.toString();
    return qs ? `/top-partners?${qs}` : '/top-partners';
  }
  const subTabs: SubTab[] = [
    { key: 'all', label: 'All', href: brandHref(null), count: views.length, active: !brandTab },
    ...BRAND_SUBTABS.map((b) => ({
      key: b.key,
      label: b.label,
      href: brandHref(b.key),
      count: brandCounts.get(b.key) ?? 0,
      active: brandTab === b.key,
    })),
  ];

  return (
    <Shell
      tabName="Top Partners"
      tabTag={TAB_TAGS.topPartners}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/top-partners" tabs={applyTabCounts(TABS, counts)} globalParams={extractGlobalParams(searchParams)} />}
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
          Portfolio overview — every partner, ranked by average weekly GMV over the prior 4 complete weeks. Click any card to expand for AI summary, compliance, and brand sub-rows.
        </div>
      )}
      <SubTabNav tabs={subTabs} />
      {ranked.length === 0 ? (
        <div
          style={{
            padding: `${space[12]} ${space[6]}`,
            textAlign: 'center',
            color: colors.ink50,
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: radii.lg,
            fontFamily: fonts.body,
          }}
        >
          {activeBrand
            ? `No partners running ${activeBrand.label}. The fixture set may not include this brand yet.`
            : 'No partners match the current filters.'}
        </div>
      ) : (
        <>
          {paged.slice.map((v, i) => (
            <PartnerCard
              key={v.partner.partnerId}
              partner={v.partner}
              rank={(paged.page - 1) * paged.pageSize + i + 1}
              activeIssue={v.activeIssue}
              issues={v.issues}
              compliance={v.compliance}
              sparkline={sparklines.get(v.partner.partnerId)}
              brands={brands.get(v.partner.partnerId) ?? []}
              platforms={platforms.get(v.partner.partnerId) ?? []}
              brandPlatforms={brandPlatforms}
              annotation={v.annotation}
              daysUntilResume={v.daysUntilResume}
              headlineGmv="avgWeekly4w"
            />
          ))}
          <Pager
            page={paged.page}
            pageSize={paged.pageSize}
            total={paged.total}
            hrefFor={(p) => {
              const params = new URLSearchParams(baseParams.toString());
              if (brandTab) params.set('brand', brandTab);
              params.set('page', String(p));
              return `/top-partners?${params.toString()}`;
            }}
          />
        </>
      )}
    </Shell>
  );
}
