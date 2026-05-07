export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { DetailPanel } from '@/components/layout/DetailPanel';
import { PartnerDetail } from '@/components/layout/PartnerDetail';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getCompliance, getPartnerOps, getSparklines, isLive } from '@/lib/bq/use';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import { INACTIVE_CORE_THRESHOLD_DAYS } from '@/lib/triage/thresholds';
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

const ELIGIBLE_STATUSES = new Set(['core_estate', 'trial_period']);

export default async function InactiveCorePage({ searchParams }: PageProps) {
  const statusFilter = asString(searchParams.status);
  const platformFilter = asString(searchParams.platform);
  const showRefurb = asString(searchParams.showRefurb) === '1';
  const detailId = asString(searchParams.id);

  const [partners, compliance, sparklines, counts] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
  ]);
  const complianceByPartner = buildComplianceByPartner(partners, compliance);

  const flagged = partners
    .filter((p) => p.hostStatus !== null && ELIGIBLE_STATUSES.has(p.hostStatus))
    .filter((p) => (statusFilter ? p.hostStatus === statusFilter : true))
    .filter((p) => (platformFilter ? p.platforms.includes(platformFilter) : true))
    // Refurbishment carve-out — Service Pack permits notifying refurbishment closures.
    .filter((p) => showRefurb || !p.refurbishment)
    .filter((p) =>
      p.daysSinceLastOrder === null
        ? true
        : p.daysSinceLastOrder >= INACTIVE_CORE_THRESHOLD_DAYS,
    )
    .sort((a, b) => {
      if (a.daysSinceLastOrder === null && b.daysSinceLastOrder === null) return 0;
      if (a.daysSinceLastOrder === null) return -1;
      if (b.daysSinceLastOrder === null) return 1;
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });

  const columns: ColumnDef<PartnerOpsRow>[] = [
    {
      key: 'partner',
      header: 'Partner',
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, color: colors.ink, fontSize: text.base }}>
            {p.partnerName ?? p.partnerId}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            {p.brandStack ?? '—'} · {p.platforms.join(' / ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (p) => (p.hostStatus ? <Tag label={p.hostStatus} /> : <span>—</span>),
    },
    {
      key: 'days',
      header: 'Days inactive',
      align: 'right',
      width: 130,
      render: (p) =>
        p.daysSinceLastOrder === null ? (
          <Tag label="Never ordered" tone="warning" />
        ) : (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {p.daysSinceLastOrder}d
          </span>
        ),
    },
    {
      key: 'last',
      header: 'Last order',
      align: 'right',
      render: (p) =>
        p.lastOrderDate ? (
          <span style={{ color: colors.ink70 }}>{p.lastOrderDate}</span>
        ) : (
          <span style={{ color: colors.ink50 }}>—</span>
        ),
    },
  ];

  const detail = detailId ? flagged.find((p) => p.partnerId === detailId) ?? null : null;
  const detailIssues = detail
    ? detectIssues({
        openRate7d: detail.openRate7d,
        daysSinceLastOrder: detail.daysSinceLastOrder,
        missingItemsPct7d: detail.missingItemsPct7d,
        riderWait5minPct7d: detail.riderWait5minPct7d,
        rejectedRate7d: detail.rejectedRate7d,
        rating28d: detail.rating28d,
        overallCompliant: complianceByPartner.get(detail.partnerId)?.row.overallCompliant ?? null,
        hasEmptyComplianceLists:
          complianceByPartner.get(detail.partnerId)?.row.hasEmptyLists ?? false,
        opsStale: detail.opsStale,
        isOnDeliveroo: detail.isOnDeliveroo,
      })
    : [];

  return (
    <Shell
      tabName="Inactive Core / Trial"
      tabTag={TAB_TAGS.inactiveCore}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/inactive-core" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture data. Refurbishment-flag carve-out hides flagged sites by default; toggle with <code>?showRefurb=1</code> until the HubSpot field name lands.
        </div>
      )}
      <PartnerTable
        rows={flagged}
        columns={columns}
        rowHrefForId={(p) => `/inactive-core?id=${p.partnerId}`}
        emptyState="No inactive Core / Trial sites."
      />
      {detail && (
        <DetailPanel
          title={detail.partnerName ?? detail.partnerId}
          closeHref="/inactive-core"
        >
          <PartnerDetail
            partner={detail}
            compliance={complianceByPartner.get(detail.partnerId) ?? null}
            issues={detailIssues}
            sparkline={sparklines.get(detail.partnerId)}
          />
        </DetailPanel>
      )}
    </Shell>
  );
}
