export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Pager, paginate } from '@/components/layout/Pager';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getPartnerOps, isLive } from '@/lib/bq/use';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';
import { buildRejectedOrders, type RejectedOrderRow } from '@/lib/triage/rejectedOrders';
import { buildAssignedPartnerIds } from '@/lib/triage/scope';
import { listOpsExecConfig } from '@/lib/admin/opsExecs';
import { auth } from '@/auth';

const { colors, fonts, space, text } = tokens;

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

export default async function RejectedOrdersPage({ searchParams }: PageProps) {
  const [partners, counts, execConfig, session] = await Promise.all([
    getPartnerOps(),
    getTabCounts(),
    listOpsExecConfig(),
    auth(),
  ]);
  const assignedIds = buildAssignedPartnerIds(
    partners.map((p) => ({ partnerId: p.partnerId, partnerType: p.partnerType, brandStack: p.brandStack })),
    execConfig,
    session?.user?.email ?? null,
  );
  const scopedPartners = assignedIds ? partners.filter((p) => assignedIds.has(p.partnerId)) : partners;
  const rows = buildRejectedOrders(scopedPartners);
  const paged = paginate(rows, asString(searchParams.page) ?? undefined);

  const columns: ColumnDef<RejectedOrderRow>[] = [
    {
      key: 'site',
      header: 'Site',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: colors.ink, fontSize: text.base }}>
            {r.partnerName ?? r.partnerId}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            {r.brandStack ?? '—'} · {r.platforms.join(' / ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'rejected',
      header: 'Rejected (7d)',
      align: 'right',
      width: 130,
      render: (r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: colors.red }}>
          {r.rejectedCount.toLocaleString('en-GB')}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Total orders (7d)',
      align: 'right',
      width: 150,
      render: (r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.ink70 }}>
          {r.totalOrders.toLocaleString('en-GB')}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Reject rate',
      align: 'right',
      width: 130,
      render: (r) => (
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            color: r.rejectRate > 0.01 ? colors.red : colors.ink70,
          }}
        >
          {pct(r.rejectRate)}
        </span>
      ),
    },
    {
      key: 'flag',
      header: '',
      width: 130,
      render: (r) =>
        r.rejectRate > 0.01 ? <Tag label="> 1% threshold" tone="warning" /> : null,
    },
  ];

  return (
    <Shell
      tabName="Rejected Orders"
      tabTag={TAB_TAGS.rejectedOrders}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/rejected-orders" tabs={applyTabCounts(TABS, counts)} />}
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
          Sites with at least one rejected order in the last 7 days. Service Pack §9.1.1 expects &lt; 1%.
        </div>
      )}
      <PartnerTable
        rows={paged.slice}
        columns={columns}
        rowHrefForId={(r) => `/queue?id=${r.partnerId}`}
        emptyState="No sites with rejected orders in the last 7 days."
      />
      <Pager
        page={paged.page}
        pageSize={paged.pageSize}
        total={paged.total}
        hrefFor={(p) => `/rejected-orders?page=${p}`}
      />
    </Shell>
  );
}
