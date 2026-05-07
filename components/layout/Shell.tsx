import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '@/components/primitives';
import { ReloadButton } from './ReloadButton';

const { colors, fonts, space, text } = tokens;

interface ShellProps {
  tabName: string;
  tabTag: string;
  filters: ReactNode;
  tabNav: ReactNode;
  children: ReactNode;
}

const headerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 50,
  background: colors.white,
  borderBottom: `1px solid ${colors.border}`,
  padding: `${space[3]} ${space[6]}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const titleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: space[3],
};

const appNameStyle: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: text.xl,
  color: colors.grape,
  fontWeight: 600,
  letterSpacing: '-0.01em',
};

const tabNameStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: text.md,
  color: colors.ink70,
};

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
};

const mainStyle: CSSProperties = {
  padding: `${space[5]} ${space[6]} ${space[12]}`,
};

export function Shell({ tabName, tabTag, filters, tabNav, children }: ShellProps) {
  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div style={titleStyle}>
          <span style={appNameStyle}>Sessions Triage</span>
          <span style={tabNameStyle}>· {tabName}</span>
        </div>
        <ReloadButton tag={tabTag} />
      </header>
      <div
        style={{
          background: colors.white,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space[3]} ${space[6]}`,
        }}
      >
        {filters}
      </div>
      <div
        style={{
          background: colors.white,
          borderBottom: `1px solid ${colors.border}`,
          padding: `0 ${space[6]}`,
        }}
      >
        {tabNav}
      </div>
      <main style={mainStyle}>{children}</main>
    </div>
  );
}
