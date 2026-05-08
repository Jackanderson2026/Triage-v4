export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getPartnerOps, isLive } from '@/lib/bq/use';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
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

function gbp(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

type SortKey = 'spend28d' | 'spend7d' | 'spendMtd' | 'ratio';

export default async function AdSpendPage({ searchParams }: PageProps) {
  const sortKey: SortKey = (asString(searchParams.sort) as SortKey) || 'spend28d';
  const partnerType = asString(searchParams.partnerType);
  const brandStack = asString(searchParams.brandStack);
  const hostStatus = asString(searchParams.hostStatus);

  const [partners, counts] = await Promise.all([getPartnerOps(), getTabCounts()]);

  const filtered = partners
    .filter((p) => p.adSpend28d > 0)
    .filter((p) => (partnerType ? p.partnerType === partnerType : true))
    .filter((p) => (brandStack ? p.brandStack?.toLowerCase().includes(brandStack.toLowerCase()) : true))
    .filter((p) => (hostStatus ? p.hostStatus === hostStatus : true))
    .map((p) => ({
      ...p,
      ratio: p.gmv28d > 0 ? p.adSpend28d / p.gmv28d : 0,
    }))
    .sort((a, b) => {
      switch (sortKey) {
        case 'spend7d':
          return b.adSpend7d - a.adSpend7d;
        case 'spendMtd':
          return b.adSpendMtd - a.adSpendMtd;
        case 'ratio':
          return b.ratio - a.ratio;
        case 'spend28d':
        default:
          return b.adSpend28d - a.adSpend28d;
      }
    });

  const columns: ColumnDef<PartnerOpsRow & { ratio: number }>[] = [
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
      key: 'spend7d',
      header: (
        <a href={hrefFor('spend7d', partnerType, brandStack, hostStatus)} style={sortHeader(sortKey === 'spend7d')}>
          7d spend
        </a>
      ) as unknown as string,
      align: 'right',
      width: 120,
      render: (p) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{gbp(p.adSpend7d)}</span>
      ),
    },
    {
      key: 'spend28d',
      header: (
        <a href={hrefFor('spend28d', partnerType, brandStack, hostStatus)} style={sortHeader(sortKey === 'spend28d')}>
          28d spend
        </a>
      ) as unknown as string,
      align: 'right',
      width: 120,
      render: (p) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: colors.ink }}>
          {gbp(p.adSpend28d)}
        </span>
      ),
    },
    {
      key: 'spendMtd',
      header: (
        <a href={hrefFor('spendMtd', partnerType, brandStack, hostStatus)} style={sortHeader(sortKey === 'spendMtd')}>
          MTD spend
        </a>
      ) as unknown as string,
      align: 'right',
      width: 120,
      render: (p) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.ink70 }}>{gbp(p.adSpendMtd)}</span>
      ),
    },
    {
      key: 'ratio',
      header: (
        <a href={hrefFor('ratio', partnerType, brandStack, hostStatus)} style={sortHeader(sortKey === 'ratio')}>
          Spend / 28d GMV
        </a>
      ) as unknown as string,
      align: 'right',
      width: 150,
      render: (p) => {
        if (p.ratio === 0) return <span style={{ color: colors.ink50 }}>—</span>;
        const high = p.ratio > 0.05;
        return (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: high ? colors.amber : colors.ink70,
              fontWeight: high ? 700 : 500,
            }}
          >
            {(p.ratio * 100).toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: 'offers',
      header: 'Offers running',
      render: (p) =>
        p.offerTypes.length === 0 ? (
          <span style={{ color: colors.ink50, fontSize: text.xs }}>—</span>
        ) : (
          <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
            {p.offerTypes.map((t) => (
              <Tag key={t} label={t} tone="info" />
            ))}
          </div>
        ),
    },
  ];

  return (
    <Shell
      tabName="Ad Spend"
      tabTag={TAB_TAGS.adSpend}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/ad-spend" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture ad spend data. Source: marketing.ppc_daily_pos_code (Brief §6 metric 7).
        </div>
      )}
      <PartnerTable
        rows={filtered}
        columns={columns}
        rowHrefForId={(p) => `/queue?id=${p.partnerId}`}
        emptyState="No partners with ad spend in the last 28 days."
      />
    </Shell>
  );
}

function hrefFor(
  sort: SortKey,
  partnerType: string | null,
  brandStack: string | null,
  hostStatus: string | null,
): string {
  const params = new URLSearchParams();
  params.set('sort', sort);
  if (partnerType) params.set('partnerType', partnerType);
  if (brandStack) params.set('brandStack', brandStack);
  if (hostStatus) params.set('hostStatus', hostStatus);
  return `/ad-spend?${params.toString()}`;
}

function sortHeader(active: boolean): React.CSSProperties {
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
