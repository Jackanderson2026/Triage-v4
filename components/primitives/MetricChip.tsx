import type { CSSProperties } from 'react';
import { colors, radii, text } from './tokens';
import { SparkLine } from './SparkLine';

export type MetricState = 'good' | 'neutral' | 'bad';
export type MetricTrend = 'up' | 'down' | 'flat';

export interface MetricChipProps {
  label: string;
  value: string | number;
  unit?: string;
  state?: MetricState;
  trend?: MetricTrend;
  /** Trailing-N values; nulls render as gaps so partners with missing weeks still draw. */
  sparkline?: Array<number | null>;
  threshold?: number;
}

const stateStyles: Record<MetricState, { bg: string; border: string; fg: string }> = {
  good: { bg: colors.greenSoft, border: colors.green + '40', fg: colors.green },
  neutral: { bg: colors.ink05, border: colors.border, fg: colors.ink },
  bad: { bg: colors.redSoft, border: colors.red + '40', fg: colors.red },
};

const trendArrow: Record<MetricTrend, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

export function MetricChip({
  label,
  value,
  unit,
  state = 'neutral',
  trend,
  sparkline,
  threshold,
}: MetricChipProps) {
  const s = stateStyles[state];
  const wrapper: CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    background: s.bg,
    border: `1px solid ${s.border}`,
    borderRadius: radii.md,
    padding: '6px 10px',
    minWidth: 80,
    gap: 2,
  };
  const labelStyle: CSSProperties = {
    fontSize: 9,
    color: colors.ink50,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };
  const valueStyle: CSSProperties = {
    fontSize: text.base,
    fontWeight: 700,
    color: s.fg,
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 4,
  };
  return (
    <div style={wrapper}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>
        <span>{value}</span>
        {unit && <span style={{ fontSize: text.xs, fontWeight: 500, color: colors.ink70 }}>{unit}</span>}
        {trend && (
          <span style={{ fontSize: text.xs, color: colors.ink50 }} aria-label={`trend ${trend}`}>
            {trendArrow[trend]}
          </span>
        )}
      </div>
      {sparkline && sparkline.length >= 2 && (
        <div style={{ marginTop: 2 }}>
          <SparkLine values={sparkline} threshold={threshold} color={s.fg} />
        </div>
      )}
    </div>
  );
}
