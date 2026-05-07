import { colors } from './tokens';

export interface SparkLineProps {
  values: Array<number | null>;
  width?: number;
  height?: number;
  /** Horizontal reference line drawn at this y-value. */
  threshold?: number;
  color?: string;
}

// Inline SVG sparkline. Lifted from sessions-triage-v3 with a `threshold` prop added per §8.1.
export function SparkLine({
  values,
  width = 80,
  height = 24,
  threshold,
  color = colors.grape,
}: SparkLineProps) {
  const numeric = values.filter((v): v is number => typeof v === 'number');
  if (numeric.length < 2) return null;

  const min = Math.min(...numeric, threshold ?? Infinity);
  const max = Math.max(...numeric, threshold ?? -Infinity);
  const range = max - min || 1;

  const project = (v: number): number => height - ((v - min) / range) * (height - 4) - 2;

  const points = values
    .map((v, i) => (typeof v === 'number' ? `${(i / (values.length - 1)) * width},${project(v)}` : null))
    .filter((p): p is string => p !== null);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');

  const lastPoint = points[points.length - 1];
  if (!lastPoint) return null;
  const [lx, ly] = lastPoint.split(',');

  const thresholdY = typeof threshold === 'number' ? project(threshold) : null;

  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-hidden>
      {thresholdY !== null && (
        <line
          x1={0}
          x2={width}
          y1={thresholdY}
          y2={thresholdY}
          stroke={colors.ink30}
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2} fill={color} />
    </svg>
  );
}
