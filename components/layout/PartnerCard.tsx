'use client';

// V3-style card layout for the queue. Each partner is a card with a coloured
// left border (issue tier), inline metrics + sparkline on the right, and
// inline expand-down for detail (AI summary, brand sub-rows, metric chips,
// large sparklines).
//
// Triggered via state — clicking the card toggles expand. Brand sub-rows are
// nested cards inside the expanded section.

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { IssuePill, MetricChip, SparkLine, Tag, tokens } from '@/components/primitives';
import { ComplianceBlock } from './ComplianceBlock';
import { TagModal, type AnnotationType as TagAnnotationType } from '@/components/primitives/TagModal';
import { createAnnotation } from '@/lib/annotations';
import { generateSummary } from '@/lib/ai/summary';
import { ISSUE_CATALOGUE, type IssueCode } from '@/lib/triage/hierarchy';
import { activeIssueLabel } from '@/lib/triage/activeIssue';
import { HOST_STATUS_PAUSED } from '@/lib/triage/enums';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import type { BrandOpsRow } from '@/lib/bq/queries/brandOps';
import type { PartnerSparkline } from '@/lib/bq/queries/sparklines';
import type { PartnerPlatformRow } from '@/lib/bq/queries/platformOps';
import type { PartnerCompliance } from '@/lib/triage/compliance';
import {
  MISSING_ITEMS_INTERNAL_TARGET,
  OPEN_RATE_BENCHMARK,
  RATING_TARGET,
  RIDER_WAIT_BENCHMARK,
} from '@/lib/triage/thresholds';

const { colors, fonts, radii, space, text } = tokens;

const KIND_COLOR: Record<string, string> = {
  platform: colors.red,
  compliance: colors.red,
  operations: colors.amber,
  commercial: colors.blue,
  growth: colors.ink70,
  behaviour: colors.ink70,
};

function fmtGbp(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : `${(n * 100).toFixed(1)}%`;
}

function fmtRating(n: number | null): string {
  return n === null ? '—' : n.toFixed(2);
}

interface AnnotationView {
  type: TagAnnotationType;
  note: string | null;
  actor: string;
}

export interface PartnerCardProps {
  partner: PartnerOpsRow;
  rank: number;
  activeIssue: IssueCode | null;
  issues: IssueCode[];
  compliance: PartnerCompliance | null;
  sparkline: PartnerSparkline | undefined;
  brands: BrandOpsRow[];
  /** Per-platform breakdown shown on expand. Empty array = no platform split rendered. */
  platforms: PartnerPlatformRow[];
  annotation: AnnotationView | null;
  daysUntilResume: number | null;
  /** Which GMV figure to surface in the inline header row.
   * 'gmv7d' (default, queue) | 'avgWeekly4w' (top-partners). */
  headlineGmv?: 'gmv7d' | 'avgWeekly4w';
  /** Other tabs this partner also appears in — shown as "also in" badges so
   * AMs don't double-action. e.g. ['Offboarding Risk']. */
  alsoIn?: string[];
}

export function PartnerCard(props: PartnerCardProps) {
  const {
    partner, rank, activeIssue, issues, compliance, sparkline, brands, platforms, annotation,
    daysUntilResume, headlineGmv = 'gmv7d', alsoIn = [],
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const accentColor = activeIssue ? KIND_COLOR[ISSUE_CATALOGUE[activeIssue].kind] ?? colors.ink70 : colors.ink30;

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && summary === null && !summaryLoading) {
      void loadSummary();
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const bullets = await generateSummary({
        partner,
        issues,
        sparkline,
        brands,
      });
      setSummary(bullets);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setSummary([`• Summary failed: ${msg}`]);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSaveAnnotation = (annType: TagAnnotationType, note: string) => {
    start(async () => {
      try {
        await createAnnotation(partner.partnerId, annType, note || null);
        setTagOpen(false);
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    });
  };

  const cardStyle: CSSProperties = {
    background: annotation?.type === 'actioned' ? colors.ink05 : colors.white,
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${annotation?.type === 'actioned' ? colors.ink30 : accentColor}`,
    borderRadius: radii.md,
    padding: `${space[3]} ${space[4]}`,
    marginBottom: space[2],
    cursor: 'pointer',
    fontFamily: fonts.body,
    opacity: annotation?.type === 'actioned' ? 0.7 : 1,
  };

  return (
    <div style={cardStyle} onClick={handleExpand}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        {/* Rank circle */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: colors.ink05,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: colors.ink70,
            flexShrink: 0,
          }}
        >
          {rank}
        </div>

        {/* Name + status pills + meta */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: text.base, fontWeight: 600, color: colors.ink }}>
              {partner.partnerName ?? partner.partnerId}
            </span>
            {annotation?.type === 'churned' && <Tag label="Churned" tone="warning" />}
            {annotation?.type === 'paused' && <Tag label="Paused (snoozed)" tone="info" />}
            {annotation?.type === 'actioned' && <Tag label="Actioned" tone="info" />}
            {annotation?.type === 'known_issue' && <Tag label="Known issue" tone="info" />}
            {partner.hostStatus === HOST_STATUS_PAUSED && daysUntilResume !== null && daysUntilResume < 0 && (
              <Tag label={`${Math.abs(daysUntilResume)}d overdue`} tone="warning" />
            )}
            {alsoIn.map((tab) => (
              <span
                key={tab}
                title={`Also surfaced in ${tab} — coordinate so this partner isn't actioned twice.`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: colors.blueSoft,
                  color: colors.blue,
                  border: `1px solid ${colors.blue}30`,
                  borderRadius: radii.sm,
                  padding: '1px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                ↗ also in {tab}
              </span>
            ))}
          </div>
          <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>
            {partner.partnerType ?? '—'}
            {partner.brandStack && <span style={{ marginLeft: space[2] }}>· {partner.brandStack}</span>}
            {brands.length > 0 && <span style={{ marginLeft: space[2] }}>· {brands.length} brand{brands.length > 1 ? 's' : ''}</span>}
            <span style={{ marginLeft: space[2] }}>· {partner.platforms.join(' / ') || '—'}</span>
          </div>
        </div>

        {/* Active issue pill */}
        {activeIssue && (
          <IssuePill kind={ISSUE_CATALOGUE[activeIssue].kind} label={activeIssueLabel(activeIssue)} />
        )}

        {/* Inline metrics + sparkline */}
        <div style={{ display: 'flex', gap: space[4], alignItems: 'center' }}>
          {partner.orders7d > 0 && (
            <NumStack label="orders" value={partner.orders7d.toLocaleString('en-GB')} />
          )}
          {headlineGmv === 'avgWeekly4w'
            ? partner.avgWeeklyGmv4w > 0 && (
                <NumStack label="avg /wk · 4w" value={fmtGbp(partner.avgWeeklyGmv4w)} />
              )
            : partner.gmv7d > 0 && <NumStack label="7d gmv" value={fmtGbp(partner.gmv7d)} />}
          {sparkline && sparkline.gmv.some((v) => v > 0) && (
            <SparkLine values={sparkline.gmv} color={accentColor} width={80} height={28} />
          )}
        </div>

        {/* Action button */}
        <button
          type="button"
          style={actionButtonStyle(pending)}
          onClick={(e) => {
            e.stopPropagation();
            setTagOpen(true);
          }}
          disabled={pending}
        >
          {annotation ? 'Edit' : '+ Action'}
        </button>

        <span style={{ color: colors.ink50, fontSize: text.xs, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          style={{ marginTop: space[4], paddingTop: space[4], borderTop: `1px solid ${colors.border}` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* AI summary */}
          <div
            style={{
              background: '#f8faff',
              border: `1px solid #dbeafe`,
              borderRadius: radii.md,
              padding: `${space[3]} ${space[4]}`,
              marginBottom: space[4],
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: colors.blue,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 700,
                marginBottom: space[2],
              }}
            >
              AI Summary
            </div>
            {summaryLoading && (
              <div style={{ fontSize: text.sm, color: colors.ink70 }}>Analysing performance…</div>
            )}
            {summary?.map((bullet, i) => (
              <div key={i} style={{ fontSize: text.sm, color: colors.ink, marginBottom: 4, lineHeight: 1.5 }}>
                {bullet}
              </div>
            ))}
          </div>

          {/* Annotation note */}
          {annotation?.note && (
            <div
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.md,
                padding: `${space[3]} ${space[4]}`,
                marginBottom: space[4],
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: colors.ink50,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  marginBottom: space[1],
                }}
              >
                {annotation.type.replace('_', ' ')} · {annotation.actor}
              </div>
              <div style={{ fontSize: text.sm, color: colors.ink }}>{annotation.note}</div>
            </div>
          )}

          {/* Compliance + issues firing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[5], marginBottom: space[4] }}>
            <ComplianceBlock compliance={compliance} />
            <section>
              <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>Issues firing</div>
              {issues.length === 0 ? (
                <div style={{ fontSize: text.sm, color: colors.ink70 }}>None.</div>
              ) : (
                <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                  {issues.map((code) => (
                    <IssuePill key={code} kind={ISSUE_CATALOGUE[code].kind} label={activeIssueLabel(code)} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Metric chips grid */}
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[4] }}>
            <MetricChip
              label="Rating"
              value={fmtRating(partner.rating28d)}
              state={partner.rating28d !== null && partner.rating28d < RATING_TARGET ? 'bad' : 'neutral'}
              sparkline={sparkline?.rating}
            />
            <MetricChip
              label="Open Rate"
              value={fmtPct(partner.openRate7d)}
              state={partner.openRate7d !== null && partner.openRate7d < OPEN_RATE_BENCHMARK ? 'bad' : 'neutral'}
              sparkline={sparkline?.openRate}
            />
            <MetricChip
              label="Missing Items"
              value={fmtPct(partner.missingItemsPct7d)}
              state={partner.missingItemsPct7d !== null && partner.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET ? 'bad' : 'neutral'}
              sparkline={sparkline?.missingItems}
            />
            <MetricChip
              label="Rider Wait"
              value={fmtPct(partner.riderWait5minPct7d)}
              state={partner.riderWait5minPct7d !== null && partner.riderWait5minPct7d > RIDER_WAIT_BENCHMARK ? 'bad' : 'neutral'}
              sparkline={sparkline?.riderWait}
            />
            {partner.rejectedCount7d > 0 && (
              <MetricChip label="Rejected (7d)" value={partner.rejectedCount7d.toString()} state="bad" />
            )}
            <MetricChip label="AOV" value={fmtGbp(partner.aov7d)} />
            <MetricChip label="Prep mins" value={partner.prepMinutes7d?.toFixed(1) ?? '—'} />
            <MetricChip label="28d GMV" value={fmtGbp(partner.gmv28d)} />
            <MetricChip label="Ad spend (7d)" value={fmtGbp(partner.adSpend7d)} />
            <MetricChip label="Ad spend (28d)" value={fmtGbp(partner.adSpend28d)} />
            <MetricChip
              label="Discount %"
              value={partner.gmv28d > 0 ? `${((partner.discountValue28d / partner.gmv28d) * 100).toFixed(1)}%` : '—'}
            />
            {partner.offerTypes.length > 0 && (
              <MetricChip label="Offers" value={partner.offerTypes.join(', ')} />
            )}
          </div>

          {/* Per-platform breakdown */}
          {platforms.length > 0 && (
            <section style={{ marginBottom: space[4] }}>
              <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>
                By platform ({platforms.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: space[2] }}>
                {platforms.map((pl) => (
                  <PlatformTile key={pl.platform} row={pl} />
                ))}
              </div>
            </section>
          )}

          {/* Brand sub-rows */}
          {brands.length > 0 && (
            <section style={{ marginBottom: space[4] }}>
              <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>
                Brands ({brands.length})
              </div>
              {brands.map((b) => (
                <BrandRow key={b.brandName} brand={b} />
              ))}
            </section>
          )}

          {/* Quick links */}
          <section>
            <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>Quick links</div>
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
              {partner.hubspotCompanyId && (
                <a
                  href={`https://app.hubspot.com/contacts/0/company/${partner.hubspotCompanyId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: colors.grape, fontSize: text.sm }}
                >
                  Open in HubSpot
                </a>
              )}
              <a href={`#${partner.partnerId}`} style={{ color: colors.grape, fontSize: text.sm }}>
                Copy partner ID
              </a>
            </div>
          </section>
        </div>
      )}

      {tagOpen && (
        <TagModal
          partnerName={partner.partnerName ?? partner.partnerId}
          onClose={() => setTagOpen(false)}
          onSave={handleSaveAnnotation}
        />
      )}
    </div>
  );
}

function NumStack({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: text.base, fontWeight: 700, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: colors.ink50, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  );
}

function actionButtonStyle(pending: boolean): CSSProperties {
  return {
    padding: `${space[1]} ${space[3]}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    fontSize: text.xs,
    fontWeight: 600,
    color: colors.ink70,
    background: colors.white,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    opacity: pending ? 0.5 : 1,
  };
}

// Brand sub-row — collapsed shows brand name + active issue + chip + mini sparkline.
// Click expands to a metrics grid + larger sparklines.
function BrandRow({ brand }: { brand: BrandOpsRow }) {
  const [open, setOpen] = useState(false);
  const ratingBad = brand.rating28d !== null && brand.rating28d < RATING_TARGET;
  const missBad = brand.missingItemsPct7d !== null && brand.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET;
  const accent = ratingBad || missBad ? colors.red : colors.green;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setOpen(!open);
      }}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: radii.sm,
        padding: `${space[2]} ${space[3]}`,
        marginBottom: space[1],
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ flex: 1, fontSize: text.sm, fontWeight: 600, color: colors.ink }}>{brand.brandName}</div>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          {brand.orders7d > 0 && <NumStack label="orders" value={brand.orders7d.toLocaleString('en-GB')} />}
          {brand.gmv7d > 0 && <NumStack label="7d gmv" value={fmtGbp(brand.gmv7d)} />}
          <SparkLine values={brand.weeks.map((w) => w.gmv)} color={accent} width={80} height={24} />
          <span style={{ color: colors.ink50, fontSize: text.xs }}>{open ? '▴' : '▾'}</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <MetricChip
              label="Rating"
              value={fmtRating(brand.rating28d)}
              state={ratingBad ? 'bad' : 'neutral'}
              sparkline={brand.weeks.map((w) => w.rating)}
            />
            <MetricChip
              label="Open Rate"
              value={fmtPct(brand.openRate7d)}
              state={brand.openRate7d !== null && brand.openRate7d < OPEN_RATE_BENCHMARK ? 'bad' : 'neutral'}
              sparkline={brand.weeks.map((w) => w.openRate)}
            />
            <MetricChip
              label="Missing Items"
              value={fmtPct(brand.missingItemsPct7d)}
              state={missBad ? 'bad' : 'neutral'}
              sparkline={brand.weeks.map((w) => w.missingItemsPct)}
            />
            <MetricChip
              label="Rider Wait"
              value={fmtPct(brand.riderWait5minPct7d)}
              state={brand.riderWait5minPct7d !== null && brand.riderWait5minPct7d > RIDER_WAIT_BENCHMARK ? 'bad' : 'neutral'}
            />
            {brand.rejectedCount7d > 0 && (
              <MetricChip label="Rejected (7d)" value={brand.rejectedCount7d.toString()} state="bad" />
            )}
            <MetricChip label="Ad spend (7d)" value={fmtGbp(brand.adSpend7d)} />
            <MetricChip
              label="Discount %"
              value={brand.gmv7d > 0 ? `${((brand.discountValue7d / brand.gmv7d) * 100).toFixed(1)}%` : '—'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Compact per-platform tile rendered in the partner-card expand. One per
// platform the partner is live on. Bad cell colours mirror the queue thresholds.
function PlatformTile({ row }: { row: PartnerPlatformRow }) {
  const ratingBad = row.rating28d !== null && row.rating28d < RATING_TARGET;
  const openRateBad = row.openRate7d !== null && row.openRate7d < OPEN_RATE_BENCHMARK;
  const missBad = row.missingItemsPct7d !== null && row.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET;
  const riderBad = row.riderWait5minPct7d !== null && row.riderWait5minPct7d > RIDER_WAIT_BENCHMARK;
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.sm,
        padding: `${space[2]} ${space[3]}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[2] }}>
        <strong style={{ fontSize: text.sm, color: colors.ink, letterSpacing: '0.04em' }}>{row.platform}</strong>
        <span style={{ fontSize: text.xs, color: colors.ink50 }}>{row.orders7d.toLocaleString('en-GB')} orders 7d</span>
      </div>
      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
        <MiniCell label="7d GMV" value={fmtGbp(row.gmv7d)} />
        <MiniCell label="28d GMV" value={fmtGbp(row.gmv28d)} />
        <MiniCell label="Rating" value={fmtRating(row.rating28d)} bad={ratingBad} />
        <MiniCell label="Open" value={fmtPct(row.openRate7d)} bad={openRateBad} />
        <MiniCell label="Miss" value={fmtPct(row.missingItemsPct7d)} bad={missBad} />
        {row.riderWait5minPct7d !== null && (
          <MiniCell label="Rider" value={fmtPct(row.riderWait5minPct7d)} bad={riderBad} />
        )}
        {row.rejectedCount7d > 0 && (
          <MiniCell label="Rejected" value={row.rejectedCount7d.toString()} bad />
        )}
      </div>
    </div>
  );
}

function MiniCell({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div
      style={{
        background: bad ? colors.redSoft : colors.white,
        border: `1px solid ${bad ? colors.red + '40' : colors.border}`,
        borderRadius: 4,
        padding: '4px 6px',
        minWidth: 70,
      }}
    >
      <div style={{ fontSize: 9, color: colors.ink50, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: text.xs, fontWeight: 700, color: bad ? colors.red : colors.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
