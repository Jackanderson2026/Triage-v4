export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { DetailPanel } from '@/components/layout/DetailPanel';
import { PartnerDetail } from '@/components/layout/PartnerDetail';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getCompliance, getMenuOps, getPartnerOps, getSparklines, isLive } from '@/lib/bq/use';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
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

interface PausedView extends PartnerOpsRow {
  weeksPaused: number | null;
  daysUntilResume: number | null;
}

function diffDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  return Math.floor((b - a) / 86400000);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PausedPage({ searchParams }: PageProps) {
  const filter = asString(searchParams.resume);
  const detailId = asString(searchParams.id);

  const [partners, compliance, sparklines, counts, menus] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
    getMenuOps(),
  ]);
  const today = todayIso();
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  const views: PausedView[] = partners
    .filter((p) => p.hostStatus === 'paused')
    .map((p) => {
      let weeksPaused: number | null = null;
      if (p.pausedFrom) {
        const days = diffDays(p.pausedFrom, p.pausedUntil ?? today);
        weeksPaused = days === null ? null : Math.floor(days / 7);
      }
      const daysUntilResume = p.pausedUntil ? diffDays(today, p.pausedUntil) : null;
      return { ...p, weeksPaused, daysUntilResume };
    })
    .filter((v) => {
      if (!filter) return true;
      if (filter === 'open_ended') return v.daysUntilResume === null;
      if (filter === 'overdue') return v.daysUntilResume !== null && v.daysUntilResume < 0;
      if (filter === 'upcoming') return v.daysUntilResume !== null && v.daysUntilResume >= 0;
      return true;
    })
    .sort((a, b) => {
      const wa = a.weeksPaused ?? -1;
      const wb = b.weeksPaused ?? -1;
      if (wa !== wb) return wb - wa;
      const ra = a.daysUntilResume ?? Number.POSITIVE_INFINITY;
      const rb = b.daysUntilResume ?? Number.POSITIVE_INFINITY;
      return ra - rb;
    });

  const columns: ColumnDef<PausedView>[] = [
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
      key: 'pausedFrom',
      header: 'Paused from',
      render: (p) => <span style={{ color: colors.ink70 }}>{p.pausedFrom ?? '—'}</span>,
    },
    {
      key: 'pausedUntil',
      header: 'Paused until',
      render: (p) =>
        p.pausedUntil === null ? (
          <Tag label="Open-ended" />
        ) : (
          <span style={{ color: colors.ink70 }}>{p.pausedUntil}</span>
        ),
    },
    {
      key: 'weeks',
      header: 'Weeks paused',
      align: 'right',
      render: (p) =>
        p.weeksPaused === null ? '—' : (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {p.weeksPaused}w
          </span>
        ),
    },
    {
      key: 'resume',
      header: 'Days until resume',
      align: 'right',
      render: (p) => {
        if (p.daysUntilResume === null) return <span style={{ color: colors.ink50 }}>—</span>;
        const overdue = p.daysUntilResume < 0;
        return (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: overdue ? colors.amber : colors.ink70,
              fontWeight: overdue ? 700 : 500,
            }}
          >
            {overdue ? `${Math.abs(p.daysUntilResume)}d overdue` : `${p.daysUntilResume}d`}
          </span>
        );
      },
    },
  ];

  const detail = detailId ? views.find((v) => v.partnerId === detailId) ?? null : null;
  const detailIssues = detail
    ? detectIssues({
        openRate7d: detail.openRate7d,
        daysSinceLastOrder: detail.daysSinceLastOrder,
        missingItemsPct7d: detail.missingItemsPct7d,
        riderWait5minPct7d: detail.riderWait5minPct7d,
        rating28d: detail.rating28d,
        overallCompliant: complianceByPartner.get(detail.partnerId)?.row.overallCompliant ?? null,
        hasEmptyComplianceLists:
          complianceByPartner.get(detail.partnerId)?.row.hasEmptyLists ?? false,
        opsStale: detail.opsStale,
        hostStatus: detail.hostStatus,
        daysUntilResume: daysUntilResume(detail.pausedUntil),
        inactiveMenuCount: inactiveMenuCounts.get(detail.partnerId) ?? 0,
      })
    : [];

  return (
    <Shell
      tabName="Paused"
      tabTag={TAB_TAGS.paused}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/paused" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture data. Source: pos_code_detail_prod.date_company_entered_pause_status / date_company_paused_until. Paused reason is not stored.
        </div>
      )}
      <PartnerTable
        rows={views}
        columns={columns}
        rowHrefForId={(p) => `/paused?id=${p.partnerId}`}
        emptyState="No paused partners."
      />
      {detail && (
        <DetailPanel
          title={detail.partnerName ?? detail.partnerId}
          closeHref="/paused"
        >
          <PartnerDetail
            partner={detail}
            compliance={complianceByPartner.get(detail.partnerId) ?? null}
            issues={detailIssues}
            sparkline={sparklines.get(detail.partnerId)}
            extra={
              <section>
                <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>
                  Pause window
                </div>
                <div style={{ fontSize: text.sm, color: colors.ink70 }}>
                  From {detail.pausedFrom ?? '—'} → until {detail.pausedUntil ?? 'open-ended'}
                  {detail.weeksPaused !== null && ` · ${detail.weeksPaused}w paused`}
                  {detail.daysUntilResume !== null &&
                    detail.daysUntilResume < 0 &&
                    ` · ${Math.abs(detail.daysUntilResume)}d overdue`}
                </div>
                <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: space[1] }}>
                  Paused reason is not stored — check HubSpot for context.
                </div>
              </section>
            }
          />
        </DetailPanel>
      )}
    </Shell>
  );
}
