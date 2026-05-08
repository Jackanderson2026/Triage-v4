// Horizontal sub-tabs inside a single page (e.g. /queue tier filter).
// URL-driven so it's just <a> links — no client JS needed for the nav itself.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { tokens } from '@/components/primitives';

const { colors, fonts, radii, space, text } = tokens;

export interface SubTab {
  key: string;
  label: string;
  href: string;
  count?: number;
  active: boolean;
}

interface Props {
  tabs: SubTab[];
}

const wrapperStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
  flexWrap: 'wrap',
  marginBottom: space[4],
  fontFamily: fonts.body,
};

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  padding: `${space[1]} ${space[3]}`,
  borderRadius: radii.sm,
  fontSize: text.xs,
  fontWeight: 600,
  textDecoration: 'none',
  border: `1px solid ${colors.border}`,
  background: colors.white,
  color: colors.ink70,
};

const activeStyle: CSSProperties = {
  ...baseStyle,
  background: colors.grapeSoft,
  border: `1px solid ${colors.grape}`,
  color: colors.grape,
};

export function SubTabNav({ tabs }: Props) {
  return (
    <div style={wrapperStyle}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} scroll={false} style={t.active ? activeStyle : baseStyle}>
          <span>{t.label}</span>
          {typeof t.count === 'number' && (
            <span
              style={{
                fontSize: 10,
                color: t.active ? colors.grape : colors.ink50,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
