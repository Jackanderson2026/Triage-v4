export const dynamic = 'force-dynamic';

import type { CSSProperties } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import {
  getCompliance,
  getMenuOps,
  getOffboardingSignals,
  getPartnerOps,
} from '@/lib/bq/use';
import { detectIssues, selectActiveIssue } from '@/lib/triage/activeIssue';
import { ISSUE_CATALOGUE, type IssueCode } from '@/lib/triage/hierarchy';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';
import {
  INACTIVE_BANDS_DAYS,
  MISSING_ITEMS_BANDS,
  RIDER_WAIT_BANDS,
} from '@/lib/triage/thresholds';

const { colors, fonts, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

interface SiteRow {
  partnerId: string;
  partnerName: string | null;
  brandStack: string | null;
  daysSinceLastOrder: number | null;
  riderWait3m: number | null;
  missingItems3m: number | null;
  inactiveSeverity: 'green' | 'amber' | 'red' | 'critical';
  riderSeverity: 'green' | 'amber' | 'red' | 'critical';
  missingSeverity: 'green' | 'amber' | 'red' | 'critical';
  /** Triage-hierarchy active-issue tier + label, when this site appears in the queue. */
  queueIssue: IssueCode | null;
}

type Severity = SiteRow['inactiveSeverity'];

function inactiveSeverity(days: number | null): Severity {
  if (days === null) return 'green';
  if (days >= INACTIVE_BANDS_DAYS.critical) return 'critical';
  if (days >= INACTIVE_BANDS_DAYS.red) return 'red';
  if (days >= INACTIVE_BANDS_DAYS.amber) return 'amber';
  return 'green';
}

function pctSeverity(value: number | null, bands: { critical: number; red: number; amber: number }): Severity {
  if (value === null) return 'green';
  if (value >= bands.critical) return 'critical';
  if (value >= bands.red) return 'red';
  if (value >= bands.amber) return 'amber';
  return 'green';
}

const SEVERITY_COLORS: Record<Severity, { bg: string; fg: string }> = {
  green: { bg: 'transparent', fg: colors.ink70 },
  amber: { bg: colors.amberSoft, fg: colors.amber },
  red: { bg: colors.redSoft, fg: colors.red },
  critical: { bg: colors.red, fg: colors.white },
};

function cellStyle(sev: Severity): CSSProperties {
  const c = SEVERITY_COLORS[sev];
  return {
    background: c.bg,
    color: c.fg,
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: text.sm,
    fontWeight: sev === 'green' ? 500 : 700,
    fontVariantNumeric: 'tabular-nums',
    display: 'inline-block',
  };
}

const SEVERITY_RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2, critical: 3 };

export default async function OffboardingRiskPage({ searchParams }: PageProps) {
  const filterIssue = asString(searchParams.firing); // 'inactive' | 'rider' | 'missing' | null
  const sortKey = asString(searchParams.sort) ?? 'composite'; // 'inactive' | 'rider' | 'missing' | 'composite'

  const [signals, partners, compliance, menus, counts] = await Promise.all([
    getOffboardingSignals(),
    getPartnerOps(),
    getCompliance(),
    getMenuOps(),
    getTabCounts(),
  ]);

  const partnersById = new Map(partners.map((p) => [p.partnerId, p]));
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  const allRows: SiteRow[] = signals
    .filter((s) => !s.refurbishment) // refurbishment carve-out
    .map((s) => {
      const inactive = inactiveSeverity(s.daysSinceLastOrder);
      const rider = pctSeverity(s.riderWait3m, RIDER_WAIT_BANDS);
      const missing = pctSeverity(s.missingItems3m, MISSING_ITEMS_BANDS);

      // Compute queue-tier issue for this partner so we can flag it on the row.
      const partner = partnersById.get(s.partnerId);
      let queueIssue: IssueCode | null = null;
      if (partner) {
        const cRow = complianceByPartner.get(partner.partnerId)?.row;
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
          daysUntilResume: daysUntilResume(partner.pausedUntil),
          inactiveMenuCount: inactiveMenuCounts.get(partner.partnerId) ?? 0,
        });
        queueIssue = selectActiveIssue(issues);
      }

      return {
        partnerId: s.partnerId,
        partnerName: s.partnerName,
        brandStack: s.brandStack,
        daysSinceLastOrder: s.daysSinceLastOrder,
        riderWait3m: s.riderWait3m,
        missingItems3m: s.missingItems3m,
        inactiveSeverity: inactive,
        riderSeverity: rider,
        missingSeverity: missing,
        queueIssue,
      };
    });

  const filtered = filterIssue
    ? allRows.filter((r) => {
        if (filterIssue === 'inactive') return r.inactiveSeverity !== 'green';
        if (filterIssue === 'rider') return r.riderSeverity !== 'green';
        if (filterIssue === 'missing') return r.missingSeverity !== 'green';
        return true;
      })
    : allRows;

  const sorted = [...filtered].sort((a, b) => {
    const key =
      sortKey === 'inactive'
        ? 'inactiveSeverity'
        : sortKey === 'rider'
          ? 'riderSeverity'
          : sortKey === 'missing'
            ? 'missingSeverity'
            : null;
    if (key) return SEVERITY_RANK[b[key as keyof SiteRow] as Severity] - SEVERITY_RANK[a[key as keyof SiteRow] as Severity];
    // composite: max severity across the three columns desc, then rider desc, then missing desc
    const ma = Math.max(SEVERITY_RANK[a.inactiveSeverity], SEVERITY_RANK[a.riderSeverity], SEVERITY_RANK[a.missingSeverity]);
    const mb = Math.max(SEVERITY_RANK[b.inactiveSeverity], SEVERITY_RANK[b.riderSeverity], SEVERITY_RANK[b.missingSeverity]);
    return mb - ma;
  });

  const columns: ColumnDef<SiteRow>[] = [
    {
      key: 'site',
      header: 'Site',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: text.base, color: colors.ink }}>
            {r.partnerName ?? r.partnerId}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            {r.brandStack ?? '—'} · {r.partnerId}
          </div>
        </div>
      ),
    },
    {
      key: 'inactive',
      header: (
        <a href="?sort=inactive" style={sortHeaderStyle(sortKey === 'inactive')}>
          Inactive (days)
        </a>
      ) as unknown as string,
      align: 'right',
      width: 160,
      render: (r) => (
        <span style={cellStyle(r.inactiveSeverity)}>
          {r.daysSinceLastOrder === null ? '—' : `${r.daysSinceLastOrder}d`}
        </span>
      ),
    },
    {
      key: 'missing',
      header: (
        <a href="?sort=missing" style={sortHeaderStyle(sortKey === 'missing')}>
          Missing items %
        </a>
      ) as unknown as string,
      align: 'right',
      width: 160,
      render: (r) => (
        <span style={cellStyle(r.missingSeverity)}>
          {r.missingItems3m === null ? '—' : `${(r.missingItems3m * 100).toFixed(2)}%`}
        </span>
      ),
    },
    {
      key: 'rider',
      header: (
        <a href="?sort=rider" style={sortHeaderStyle(sortKey === 'rider')}>
          Rider wait %
        </a>
      ) as unknown as string,
      align: 'right',
      width: 160,
      render: (r) => (
        <span style={cellStyle(r.riderSeverity)}>
          {r.riderWait3m === null ? '—' : `${(r.riderWait3m * 100).toFixed(2)}%`}
        </span>
      ),
    },
    {
      key: 'queueTier',
      header: 'In queue (tier)',
      width: 220,
      render: (r) =>
        r.queueIssue ? (
          <Tag
            label={`T${ISSUE_CATALOGUE[r.queueIssue].tier ?? '?'} · ${ISSUE_CATALOGUE[r.queueIssue].label}`}
            tone="info"
          />
        ) : (
          <span style={{ color: colors.ink50, fontSize: text.xs }}>—</span>
        ),
    },
  ];

  return (
    <Shell
      tabName="Offboarding Risk"
      tabTag={TAB_TAGS.offboarding}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/offboarding-risk" tabs={applyTabCounts(TABS, counts)} />}
    >
      <div
        style={{
          display: 'flex',
          gap: space[3],
          marginBottom: space[4],
          fontSize: text.sm,
          color: colors.ink70,
          fontFamily: fonts.body,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ alignSelf: 'center' }}>Show only sites failing:</span>
        <FilterChip label="All" href="/offboarding-risk" active={!filterIssue} />
        <FilterChip label="Inactive" href="/offboarding-risk?firing=inactive" active={filterIssue === 'inactive'} />
        <FilterChip label="Missing items" href="/offboarding-risk?firing=missing" active={filterIssue === 'missing'} />
        <FilterChip label="Rider wait" href="/offboarding-risk?firing=rider" active={filterIssue === 'rider'} />
      </div>
      <PartnerTable
        rows={sorted}
        columns={columns}
        rowHrefForId={(r) => `/queue?id=${r.partnerId}`}
        emptyState="No Deliveroo sites match the current filter."
      />
    </Shell>
  );
}

function sortHeaderStyle(active: boolean): CSSProperties {
  return {
    color: active ? colors.grape : colors.ink70,
    textDecoration: active ? 'underline' : 'none',
    cursor: 'pointer',
    fontSize: text.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  };
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      style={{
        padding: `${space[1]} ${space[3]}`,
        border: `1px solid ${active ? colors.grape : colors.border}`,
        background: active ? colors.grapeSoft : colors.white,
        color: active ? colors.grape : colors.ink70,
        borderRadius: 4,
        fontSize: text.xs,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {label}
    </a>
  );
}
