export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { DetailPanel } from '@/components/layout/DetailPanel';
import { PartnerDetail } from '@/components/layout/PartnerDetail';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import {
  getCompliance,
  getMenuOps,
  getPartnerOps,
  getSparklines,
  isLive,
} from '@/lib/bq/use';
import type { MenuOpsRow } from '@/lib/bq/queries/menuOps';
import { INACTIVE_MENU_THRESHOLD_DAYS } from '@/lib/triage/thresholds';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { detectIssues } from '@/lib/triage/activeIssue';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';

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
  const detailId = asString(searchParams.id);

  const [menus, partners, compliance, sparklines, counts] = await Promise.all([
    getMenuOps(),
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
  ]);
  const partnersById = new Map(partners.map((p) => [p.partnerId, p]));
  const complianceByPartner = buildComplianceByPartner(partners, compliance);

  const flagged = menus
    .filter((m) => (platformFilter ? m.platform === platformFilter : true))
    .filter((m) => {
      if (!m.menuLaunchDate) return true;
      const launch = new Date(m.menuLaunchDate + 'T00:00:00Z').getTime();
      const ageDays = (Date.now() - launch) / 86400000;
      return ageDays > 7;
    })
    .filter((m) =>
      m.daysSinceLastOrder === null ? true : m.daysSinceLastOrder >= daysFilter,
    )
    .sort((a, b) => {
      if (a.daysSinceLastOrder === null && b.daysSinceLastOrder === null) return 0;
      if (a.daysSinceLastOrder === null) return -1;
      if (b.daysSinceLastOrder === null) return 1;
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });

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

  // Detail-panel id is the menuId (10 chars). Partner is LEFT(menuId, 7).
  const detailMenu = detailId ? flagged.find((m) => m.menuId === detailId) ?? null : null;
  const detailPartner = detailMenu ? partnersById.get(detailMenu.partnerId) ?? null : null;
  const detailIssues = detailPartner
    ? detectIssues({
        openRate7d: detailPartner.openRate7d,
        daysSinceLastOrder: detailPartner.daysSinceLastOrder,
        missingItemsPct7d: detailPartner.missingItemsPct7d,
        riderWait5minPct7d: detailPartner.riderWait5minPct7d,
        rejectedRate7d: detailPartner.rejectedRate7d,
        rating28d: detailPartner.rating28d,
        overallCompliant:
          complianceByPartner.get(detailPartner.partnerId)?.row.overallCompliant ?? null,
        hasEmptyComplianceLists:
          complianceByPartner.get(detailPartner.partnerId)?.row.hasEmptyLists ?? false,
        opsStale: detailPartner.opsStale,
        isOnDeliveroo: detailPartner.isOnDeliveroo,
      })
    : [];

  return (
    <Shell
      tabName="Inactive Menus"
      tabTag={TAB_TAGS.inactiveMenus}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/inactive-menus" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture data. Scheduled-minutes column is Deliveroo-only — non-ROO menus render &ldquo;—&rdquo;.
        </div>
      )}
      <PartnerTable
        rows={flagged}
        columns={columns}
        rowHrefForId={(m) => `/inactive-menus?id=${m.menuId}`}
        emptyState={`No menus inactive for ${daysFilter}+ days.`}
      />
      {detailMenu && detailPartner && (
        <DetailPanel
          title={`${detailMenu.brandName ?? 'Menu'} · ${detailPartner.partnerName ?? detailPartner.partnerId}`}
          closeHref="/inactive-menus"
        >
          <PartnerDetail
            partner={detailPartner}
            compliance={complianceByPartner.get(detailPartner.partnerId) ?? null}
            issues={detailIssues}
            sparkline={sparklines.get(detailPartner.partnerId)}
            extra={
              <section>
                <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>
                  Menu detail
                </div>
                <div style={{ fontSize: text.sm, color: colors.ink70 }}>
                  Menu: <code>{detailMenu.menuId}</code> · Platform: {detailMenu.platform ?? '—'}
                </div>
                <div style={{ fontSize: text.sm, color: colors.ink70 }}>
                  Days inactive: {detailMenu.daysSinceLastOrder ?? 'Never ordered'} · Last order:{' '}
                  {detailMenu.lastOrderDate ?? '—'}
                </div>
                <div style={{ fontSize: text.sm, color: colors.ink70 }}>
                  Scheduled minutes (7d):{' '}
                  {detailMenu.scheduledMinutes7d === null
                    ? '— (Deliveroo-only signal)'
                    : Math.round(detailMenu.scheduledMinutes7d).toLocaleString('en-GB')}
                </div>
              </section>
            }
          />
        </DetailPanel>
      )}
    </Shell>
  );
}
