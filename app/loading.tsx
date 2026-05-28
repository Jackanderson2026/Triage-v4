// Shown automatically by Next.js while a page's server components are
// fetching. Covers every route — individual tabs can add their own
// loading.tsx to override.
//
// Mimics the Shell shape (header + nav placeholder + a few card outlines) so
// the user sees the same chrome they're about to land on, not a blank screen.

import { tokens } from '@/components/primitives';

const { colors, fonts, radii, space, text } = tokens;

const skeletonRow = (i: number) => (
  <div
    key={i}
    style={{
      background: colors.white,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      padding: `${space[3]} ${space[4]}`,
      marginBottom: space[2],
      display: 'flex',
      alignItems: 'center',
      gap: space[3],
      opacity: 0.55 - i * 0.07,
    }}
  >
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: colors.ink05,
        flexShrink: 0,
      }}
    />
    <div style={{ flex: 1 }}>
      <div
        style={{
          height: 14,
          width: '40%',
          background: colors.ink05,
          borderRadius: 4,
          marginBottom: 6,
        }}
      />
      <div style={{ height: 10, width: '60%', background: colors.ink05, borderRadius: 4 }} />
    </div>
    <div style={{ width: 100, height: 24, background: colors.ink05, borderRadius: 4 }} />
    <div style={{ width: 60, height: 32, background: colors.ink05, borderRadius: 4 }} />
  </div>
);

export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: colors.bg }}>
      {/* Header skeleton */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: colors.white,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space[3]} ${space[6]}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3] }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: text.xl,
              color: colors.grape,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            Sessions Triage
          </span>
          <Pulse width={120} height={14} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          <Pulse width={80} height={22} />
          <Pulse width={70} height={28} />
        </div>
      </header>

      {/* Filter bar skeleton */}
      <div
        style={{
          background: colors.white,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space[3]} ${space[6]}`,
          display: 'flex',
          gap: space[5],
        }}
      >
        <Pulse width={220} height={28} />
        <Pulse width={260} height={28} />
        <Pulse width={320} height={28} />
      </div>

      {/* Tab nav skeleton */}
      <div
        style={{
          background: colors.white,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space[3]} ${space[6]}`,
          display: 'flex',
          gap: space[4],
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Pulse key={i} width={90} height={20} />
        ))}
      </div>

      {/* Body skeleton */}
      <main style={{ padding: `${space[5]} ${space[6]} ${space[12]}` }}>
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: text.sm,
            color: colors.ink50,
            marginBottom: space[4],
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
          }}
        >
          <Spinner />
          Loading partner data from BigQuery…
        </div>
        {[0, 1, 2, 3, 4].map(skeletonRow)}
      </main>
    </div>
  );
}

function Pulse({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        background: colors.ink05,
        borderRadius: radii.sm,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: `2px solid ${colors.grape}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}
