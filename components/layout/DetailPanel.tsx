import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { tokens } from '@/components/primitives';

const { colors, shadow, space, text } = tokens;

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,15,15,0.18)',
  zIndex: 90,
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 520,
  maxWidth: '100%',
  height: '100vh',
  background: colors.white,
  borderLeft: `1px solid ${colors.border}`,
  boxShadow: shadow.panel,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: CSSProperties = {
  padding: `${space[5]} ${space[6]}`,
  borderBottom: `1px solid ${colors.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const closeStyle: CSSProperties = {
  fontSize: text.xl,
  color: colors.ink50,
  lineHeight: 1,
  padding: `${space[1]} ${space[2]}`,
};

const bodyStyle: CSSProperties = {
  padding: `${space[5]} ${space[6]}`,
  overflowY: 'auto',
  flex: 1,
};

interface DetailPanelProps {
  title: string;
  closeHref: string;
  children: ReactNode;
}

// Server-renderable slide-in. URL-driven (open/close via Next.js Link without
// scroll reset, so the page underneath keeps its scroll position). Brief §8.2.
export function DetailPanel({ title, closeHref, children }: DetailPanelProps) {
  return (
    <>
      <Link href={closeHref} style={overlayStyle} scroll={false} aria-label="Close panel" />
      <aside style={panelStyle} role="dialog" aria-label={title}>
        <div style={headerStyle}>
          <strong style={{ fontSize: text.md, color: colors.ink }}>{title}</strong>
          <Link href={closeHref} scroll={false} style={closeStyle} aria-label="Close">
            ×
          </Link>
        </div>
        <div style={bodyStyle}>{children}</div>
      </aside>
    </>
  );
}
