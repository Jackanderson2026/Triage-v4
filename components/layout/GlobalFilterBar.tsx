'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type CSSProperties } from 'react';
import { tokens } from '@/components/primitives';
import { BRAND_STACKS, PARTNER_TYPES } from '@/lib/triage/enums';

const { colors, fonts, radii, space, text } = tokens;

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[4],
  fontFamily: fonts.body,
  fontSize: text.sm,
  color: colors.ink70,
};

const labelStyle: CSSProperties = {
  fontSize: text.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: colors.ink50,
  marginRight: space[2],
};

const selectStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: text.sm,
  padding: `${space[1]} ${space[2]}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  background: colors.white,
  color: colors.ink,
};

const linkStyle: CSSProperties = {
  fontSize: text.sm,
  color: colors.grape,
  textDecoration: 'underline',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
};

export function GlobalFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const partnerType = params.get('partnerType') ?? '';
  const brandStack = params.get('brandStack') ?? '';
  const hasActive = partnerType !== '' || brandStack !== '';

  function update(next: URLSearchParams) {
    const qs = next.toString();
    start(() => router.push(qs ? `?${qs}` : '?'));
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    update(next);
  }

  function clear() {
    const next = new URLSearchParams(params.toString());
    next.delete('partnerType');
    next.delete('brandStack');
    update(next);
  }

  return (
    <div style={wrapperStyle}>
      <div>
        <label style={labelStyle}>Partner type</label>
        <select
          style={selectStyle}
          value={partnerType}
          onChange={(e) => setFilter('partnerType', e.target.value)}
          disabled={pending}
        >
          <option value="">All</option>
          {PARTNER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Brand stack</label>
        <select
          style={selectStyle}
          value={brandStack}
          onChange={(e) => setFilter('brandStack', e.target.value)}
          disabled={pending}
        >
          <option value="">All</option>
          {BRAND_STACKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      {hasActive && (
        <button type="button" style={linkStyle} onClick={clear} disabled={pending}>
          Clear filters
        </button>
      )}
    </div>
  );
}
