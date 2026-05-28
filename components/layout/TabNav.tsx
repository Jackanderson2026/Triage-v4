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
  /** Global filter params to carry forward to the destination tab.
   * Page-local params (page, sort, tier, etc.) are intentionally dropped. */
  globalParams?: URLSearchParams;
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

export function TabNav({ current, tabs, globalParams }: TabNavProps) {
  const qs = globalParams?.toString() ?? '';
  return (
    <nav style={navStyle}>
      {tabs.map((tab) => {
        const isActive = tab.href === current;
        const href = qs ? `${tab.href}?${qs}` : tab.href;
        return (
          <Link key={tab.href} href={href} style={isActive ? activeStyle : linkBase}>
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
  { href: '/top-partners', label: 'Top Partners' },
  { href: '/offboarding-risk', label: 'Roo Offboarding Risk' },
  { href: '/inactive-menus', label: 'Inactive Menus' },
  { href: '/rejected-orders', label: 'Rejected Orders' },
  { href: '/ad-spend', label: 'Ad Spend' },
  { href: '/admin', label: 'Admin' },
];
