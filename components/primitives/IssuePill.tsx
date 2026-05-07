import type { CSSProperties } from 'react';
import { colors, radii, text } from './tokens';

export type IssueKind =
  | 'platform'
  | 'compliance'
  | 'operations'
  | 'commercial'
  | 'growth'
  | 'behaviour';

export interface IssuePillProps {
  kind: IssueKind;
  label: string;
  small?: boolean;
}

const tone: Record<IssueKind, { fg: string; bg: string; border: string }> = {
  platform: { fg: colors.red, bg: colors.redSoft, border: colors.red + '40' },
  compliance: { fg: colors.red, bg: colors.redSoft, border: colors.red + '40' },
  operations: { fg: colors.amber, bg: colors.amberSoft, border: colors.amber + '40' },
  commercial: { fg: colors.blue, bg: colors.blueSoft, border: colors.blue + '40' },
  growth: { fg: colors.ink70, bg: colors.ink05, border: colors.border },
  behaviour: { fg: colors.ink70, bg: colors.ink05, border: colors.border },
};

export function IssuePill({ kind, label, small = false }: IssuePillProps) {
  const t = tone[kind];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    background: t.bg,
    color: t.fg,
    border: `1px solid ${t.border}`,
    borderRadius: radii.sm,
    padding: small ? '1px 6px' : '2px 10px',
    fontSize: small ? text.xs : text.sm,
    fontWeight: 600,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    lineHeight: 1.6,
  };
  return <span style={style}>{label}</span>;
}
