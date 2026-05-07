// Shared partner detail-card content. Brief §7.0 — every tab uses the same shape:
// header, compliance, metrics, issues firing, quick links, annotation block.
//
// This is a server component — pages pass everything in as data so each tab
// can foreground a different metric subset without duplicating layout.

import type { CSSProperties, ReactNode } from 'react';
import { IssuePill, MetricChip, SparkLine, tokens } from '@/components/primitives';
import { ComplianceBlock } from './ComplianceBlock';
import { AnnotationButton } from './AnnotationButton';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import type { PartnerCompliance } from '@/lib/triage/compliance';
import type { IssueCode } from '@/lib/triage/hierarchy';
import { ISSUE_CATALOGUE } from '@/lib/triage/hierarchy';
import { activeIssueLabel } from '@/lib/triage/activeIssue';
import {
  MISSING_ITEMS_INTERNAL_TARGET,
  OPEN_RATE_BENCHMARK,
  RATING_TARGET,
  REJECT_RATE_LIMIT,
  RIDER_WAIT_BENCHMARK,
} from '@/lib/triage/thresholds';
import type { PartnerSparkline } from '@/lib/bq/queries/sparklines';

const { colors, fonts, space, text } = tokens;

function gbp(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}
function pct(n: number | null): string {
  return n === null ? '—' : `${(n * 100).toFixed(1)}%`;
}
function num(n: number | null, digits = 1): string {
  return n === null ? '—' : n.toFixed(digits);
}

interface QuickLink {
  label: string;
  href: string;
}

interface Props {
  partner: PartnerOpsRow;
  compliance: PartnerCompliance | null;
  issues: IssueCode[];
  /** Partner-grain sparkline values. Undefined = no series available. */
  sparkline?: PartnerSparkline;
  /** Optional extra content rendered above the metrics block — used for Tab 2 trigger summary, Tab 5 pause dates, etc. */
  extra?: ReactNode;
}

const sectionLabel: CSSProperties = {
  fontSize: text.sm,
  color: colors.ink50,
  marginBottom: space[2],
};

export function PartnerDetail({ partner, compliance, issues, sparkline, extra }: Props) {
  const links: QuickLink[] = [];
  if (partner.hubspotCompanyId) {
    links.push({
      label: 'Open in HubSpot',
      href: `https://app.hubspot.com/contacts/0/company/${partner.hubspotCompanyId}`,
    });
  }
  links.push({
    label: 'Copy partner ID',
    href: `#${partner.partnerId}`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], fontFamily: fonts.body }}>
      <section>
        <div style={sectionLabel}>Header</div>
        <div style={{ fontSize: text.lg, fontWeight: 700, color: colors.ink }}>
          {partner.partnerName ?? partner.partnerId}
        </div>
        <div style={{ fontSize: text.sm, color: colors.ink70, marginTop: space[1] }}>
          {partner.brandStack ?? '—'} · {partner.partnerType ?? '—'} · {partner.hostStatus ?? '—'} · {partner.platforms.join(' / ') || '—'}
        </div>
      </section>

      <ComplianceBlock compliance={compliance} />

      {extra}

      <section>
        <div style={sectionLabel}>Key metrics</div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <MetricChip
            label="7d GMV"
            value={gbp(partner.gmv7d)}
            sparkline={sparkline?.gmv}
          />
          <MetricChip label="28d GMV" value={gbp(partner.gmv28d)} />
          <MetricChip
            label="Open rate"
            value={pct(partner.openRate7d)}
            state={
              partner.openRate7d !== null && partner.openRate7d < OPEN_RATE_BENCHMARK
                ? 'bad'
                : 'neutral'
            }
            sparkline={sparkline?.openRate}
          />
          <MetricChip
            label="Missing items"
            value={pct(partner.missingItemsPct7d)}
            state={
              partner.missingItemsPct7d !== null && partner.missingItemsPct7d > MISSING_ITEMS_INTERNAL_TARGET
                ? 'bad'
                : 'neutral'
            }
            sparkline={sparkline?.missingItems}
          />
          <MetricChip
            label="Rider wait > 5m"
            value={pct(partner.riderWait5minPct7d)}
            state={
              partner.riderWait5minPct7d !== null && partner.riderWait5minPct7d > RIDER_WAIT_BENCHMARK
                ? 'bad'
                : 'neutral'
            }
            sparkline={sparkline?.riderWait}
          />
          <MetricChip
            label="Reject rate"
            value={pct(partner.rejectedRate7d)}
            state={
              partner.rejectedRate7d !== null && partner.rejectedRate7d > REJECT_RATE_LIMIT
                ? 'bad'
                : 'neutral'
            }
          />
          <MetricChip
            label="Rating (28d)"
            value={num(partner.rating28d, 2)}
            state={
              partner.rating28d !== null && partner.rating28d < RATING_TARGET ? 'bad' : 'neutral'
            }
            sparkline={sparkline?.rating}
          />
          <MetricChip label="AOV (7d)" value={gbp(partner.aov7d)} />
          <MetricChip label="Prep time (mins)" value={num(partner.prepMinutes7d, 1)} />
        </div>
      </section>

      <section>
        <div style={sectionLabel}>Issues firing</div>
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

      <section>
        <div style={sectionLabel}>Annotate</div>
        <AnnotationButton
          partnerId={partner.partnerId}
          partnerName={partner.partnerName ?? partner.partnerId}
        />
      </section>

      <section>
        <div style={sectionLabel}>Quick links</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith('http') ? '_blank' : undefined}
              rel={l.href.startsWith('http') ? 'noreferrer' : undefined}
              style={{ color: colors.grape, fontSize: text.sm }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </section>

      {/* SparkLine import retained for type only when sparklines are unavailable. */}
      {!sparkline && (
        <span style={{ display: 'none' }}>
          <SparkLine values={[]} />
        </span>
      )}
    </div>
  );
}
