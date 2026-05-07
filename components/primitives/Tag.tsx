import type { CSSProperties } from 'react';
import { colors, radii, text } from './tokens';

export interface TagProps {
  label: string;
  tone?: 'neutral' | 'info' | 'warning';
}

const palette: Record<NonNullable<TagProps['tone']>, { fg: string; bg: string; border: string }> = {
  neutral: { fg: colors.ink70, bg: colors.ink05, border: colors.border },
  info: { fg: colors.blue, bg: colors.blueSoft, border: colors.blue + '30' },
  warning: { fg: colors.amber, bg: colors.amberSoft, border: colors.amber + '30' },
};

export function Tag({ label, tone = 'neutral' }: TagProps) {
  const t = palette[tone];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    background: t.bg,
    color: t.fg,
    border: `1px solid ${t.border}`,
    borderRadius: radii.sm,
    padding: '1px 7px',
    fontSize: text.xs,
    fontWeight: 500,
    lineHeight: 1.6,
    whiteSpace: 'nowrap',
  };
  return <span style={style}>{label}</span>;
}
