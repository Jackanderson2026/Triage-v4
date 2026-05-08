'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type CSSProperties } from 'react';
import { tokens } from '@/components/primitives';
import { BRAND_STACKS, BRAND_STACK_LABELS, HOST_STATUSES, PARTNER_TYPES } from '@/lib/triage/enums';

const { colors, fonts, radii, space, text } = tokens;

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[5],
  fontFamily: fonts.body,
  fontSize: text.sm,
  color: colors.ink70,
};

const groupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
};

const labelStyle: CSSProperties = {
  fontSize: text.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: colors.ink50,
};

const buttonsStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
  flexWrap: 'wrap',
};

const baseChip: CSSProperties = {
  padding: `${space[1]} ${space[3]}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: text.xs,
  fontWeight: 600,
  background: colors.white,
  color: colors.ink70,
  cursor: 'pointer',
  fontFamily: fonts.body,
};

const activeChip: CSSProperties = {
  ...baseChip,
  background: colors.grapeSoft,
  border: `1px solid ${colors.grape}`,
  color: colors.grape,
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

const STATUS_LABELS: Record<string, string> = {
  'Core Estate': 'Core Estate',
  'Trial Period': 'Trial',
  Paused: 'Paused',
  Churn: 'Churned',
};

export function GlobalFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const partnerType = params.get('partnerType') ?? '';
  const brandStack = params.get('brandStack') ?? '';
  const hostStatus = params.get('hostStatus') ?? '';
  const hasActive = partnerType !== '' || brandStack !== '' || hostStatus !== '';

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    start(() => router.push(qs ? `?${qs}` : '?'));
  }

  function clear() {
    const next = new URLSearchParams(params.toString());
    next.delete('partnerType');
    next.delete('brandStack');
    next.delete('hostStatus');
    const qs = next.toString();
    start(() => router.push(qs ? `?${qs}` : '?'));
  }

  function ChipRow<T extends string>({
    paramKey,
    current,
    options,
    labelLookup,
  }: {
    paramKey: string;
    current: string;
    options: readonly T[] | T[];
    labelLookup?: Record<string, string>;
  }) {
    return (
      <div style={buttonsStyle}>
        <button
          type="button"
          style={current === '' ? activeChip : baseChip}
          onClick={() => setFilter(paramKey, '')}
          disabled={pending}
        >
          All
        </button>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            style={current === opt ? activeChip : baseChip}
            onClick={() => setFilter(paramKey, current === opt ? '' : opt)}
            disabled={pending}
          >
            {labelLookup?.[opt] ?? opt}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div style={groupStyle}>
        <span style={labelStyle}>Partner type</span>
        <ChipRow paramKey="partnerType" current={partnerType} options={PARTNER_TYPES} />
      </div>
      <div style={groupStyle}>
        <span style={labelStyle}>Brand stack</span>
        <ChipRow paramKey="brandStack" current={brandStack} options={BRAND_STACKS} labelLookup={BRAND_STACK_LABELS} />
      </div>
      <div style={groupStyle}>
        <span style={labelStyle}>Status</span>
        <ChipRow
          paramKey="hostStatus"
          current={hostStatus}
          options={HOST_STATUSES}
          labelLookup={STATUS_LABELS}
        />
      </div>
      {hasActive && (
        <button type="button" style={linkStyle} onClick={clear} disabled={pending}>
          Clear filters
        </button>
      )}
    </div>
  );
}
