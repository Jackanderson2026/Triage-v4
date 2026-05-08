import Link from 'next/link';
import type { CSSProperties } from 'react';
import { tokens } from '@/components/primitives';

const { colors, fonts, space, text } = tokens;

export interface TabSpec {
  href: string;
  label: string;
  countLabel?: string;
}

interface TabNavProps {
  current: string;
  tabs: TabSpec[];
}

const navStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
  alignItems: 'flex-end',
};

const linkBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[3]} ${space[4]}`,
  fontFamily: fonts.body,
  fontSize: text.base,
  color: colors.ink70,
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
};

const activeStyle: CSSProperties = {
  ...linkBase,
  color: colors.grape,
  borderBottomColor: colors.grape,
  fontWeight: 600,
};

const countStyle: CSSProperties = {
  fontSize: text.xs,
  color: colors.ink50,
  fontWeight: 500,
};

export function TabNav({ current, tabs }: TabNavProps) {
  return (
    <nav style={navStyle}>
      {tabs.map((tab) => {
        const isActive = tab.href === current;
        return (
          <Link key={tab.href} href={tab.href} style={isActive ? activeStyle : linkBase}>
            <span>{tab.label}</span>
            {tab.countLabel && <span style={countStyle}>· {tab.countLabel}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export const TABS: TabSpec[] = [
  { href: '/queue', label: 'Triage Queue' },
  { href: '/offboarding-risk', label: 'Offboarding Risk' },
  { href: '/rejected-orders', label: 'Rejected Orders' },
];
