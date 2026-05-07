export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { GlobalFilterBar } from '@/components/layout/GlobalFilterBar';
import { DetailPanel } from '@/components/layout/DetailPanel';
import { PartnerDetail } from '@/components/layout/PartnerDetail';
import { AnnotationButton } from '@/components/layout/AnnotationButton';
import { PartnerTable, type ColumnDef } from '@/components/tables/PartnerTable';
import { IssuePill, MetricChip, Tag, tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getCompliance, getPartnerOps, getSparklines, isLive } from '@/lib/bq/use';
import { listActiveAnnotations } from '@/lib/annotations';
import { detectIssues, selectActiveIssue, activeIssueLabel } from '@/lib/triage/activeIssue';
import { ISSUE_CATALOGUE, compareIssueSeverity, type IssueCode } from '@/lib/triage/hierarchy';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import { OPEN_RATE_BENCHMARK, MISSING_ITEMS_INTERNAL_TARGET, RATING_TARGET } from '@/lib/triage/thresholds';
import { buildComplianceByPartner, type PartnerCompliance } from '@/lib/triage/compliance';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';

const { colors, fonts, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

interface PartnerView {
  partner: PartnerOpsRow;
  issues: IssueCode[];
  activeIssue: IssueCode | null;
  annotation: { type: string; note: string | null; actor: string } | null;
  compliance: PartnerCompliance | null;
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
function pct(n: number | null): string {
  return n === null ? '—' : `${(n * 100).toFixed(1)}%`;
}
function num(n: number | null, digits = 1): string {
  return n === null ? '—' : n.toFixed(digits);
}

export default async function QueuePage({ searchParams }: PageProps) {
  const partnerType = asString(searchParams.partnerType);
  const brandStack = asString(searchParams.brandStack);
  const detailId = asString(searchParams.id);

  const [partners, compliance, sparklines, counts] = await Promise.all([
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
  ]);
  const annotations = await listActiveAnnotations(partners.map((p) => p.partnerId));
  const complianceByPartner = buildComplianceByPartner(partners, compliance);

  const views: PartnerView[] = partners
    .filter((p) => (partnerType ? p.partnerType === partnerType : true))
    .filter((p) => (brandStack ? p.brandStack?.includes(brandStack) : true))
    .map((partner) => {
      const pcomp = complianceByPartner.get(partner.partnerId) ?? null;
      const cRow = pcomp?.row ?? null;
      const issues = detectIssues({
        openRate7d: partner.openRate7d,
        daysSinceLastOrder: partner.daysSinceLastOrder,
        missingItemsPct7d: partner.missingItemsPct7d,
        riderWait5minPct7d: partner.riderWait5minPct7d,
        rejectedRate7d: partner.rejectedRate7d,
        rating28d: partner.rating28d,
        overallCompliant: cRow ? cRow.overallCompliant : null,
        hasEmptyComplianceLists: cRow ? cRow.hasEmptyLists : false,
        opsStale: partner.opsStale,
        isOnDeliveroo: partner.isOnDeliveroo,
      });
      const activeIssue = selectActiveIssue(issues);
      const ann = annotations.get(partner.partnerId);
      return {
        partner,
        issues,
        activeIssue,
        annotation: ann
          ? { type: ann.annotationType, note: ann.note, actor: ann.actor }
          : null,
        compliance: pcomp,
      };
    })
    .filter((v) => v.annotation?.type !== 'churned' && v.annotation?.type !== 'paused')
    .sort((a, b) => {
      if (a.activeIssue && b.activeIssue) {
        const sev = compareIssueSeverity(a.activeIssue, b.activeIssue);
        if (sev !== 0) return sev;
      }
      if (a.activeIssue && !b.activeIssue) return -1;
      if (!a.activeIssue && b.activeIssue) return 1;
      return b.partner.gmv28d - a.partner.gmv28d;
    });

  const columns: ColumnDef<PartnerView>[] = [
    {
      key: 'issue',
      header: 'Active issue',
      width: 220,
      render: (v) =>
        v.activeIssue ? (
          <IssuePill kind={ISSUE_CATALOGUE[v.activeIssue].kind} label={activeIssueLabel(v.activeIssue)} />
        ) : (
          <span style={{ color: colors.ink50 }}>—</span>
        ),
    },
    {
      key: 'partner',
      header: 'Partner',
      render: (v) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: text.base, color: colors.ink }}>
            {v.partner.partnerName ?? v.partner.partnerId}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            {v.partner.brandStack ?? 'Brand stack —'} · {v.partner.platforms.join(' / ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {v.partner.hostStatus && <Tag label={v.partner.hostStatus} />}
          {v.annotation && <Tag label={`note: ${v.annotation.type}`} tone="info" />}
        </div>
      ),
    },
    {
      key: 'metrics',
      header: 'Key metrics (7d)',
      render: (v) => (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <MetricChip label="GMV" value={gbp(v.partner.gmv7d)} />
          <MetricChip
            label="Open rate"
            value={pct(v.partner.openRate7d)}
            state={
              v.partner.openRate7d !== null && v.partner.openRate7d < OPEN_RATE_BENCHMARK
                ? 'bad'
                : 'neutral'
            }
          />
          <MetricChip
            label="Missing"
            value={pct(v.partner.missingItemsPct7d)}
            state={
              v.partner.missingItemsPct7d !== null && v.partner.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET
                ? 'bad'
                : 'neutral'
            }
          />
          <MetricChip
            label="Rating"
            value={num(v.partner.rating28d, 2)}
            state={
              v.partner.rating28d !== null && v.partner.rating28d < RATING_TARGET
                ? 'bad'
                : 'neutral'
            }
          />
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Last order',
      align: 'right',
      render: (v) => (
        <span style={{ color: colors.ink70 }}>
          {v.partner.daysSinceLastOrder === null
            ? 'Never'
            : v.partner.daysSinceLastOrder === 0
              ? 'Today'
              : `${v.partner.daysSinceLastOrder}d ago`}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 120,
      render: (v) => (
        <AnnotationButton
          partnerId={v.partner.partnerId}
          partnerName={v.partner.partnerName ?? v.partner.partnerId}
        />
      ),
    },
  ];

  const detail = detailId ? views.find((v) => v.partner.partnerId === detailId) : null;

  const filterParams = new URLSearchParams();
  if (partnerType) filterParams.set('partnerType', partnerType);
  if (brandStack) filterParams.set('brandStack', brandStack);
  const closeHref = `/queue${filterParams.toString() ? `?${filterParams.toString()}` : ''}`;

  return (
    <Shell
      tabName="Triage Queue"
      tabTag={TAB_TAGS.queue}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/queue" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture data. GOOGLE_APPLICATION_CREDENTIALS_JSON is not set — the
          Vercel preview will switch to live BigQuery once the data team grants the
          service account.
        </div>
      )}
      <PartnerTable
        rows={views}
        columns={columns}
        rowHrefForId={(v) => {
          const next = new URLSearchParams(filterParams.toString());
          next.set('id', v.partner.partnerId);
          return `/queue?${next.toString()}`;
        }}
        emptyState={
          partnerType || brandStack
            ? 'No partners match the current filters. Clear filters to see all.'
            : 'No partners with active issues. Check back after the next data refresh.'
        }
      />
      {detail && (
        <DetailPanel
          title={detail.partner.partnerName ?? detail.partner.partnerId}
          closeHref={closeHref}
        >
          <PartnerDetail
            partner={detail.partner}
            compliance={detail.compliance}
            issues={detail.issues}
            sparkline={sparklines.get(detail.partner.partnerId)}
          />
        </DetailPanel>
      )}
    </Shell>
  );
}
