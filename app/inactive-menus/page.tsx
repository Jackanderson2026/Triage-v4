export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Pager, paginate } from '@/components/layout/Pager';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getMenuOps, getPartnerOps, isLive } from '@/lib/bq/use';
import type { MenuOpsRow } from '@/lib/bq/queries/menuOps';
import { INACTIVE_MENU_THRESHOLD_DAYS } from '@/lib/triage/thresholds';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';
import { extractGlobalParams } from '@/lib/triage/globalFilters';
import { buildAssignedPartnerIds } from '@/lib/triage/scope';
import { listOpsExecConfig } from '@/lib/admin/opsExecs';
import { auth } from '@/auth';

const { colors, fonts, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

export default async function InactiveMenusPage({ searchParams }: PageProps) {
  const platformFilter = asString(searchParams.platform);
  const daysFilter = Number(asString(searchParams.days)) || INACTIVE_MENU_THRESHOLD_DAYS;

  const [menus, counts, partners, execConfig, session] = await Promise.all([
    getMenuOps(),
    getTabCounts(),
    getPartnerOps(),
    listOpsExecConfig(),
    auth(),
  ]);
  const assignedIds = buildAssignedPartnerIds(
    partners.map((p) => ({ partnerId: p.partnerId, partnerType: p.partnerType, brandStack: p.brandStack })),
    execConfig,
    session?.user?.email ?? null,
  );

  const flagged = menus
    .filter((m) => (assignedIds ? assignedIds.has(m.partnerId) : true))
    .filter((m) => (platformFilter ? m.platform === platformFilter : true))
    .filter((m) => {
      // Skip newly-launched menus (< 7 days since launch) so launches don't trigger.
      if (!m.menuLaunchDate) return true;
      const launch = new Date(m.menuLaunchDate + 'T00:00:00Z').getTime();
      const ageDays = (Date.now() - launch) / 86400000;
      return ageDays > 7;
    })
    .filter((m) =>
      m.daysSinceLastOrder === null ? true : m.daysSinceLastOrder >= daysFilter,
    )
    // Only menus that have actually been scheduled to be open — > 1 minute in
    // the last 7d. Zero/null = the partner never asked the platform to open
    // this menu, so "no orders" is intent, not failure.
    .filter((m) => (m.scheduledMinutes7d ?? 0) > 1)
    .sort((a, b) => {
      if (a.daysSinceLastOrder === null && b.daysSinceLastOrder === null) return 0;
      if (a.daysSinceLastOrder === null) return -1;
      if (b.daysSinceLastOrder === null) return 1;
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });

  const paged = paginate(flagged, asString(searchParams.page) ?? undefined);

  const columns: ColumnDef<MenuOpsRow>[] = [
    {
      key: 'menu',
      header: 'Menu',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 600, color: colors.ink, fontSize: text.base }}>
            {(m.brandName ?? 'Unknown brand') + ' · ' + (m.partnerName ?? m.partnerId)}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>{m.menuId}</div>
        </div>
      ),
    },
    {
      key: 'platform',
      header: 'Platform',
      width: 130,
      render: (m) => (m.platform ? <Tag label={m.platform} /> : <span>—</span>),
    },
    {
      key: 'days',
      header: 'Days inactive',
      align: 'right',
      width: 130,
      render: (m) =>
        m.daysSinceLastOrder === null ? (
          <Tag label="Never ordered" tone="warning" />
        ) : (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {m.daysSinceLastOrder}d
          </span>
        ),
    },
    {
      key: 'last',
      header: 'Last order',
      align: 'right',
      render: (m) =>
        m.lastOrderDate ? (
          <span style={{ color: colors.ink70 }}>{m.lastOrderDate}</span>
        ) : (
          <span style={{ color: colors.ink50 }}>—</span>
        ),
    },
    {
      key: 'sched',
      header: 'Scheduled minutes (7d)',
      align: 'right',
      render: (m) =>
        m.scheduledMinutes7d === null ? (
          <span style={{ color: colors.ink50 }}>—</span>
        ) : (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(m.scheduledMinutes7d).toLocaleString('en-GB')}
          </span>
        ),
    },
  ];

  return (
    <Shell
      tabName="Inactive Menus"
      tabTag={TAB_TAGS.inactiveMenus}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/inactive-menus" tabs={applyTabCounts(TABS, counts)} globalParams={extractGlobalParams(searchParams)} />}
    >
      {/* Explainer banner — sits above the table so AMs know the filter rule. */}
      <div
        style={{
          background: colors.blueSoft,
          border: `1px solid ${colors.blue}30`,
          borderRadius: 6,
          padding: `${space[3]} ${space[4]}`,
          marginBottom: space[4],
          color: colors.blue,
          fontSize: text.sm,
          fontFamily: fonts.body,
        }}
      >
        Showing menus that have been <strong>scheduled to be open</strong> (&gt; 1 minute in the last 7
        days) <strong>but haven&apos;t taken an order</strong> in {INACTIVE_MENU_THRESHOLD_DAYS}+ days.
        Menus with zero scheduled hours are excluded — they&apos;re intentionally switched off. Deliveroo
        only (other platforms don&apos;t surface scheduled hours).
      </div>
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
          Showing fixture data.
        </div>
      )}
      <PartnerTable
        rows={paged.slice}
        columns={columns}
        rowHrefForId={(m) => `/queue?id=${m.partnerId}`}
        emptyState={`No menus inactive for ${daysFilter}+ days.`}
      />
      <Pager
        page={paged.page}
        pageSize={paged.pageSize}
        total={paged.total}
        hrefFor={(p) => {
          const params = new URLSearchParams();
          if (platformFilter) params.set('platform', platformFilter);
          if (daysFilter !== INACTIVE_MENU_THRESHOLD_DAYS) params.set('days', String(daysFilter));
          params.set('page', String(p));
          return `/inactive-menus?${params.toString()}`;
        }}
      />
    </Shell>
  );
}
