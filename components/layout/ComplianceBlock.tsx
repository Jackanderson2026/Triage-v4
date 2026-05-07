// Compliance block on the partner detail card. Brief §7.0.
// Read-only — compliance state is owned upstream (the data pipeline produces
// serve.prod_venues_sessions_score_stg). The collapsed score-detail row uses
// <details>/<summary> for keyboard-accessible expansion without client JS.

import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '@/components/primitives';
import { Tag } from '@/components/primitives';
import type { PartnerCompliance } from '@/lib/triage/compliance';
import { formatScoreMonth } from '@/lib/triage/compliance';

const { colors, fonts, space, text } = tokens;

const labelStyle: CSSProperties = {
  fontSize: text.sm,
  color: colors.ink50,
  marginBottom: space[2],
};

const pillStyle = (good: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  background: good ? colors.greenSoft : colors.redSoft,
  color: good ? colors.green : colors.red,
  border: `1px solid ${(good ? colors.green : colors.red)}30`,
  borderRadius: 4,
  padding: '2px 10px',
  fontSize: text.xs,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
});

const subStyle = (good: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  background: good ? colors.bg : colors.redSoft,
  color: good ? colors.ink70 : colors.red,
  border: `1px solid ${good ? colors.border : colors.red + '30'}`,
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: text.xs,
  fontWeight: 600,
});

interface Props {
  compliance: PartnerCompliance | null;
}

export function ComplianceBlock({ compliance }: Props) {
  if (!compliance) {
    return (
      <section>
        <div style={labelStyle}>Compliance</div>
        <div style={{ fontSize: text.sm, color: colors.ink70, fontFamily: fonts.body }}>
          No scored month yet for this partner&apos;s venues.
        </div>
      </section>
    );
  }
  const { row, hasMultipleVenues, venueCount } = compliance;
  const overallGood = row.overallCompliant;
  const items: ReactNode[] = [
    ...row.nonCompliantFood.map((i, idx) => (
      <li key={`f-${idx}`}>
        <strong>[Food]</strong> {i}
      </li>
    )),
    ...row.nonCompliantPackaging.map((i, idx) => (
      <li key={`p-${idx}`}>
        <strong>[Packaging]</strong> {i}
      </li>
    )),
  ];

  return (
    <section>
      <div style={labelStyle}>Compliance</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <span style={pillStyle(overallGood)}>{overallGood ? 'Compliant' : 'Non-compliant'}</span>
        <span style={{ fontSize: text.sm, color: colors.ink70 }}>
          {formatScoreMonth(row.scoreMonth)}
        </span>
        {hasMultipleVenues && (
          <Tag label={`${venueCount}-venue partner`} tone="info" />
        )}
      </div>

      <div style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap' }}>
        <span style={subStyle(row.foodCompliant)}>Food: {row.foodCompliant ? 'OK' : 'Fail'}</span>
        <span style={subStyle(row.packagingCompliant)}>Packaging: {row.packagingCompliant ? 'OK' : 'Fail'}</span>
        <span style={subStyle(row.overallCompliant)}>Overall: {row.overallCompliant ? 'OK' : 'Fail'}</span>
      </div>

      <div style={{ marginTop: space[3] }}>
        {items.length === 0 ? (
          <div style={{ fontSize: text.sm, color: colors.ink70 }}>
            {row.hasEmptyLists ? (
              <Tag label="Data-quality flag — overall_compliant=false but no items listed" tone="warning" />
            ) : (
              'No active breaches.'
            )}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: text.sm, color: colors.ink70 }}>{items}</ul>
        )}
      </div>

      <details style={{ marginTop: space[3] }}>
        <summary
          style={{
            fontSize: text.xs,
            color: colors.ink50,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          Score detail
        </summary>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            rowGap: space[1],
            columnGap: space[3],
            marginTop: space[2],
            fontSize: text.sm,
            color: colors.ink70,
          }}
        >
          <dt>Total points</dt>
          <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{row.totalPoints ?? '—'}</dd>
          <dt>Open rate points</dt>
          <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{row.openRatePoints ?? '—'}</dd>
          <dt>Rating points</dt>
          <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{row.ratingPoints ?? '—'}</dd>
          <dt>Inaccurate orders points</dt>
          <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{row.inaccurateOrdersPoints ?? '—'}</dd>
          <dt>Total cashback</dt>
          <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
            {row.totalCashback === null ? '—' : `£${row.totalCashback.toLocaleString('en-GB')}`}
          </dd>
        </dl>
      </details>
    </section>
  );
}
