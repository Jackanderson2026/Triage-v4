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
import type { ComplianceRow } from '@/lib/bq/queries/compliance';
import { buildComplianceByPartner, formatScoreMonth } from '@/lib/triage/compliance';
import { detectIssues } from '@/lib/triage/activeIssue';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';

const { colors, fonts, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function gbp(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

export default async function NonCompliantPage({ searchParams }: PageProps) {
  const typeFilter = asString(searchParams.nonCompliantType);
  const detailVenueId = asString(searchParams.id);

  const [compliance, partners, sparklines, counts] = await Promise.all([
    getCompliance(),
    getPartnerOps(),
    getSparklines(),
    getTabCounts(),
  ]);

  const flagged = compliance
    .filter((c) => !c.overallCompliant)
    .filter((c) => {
      if (!typeFilter) return true;
      if (typeFilter === 'food') return !c.foodCompliant;
      if (typeFilter === 'packaging') return !c.packagingCompliant;
      return true;
    })
    .sort(
      (a, b) =>
        (b.gmv28d ?? -Infinity) - (a.gmv28d ?? -Infinity) ||
        b.scoreMonth.localeCompare(a.scoreMonth),
    );

  const columns: ColumnDef<ComplianceRow>[] = [
    {
      key: 'venue',
      header: 'Venue',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: colors.ink, fontSize: text.base }}>
            {r.venueName ?? r.venueId}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            Score month: {formatScoreMonth(r.scoreMonth)}
          </div>
        </div>
      ),
    },
    {
      key: 'gmv',
      header: '28d GMV',
      align: 'right',
      render: (r) => (
        <span
          style={{ fontVariantNumeric: 'tabular-nums', color: colors.ink, fontWeight: 600 }}
        >
          {gbp(r.gmv28d)}
        </span>
      ),
    },
    {
      key: 'flags',
      header: 'Flags',
      render: (r) => (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          {!r.foodCompliant && <Tag label="Food" tone="warning" />}
          {!r.packagingCompliant && <Tag label="Packaging" tone="warning" />}
          {r.hasEmptyLists && <Tag label="Data-quality flag" tone="info" />}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Top non-compliant items',
      render: (r) => {
        const all = [
          ...r.nonCompliantFood.map((i) => `[Food] ${i}`),
          ...r.nonCompliantPackaging.map((i) => `[Packaging] ${i}`),
        ];
        if (all.length === 0) {
          return <span style={{ color: colors.ink50, fontSize: text.sm }}>—</span>;
        }
        const top = all.slice(0, 2);
        const more = all.length - top.length;
        return (
          <div style={{ fontSize: text.sm, color: colors.ink70 }}>
            {top.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {more > 0 && (
              <div style={{ fontSize: text.xs, color: colors.ink50 }}>+ {more} more</div>
            )}
          </div>
        );
      },
    },
  ];

  // The detail panel is partner-shaped (Brief §7.0). Pick the partner whose
  // serveVenueIds contain the detail venueId.
  const detailVenue = detailVenueId
    ? flagged.find((c) => c.venueId === detailVenueId) ?? null
    : null;
  const detailPartner = detailVenue
    ? partners.find((p) => p.serveVenueIds.includes(detailVenue.venueId)) ?? null
    : null;
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
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
      tabName="Non-Compliant by GMV"
      tabTag={TAB_TAGS.nonCompliant}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/non-compliant" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture compliance data. Source: serve.prod_venues_sessions_score_stg (monthly snapshot).
        </div>
      )}
      <PartnerTable
        rows={flagged}
        columns={columns}
        rowHrefForId={(r) => `/non-compliant?id=${r.venueId}`}
        emptyState="No non-compliant venues in the latest score month."
      />
      {detailVenue && (
        <DetailPanel
          title={detailVenue.venueName ?? detailVenue.venueId}
          closeHref="/non-compliant"
        >
          {detailPartner ? (
            <PartnerDetail
              partner={detailPartner}
              compliance={complianceByPartner.get(detailPartner.partnerId) ?? null}
              issues={detailIssues}
              sparkline={sparklines.get(detailPartner.partnerId)}
            />
          ) : (
            <div style={{ fontSize: text.sm, color: colors.ink70, fontFamily: fonts.body }}>
              Could not match this venue ({detailVenue.venueId}) to a partner record. The
              compliance row exists but the venue isn&apos;t mapped to any partner&apos;s
              serveVenueIds — likely a closed/migrated venue. Check HubSpot.
            </div>
          )}
        </DetailPanel>
      )}
    </Shell>
  );
}
