export const dynamic = 'force-dynamic';

import type { CSSProperties } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getMenuOffboardingSignals } from '@/lib/bq/use';
import type { MenuOffboardingSignalRow } from '@/lib/bq/queries/menuOffboardingSignals';
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

type Severity = 'green' | 'amber' | 'red' | 'critical';

function inactiveSeverity(days: number | null): Severity {
  if (days === null) return 'green';
  if (days >= INACTIVE_BANDS_DAYS.critical) return 'critical';
  if (days >= INACTIVE_BANDS_DAYS.red) return 'red';
  if (days >= INACTIVE_BANDS_DAYS.amber) return 'amber';
  return 'green';
}

function pctSeverity(
  value: number | null,
  bands: { critical: number; red: number; amber: number },
): Severity {
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

interface MenuView extends MenuOffboardingSignalRow {
  inactiveSev: Severity;
  riderSev: Severity;
  missingSev: Severity;
  worstSev: Severity;
}

export default async function OffboardingRiskPage({ searchParams }: PageProps) {
  const filterIssue = asString(searchParams.firing);
  const sortKey = asString(searchParams.sort) ?? 'composite';
  const platformFilter = asString(searchParams.platform); // not yet wired — fixture is all DELIVEROO

  const [signals, counts] = await Promise.all([getMenuOffboardingSignals(), getTabCounts()]);

  const enriched: MenuView[] = signals
    .filter((s) => !s.refurbishment)
    .filter((s) => (platformFilter ? s.platform === platformFilter : true))
    .map((s) => {
      const inactiveSev = inactiveSeverity(s.daysSinceLastOrder);
      const riderSev = pctSeverity(s.riderWait3m, RIDER_WAIT_BANDS);
      const missingSev = pctSeverity(s.missingItems3m, MISSING_ITEMS_BANDS);
      const worstRank = Math.max(
        SEVERITY_RANK[inactiveSev],
        SEVERITY_RANK[riderSev],
        SEVERITY_RANK[missingSev],
      );
      const worstSev = (Object.keys(SEVERITY_RANK) as Severity[]).find(
        (k) => SEVERITY_RANK[k] === worstRank,
      )!;
      return { ...s, inactiveSev, riderSev, missingSev, worstSev };
    });

  // Per-platform summary (top of tab) — counts of menus per severity bucket
  // grouped by platform. Real schema is overwhelmingly DELIVEROO for offboarding
  // (rider wait + missing items % only apply there), so this shows DELIVEROO
  // most of the time. Other platforms appear when a menu has inactive months.
  const byPlatform = new Map<
    string,
    { total: number; critical: number; red: number; amber: number }
  >();
  for (const m of enriched) {
    const p = m.platform ?? 'UNKNOWN';
    const acc = byPlatform.get(p) ?? { total: 0, critical: 0, red: 0, amber: 0 };
    acc.total += 1;
    if (m.worstSev === 'critical') acc.critical += 1;
    else if (m.worstSev === 'red') acc.red += 1;
    else if (m.worstSev === 'amber') acc.amber += 1;
    byPlatform.set(p, acc);
  }

  // Apply firing-filter (after summary calc, so summary reflects the unfiltered set).
  const filtered = filterIssue
    ? enriched.filter((m) => {
        if (filterIssue === 'inactive') return m.inactiveSev !== 'green';
        if (filterIssue === 'rider') return m.riderSev !== 'green';
        if (filterIssue === 'missing') return m.missingSev !== 'green';
        return true;
      })
    : enriched.filter((m) => m.worstSev !== 'green');

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'inactive':
        return SEVERITY_RANK[b.inactiveSev] - SEVERITY_RANK[a.inactiveSev];
      case 'missing':
        return SEVERITY_RANK[b.missingSev] - SEVERITY_RANK[a.missingSev];
      case 'rider':
        return SEVERITY_RANK[b.riderSev] - SEVERITY_RANK[a.riderSev];
      default:
        return SEVERITY_RANK[b.worstSev] - SEVERITY_RANK[a.worstSev];
    }
  });

  const columns: ColumnDef<MenuView>[] = [
    {
      key: 'menu',
      header: 'Menu',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: text.base, color: colors.ink }}>
            {m.brandName ?? 'Unknown brand'} · {m.partnerName ?? m.partnerId}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            {m.menuId} · {m.platform ?? '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'inactive',
      header: (<a href="?sort=inactive" style={sortHeaderStyle(sortKey === 'inactive')}>Inactive (days)</a>) as unknown as string,
      align: 'right',
      width: 170,
      render: (m) => (
        <div>
          <span style={cellStyle(m.inactiveSev)}>
            {m.daysSinceLastOrder === null ? '—' : `${m.daysSinceLastOrder}d`}
          </span>
          {m.inactiveMonths > 0 && (
            <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
              {m.inactiveMonths}mo in row
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'missing',
      header: (<a href="?sort=missing" style={sortHeaderStyle(sortKey === 'missing')}>Missing items %</a>) as unknown as string,
      align: 'right',
      width: 170,
      render: (m) => (
        <div>
          <span style={cellStyle(m.missingSev)}>
            {m.missingItems3m === null ? '—' : `${(m.missingItems3m * 100).toFixed(2)}%`}
          </span>
          {m.missingItemsMonthsAboveAmber > 0 && (
            <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
              {m.missingItemsMonthsAboveAmber}mo above amber
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'rider',
      header: (<a href="?sort=rider" style={sortHeaderStyle(sortKey === 'rider')}>Rider wait %</a>) as unknown as string,
      align: 'right',
      width: 170,
      render: (m) => (
        <div>
          <span style={cellStyle(m.riderSev)}>
            {m.riderWait3m === null ? '—' : `${(m.riderWait3m * 100).toFixed(2)}%`}
          </span>
          {m.riderWaitMonthsAboveAmber > 0 && (
            <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
              {m.riderWaitMonthsAboveAmber}mo above amber
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'partner',
      header: 'Partner',
      width: 200,
      render: (m) => (
        <a
          href={`/queue?id=${m.partnerId}`}
          style={{ color: colors.grape, fontSize: text.sm, textDecoration: 'none' }}
        >
          Open partner →
        </a>
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
      {/* Per-platform summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
          gap: space[3],
          marginBottom: space[4],
        }}
      >
        {Array.from(byPlatform.entries()).map(([platform, c]) => (
          <div
            key={platform}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: `${space[3]} ${space[4]}`,
              background: colors.white,
              fontFamily: fonts.body,
            }}
          >
            <div style={{ fontSize: text.xs, color: colors.ink50, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: space[1] }}>
              {platform}
            </div>
            <div style={{ display: 'flex', gap: space[3], alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: text.xl, fontWeight: 700, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {c.total}
                </div>
                <div style={{ fontSize: 9, color: colors.ink50, textTransform: 'uppercase', letterSpacing: '0.06em' }}>menus</div>
              </div>
              {c.critical > 0 && (
                <span style={{ ...cellStyle('critical') }}>{c.critical}C</span>
              )}
              {c.red > 0 && <span style={{ ...cellStyle('red') }}>{c.red}R</span>}
              {c.amber > 0 && <span style={{ ...cellStyle('amber') }}>{c.amber}A</span>}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: space[3],
          marginBottom: space[4],
          fontSize: text.sm,
          color: colors.ink70,
          fontFamily: fonts.body,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span>Show menus failing:</span>
        <FilterChip label="Any" href="/offboarding-risk" active={!filterIssue} />
        <FilterChip label="Inactive" href="/offboarding-risk?firing=inactive" active={filterIssue === 'inactive'} />
        <FilterChip label="Missing items" href="/offboarding-risk?firing=missing" active={filterIssue === 'missing'} />
        <FilterChip label="Rider wait" href="/offboarding-risk?firing=rider" active={filterIssue === 'rider'} />
      </div>

      <PartnerTable
        rows={sorted}
        columns={columns}
        rowHrefForId={(m) => `/queue?id=${m.partnerId}`}
        emptyState="No menus match the current filter."
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

