export const dynamic = 'force-dynamic';

import type { CSSProperties } from 'react';
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
  getOffboardingSignals,
  getPartnerOps,
  getSparklines,
  isLive,
} from '@/lib/bq/use';
import { rankRisk, scoreSite, type RiskBand, type SiteRisk } from '@/lib/offboarding-risk/scoring';
import { buildComplianceByPartner } from '@/lib/triage/compliance';
import { buildInactiveMenuCounts, daysUntilResume } from '@/lib/triage/signals';
import { detectIssues } from '@/lib/triage/activeIssue';
import { applyTabCounts, getTabCounts } from '@/lib/triage/tabCounts';

const { colors, fonts, space, text } = tokens;

const BAND_COLORS: Record<RiskBand, { bg: string; fg: string; border: string }> = {
  green: { bg: colors.greenSoft, fg: colors.green, border: colors.green + '40' },
  amber: { bg: colors.amberSoft, fg: colors.amber, border: colors.amber + '40' },
  red: { bg: colors.redSoft, fg: colors.red, border: colors.red + '40' },
  critical: { bg: colors.red, fg: colors.white, border: colors.red },
};

function BandPill({ band }: { band: RiskBand }) {
  const c = BAND_COLORS[band];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: '2px 10px',
        fontSize: text.xs,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {band}
    </span>
  );
}

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

const triggersListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  fontSize: text.sm,
  color: colors.ink70,
};

export default async function OffboardingRiskPage({ searchParams }: PageProps) {
  const detailId = asString(searchParams.id);

  const [signals, partners, compliance, sparklines, counts, menus] = await Promise.all([
    getOffboardingSignals(),
    getPartnerOps(),
    getCompliance(),
    getSparklines(),
    getTabCounts(),
    getMenuOps(),
  ]);

  const partnersById = new Map(partners.map((p) => [p.partnerId, p]));
  const complianceByPartner = buildComplianceByPartner(partners, compliance);
  const inactiveMenuCounts = buildInactiveMenuCounts(partners, menus);

  const all = signals.map(scoreSite);
  const flagged = all.filter((r) => r.band !== 'green' || r.excluded);
  const flaggedSorted = [...flagged].sort(rankRisk);
  const excludedCount = flagged.filter((r) => r.excluded).length;

  const columns: ColumnDef<SiteRisk>[] = [
    {
      key: 'band',
      header: 'Risk band',
      width: 130,
      render: (r) =>
        r.excluded ? (
          <Tag label="Excluded" tone="warning" />
        ) : (
          <BandPill band={r.band} />
        ),
    },
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
      key: 'triggers',
      header: 'Triggers firing',
      render: (r) =>
        r.triggers.length === 0 ? (
          <span style={{ color: colors.ink50 }}>—</span>
        ) : (
          <ul style={triggersListStyle}>
            {r.triggers.map((t) => (
              <li key={t.trigger} style={{ marginBottom: 2 }}>
                <strong style={{ color: colors.ink }}>{t.band.toUpperCase()}</strong> · {t.explanation}
                <div style={{ fontSize: text.xs, color: colors.ink50 }}>{t.sourceRef}</div>
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: 'action',
      header: 'Recommended action',
      width: 280,
      render: (r) => (
        <span style={{ fontSize: text.sm, color: colors.ink70 }}>{r.recommendedAction}</span>
      ),
    },
  ];

  const detailRisk = detailId ? flaggedSorted.find((r) => r.partnerId === detailId) ?? null : null;
  const detailPartner = detailRisk ? partnersById.get(detailRisk.partnerId) ?? null : null;
  const detailIssues =
    detailPartner
      ? detectIssues({
          openRate7d: detailPartner.openRate7d,
          daysSinceLastOrder: detailPartner.daysSinceLastOrder,
          missingItemsPct7d: detailPartner.missingItemsPct7d,
          riderWait5minPct7d: detailPartner.riderWait5minPct7d,
          rating28d: detailPartner.rating28d,
          overallCompliant: complianceByPartner.get(detailPartner.partnerId)?.row.overallCompliant ?? null,
          hasEmptyComplianceLists:
            complianceByPartner.get(detailPartner.partnerId)?.row.hasEmptyLists ?? false,
          opsStale: detailPartner.opsStale,
          hostStatus: detailPartner.hostStatus,
          daysUntilResume: daysUntilResume(detailPartner.pausedUntil),
          inactiveMenuCount: inactiveMenuCounts.get(detailPartner.partnerId) ?? 0,
        })
      : [];

  return (
    <Shell
      tabName="Offboarding Risk"
      tabTag={TAB_TAGS.offboarding}
      filters={<GlobalFilterBar />}
      tabNav={<TabNav current="/offboarding-risk" tabs={applyTabCounts(TABS, counts)} />}
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
          Showing fixture data. Risk bands trace back to the Service Pack 2025 thresholds.
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: space[4],
          fontSize: text.sm,
          color: colors.ink70,
          marginBottom: space[4],
        }}
      >
        <span>
          <strong>Live view.</strong> Sessions peak window <code>17–21</code> (Looker default).
          Service Pack window <code>17:00–20:59</code> is an open item; trajectory column
          honours both once resolved.
        </span>
      </div>
      <PartnerTable
        rows={flaggedSorted}
        columns={columns}
        rowHrefForId={(r) => `/offboarding-risk?id=${r.partnerId}`}
        emptyState={
          <span>
            No sites at offboarding risk.{' '}
            {excludedCount > 0 && `(${excludedCount} excluded for refurbishment.)`}
          </span>
        }
      />
      {detailRisk && detailPartner && (
        <DetailPanel
          title={detailPartner.partnerName ?? detailPartner.partnerId}
          closeHref="/offboarding-risk"
        >
          <PartnerDetail
            partner={detailPartner}
            compliance={complianceByPartner.get(detailPartner.partnerId) ?? null}
            issues={detailIssues}
            sparkline={sparklines.get(detailPartner.partnerId)}
            extra={
              <section>
                <div
                  style={{
                    fontSize: text.sm,
                    color: colors.ink50,
                    marginBottom: space[2],
                  }}
                >
                  Offboarding triggers
                </div>
                {detailRisk.triggers.length === 0 ? (
                  <div style={{ fontSize: text.sm, color: colors.ink70 }}>
                    No active triggers.
                  </div>
                ) : (
                  <ul style={triggersListStyle}>
                    {detailRisk.triggers.map((t) => (
                      <li key={t.trigger} style={{ marginBottom: 4 }}>
                        <strong>{t.band.toUpperCase()}</strong> · {t.explanation}
                        <div style={{ fontSize: text.xs, color: colors.ink50 }}>
                          {t.sourceRef}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: space[3], fontSize: text.sm, color: colors.ink70 }}>
                  <strong>Action:</strong> {detailRisk.recommendedAction}
                </div>
              </section>
            }
          />
        </DetailPanel>
      )}
    </Shell>
  );
}
