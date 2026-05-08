export const dynamic = 'force-dynamic';

import type { CSSProperties } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { SubTabNav, type SubTab } from '@/components/layout/SubTabNav';
import { tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getCompliance, getMenuOps, getPartnerOps, isLive } from '@/lib/bq/use';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import { detectIssues } from '@/lib/triage/activeIssue';
import {
  ISSUE_CATALOGUE,
  type IssueCode,
  type Tier,
} from '@/lib/triage/hierarchy';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';

const { colors, fonts, radii, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

function gbp(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

// RAG band: T1-T2 = red, T3-T5 = amber, T6-T9 = blue. Issues with tier null skipped.
function tierColor(tier: Tier | null): { bg: string; fg: string; border: string } {
  if (tier === null) return { bg: colors.ink05, fg: colors.ink50, border: colors.border };
  if (tier <= 2) return { bg: colors.redSoft, fg: colors.red, border: colors.red + '40' };
  if (tier <= 5) return { bg: colors.amberSoft, fg: colors.amber, border: colors.amber + '40' };
  return { bg: colors.blueSoft, fg: colors.blue, border: colors.blue + '40' };
}

interface PartnerView {
  partner: PartnerOpsRow;
  issues: IssueCode[];
}

// Brand-stack sub-tabs. Match is "brand_stack contains the brand name" (case-
// insensitive substring), so a partner running "SoBe + Rudi's" appears under
// both SoBe and Rudis. Ordered by the user's stated priority list.
const BRAND_SUBTABS: Array<{ key: string; label: string; matches: (stack: string) => boolean }> = [
  { key: 'sobe', label: 'SoBe', matches: (s) => /sobe/i.test(s) },
  { key: 'rudis', label: "Rudi's", matches: (s) => /rudi/i.test(s) },
  { key: 'smashed', label: 'Smashed', matches: (s) => /smashed/i.test(s) },
];

export default async function TopPartnersPage({ searchParams }: PageProps) {
  const partnerType = asString(searchParams.partnerType);
  const brandStack = asString(searchParams.brandStack);
  const brandTab = asString(searchParams.brand);

  const [partners, compliance, menus] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getMenuOps(),
  ]);
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  const views: PartnerView[] = partners
    .filter((p) => (partnerType ? p.partnerType === partnerType : true))
    .filter((p) => (brandStack ? p.brandStack?.includes(brandStack) : true))
    .map((p) => {
      const cRow = complianceByPartner.get(p.partnerId)?.row ?? null;
      return {
        partner: p,
        issues: detectIssues({
          openRate7d: p.openRate7d,
          daysSinceLastOrder: p.daysSinceLastOrder,
          missingItemsPct7d: p.missingItemsPct7d,
          riderWait5minPct7d: p.riderWait5minPct7d,
          rating28d: p.rating28d,
          overallCompliant: cRow ? cRow.overallCompliant : null,
          hasEmptyComplianceLists: cRow ? cRow.hasEmptyLists : false,
          opsStale: p.opsStale,
          hostStatus: p.hostStatus,
          daysUntilResume: daysUntilResume(p.pausedUntil),
          inactiveMenuCount: inactiveMenuCounts.get(p.partnerId) ?? 0,
        }),
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

  // Group by brand stack. Partners with no stack go to a single "Unassigned" bucket.
  const groups = new Map<string, PartnerView[]>();
  for (const v of brandFilteredViews) {
    const key = v.partner.brandStack ?? 'Unassigned';
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  // Sort each group by 28d GMV desc.
  groups.forEach((list) => list.sort((a, b) => b.partner.gmv28d - a.partner.gmv28d));
  // Stack order: by total 28d GMV desc.
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
    const ga = a[1].reduce((s, v) => s + v.partner.gmv28d, 0);
    const gb = b[1].reduce((s, v) => s + v.partner.gmv28d, 0);
    return gb - ga;
  });

  // Counts for getTabCounts - skip; this tab doesn't have a count badge.
  const fakeCounts = {
    queue: 0,
    offboarding: { critical: 0, red: 0, amber: 0 },
    rejectedOrders: 0,
  };

  // Build the brand sub-tab list with hrefs that preserve global filters.
  const baseParams = new URLSearchParams();
  if (partnerType) baseParams.set('partnerType', partnerType);
  if (brandStack) baseParams.set('brandStack', brandStack);
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
      tabNav={<TabNav current="/top-partners" tabs={TABS} />}
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
          Portfolio overview — every partner, grouped by brand stack, ranked by 28d GMV. Issue pills are RAG-coloured by hierarchy tier.
        </div>
      )}
      <SubTabNav tabs={subTabs} />
      {sortedGroups.length === 0 ? (
        <div style={emptyState}>
          {activeBrand
            ? `No partners running ${activeBrand.label}. The fixture set may not include this brand yet.`
            : 'No partners match the current filters.'}
        </div>
      ) : (
        sortedGroups.map(([stackName, list]) => (
          <section key={stackName} style={{ marginBottom: space[6] }}>
            <div style={stackHeader}>
              <span style={{ fontSize: text.lg, fontWeight: 700, color: colors.ink }}>{stackName}</span>
              <span style={{ fontSize: text.xs, color: colors.ink50, marginLeft: space[3] }}>
                {list.length} partner{list.length === 1 ? '' : 's'} · {gbp(list.reduce((s, v) => s + v.partner.gmv28d, 0))} 28d GMV
              </span>
            </div>
            {list.map((v, i) => (
              <PartnerRow key={v.partner.partnerId} view={v} rank={i + 1} />
            ))}
          </section>
        ))
      )}
      {/* avoid unused - keeping for future tabCounts wiring */}
      <span style={{ display: 'none' }}>{JSON.stringify(fakeCounts)}</span>
    </Shell>
  );
}

const emptyState: CSSProperties = {
  padding: `${space[12]} ${space[6]}`,
  textAlign: 'center',
  color: colors.ink50,
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  fontFamily: fonts.body,
};

const stackHeader: CSSProperties = {
  padding: `${space[3]} ${space[4]}`,
  background: colors.grapeSoft,
  borderRadius: radii.sm,
  marginBottom: space[2],
  display: 'flex',
  alignItems: 'baseline',
  fontFamily: fonts.body,
};

function PartnerRow({ view, rank }: { view: PartnerView; rank: number }) {
  const { partner, issues } = view;
  return (
    <div
      style={{
        background: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        padding: `${space[3]} ${space[4]}`,
        marginBottom: space[1],
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        fontFamily: fonts.body,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: colors.ink05,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: colors.ink70,
          flexShrink: 0,
        }}
      >
        {rank}
      </div>
      <div style={{ flex: 1 }}>
        <a
          href={`/queue?id=${partner.partnerId}`}
          style={{ fontSize: text.base, fontWeight: 600, color: colors.ink, textDecoration: 'none' }}
        >
          {partner.partnerName ?? partner.partnerId}
        </a>
        <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
          {partner.partnerType ?? '—'} · {partner.platforms.join(' / ') || '—'} · {partner.hostStatus ?? '—'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', maxWidth: '50%', justifyContent: 'flex-end' }}>
        {issues.length === 0 ? (
          <span
            style={{
              fontSize: text.xs,
              color: colors.green,
              background: colors.greenSoft,
              padding: '2px 8px',
              borderRadius: radii.sm,
              fontWeight: 600,
            }}
          >
            Clean
          </span>
        ) : (
          issues.map((code) => {
            const def = ISSUE_CATALOGUE[code];
            const c = tierColor(def.tier);
            return (
              <span
                key={code}
                title={def.sourceRef}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: c.fg,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  padding: '2px 6px',
                  borderRadius: radii.sm,
                }}
              >
                {def.tier !== null ? `T${def.tier} · ` : ''}
                {def.label}
              </span>
            );
          })
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: text.base, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.ink }}>
          {gbp(partner.gmv28d)}
        </div>
        <div style={{ fontSize: 9, color: colors.ink50, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          28d GMV
        </div>
      </div>
    </div>
  );
}
