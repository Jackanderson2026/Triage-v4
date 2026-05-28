// URL-driven pagination footer. Server-rendered, no JS.
// Pages are 1-indexed in URL params (?page=2) — easier to read than 0-indexed.
//
// Usage:
//   const { page, pageSize, slice } = paginate(rows, searchParams.page);
//   <Pager page={page} pageSize={pageSize} total={rows.length} hrefFor={(p) => `/foo?page=${p}`} />

import type { CSSProperties } from 'react';
import { tokens } from '@/components/primitives';

const { colors, fonts, radii, space, text } = tokens;

export const DEFAULT_PAGE_SIZE = 50;

/** Parse a ?page= URL param into a 1-indexed integer (defaults to 1). */
export function parsePage(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(first);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Slice the array for the requested page. Returns the resolved page (clamped). */
export function paginate<T>(rows: T[], pageRaw: string | string[] | undefined, pageSize = DEFAULT_PAGE_SIZE): {
  page: number;
  pageSize: number;
  slice: T[];
  total: number;
} {
  const total = rows.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parsePage(pageRaw), maxPage);
  const start = (page - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return { page, pageSize, slice, total };
}

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  /** Returns the href for a given page number. Should preserve other URL params. */
  hrefFor: (page: number) => string;
}

export function Pager({ page, pageSize, total, hrefFor }: PagerProps) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < maxPage;

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        padding: `${space[4]} 0 ${space[6]}`,
        fontFamily: fonts.body,
        fontSize: text.sm,
        color: colors.ink70,
        borderTop: `1px solid ${colors.border}`,
        marginTop: space[5],
      }}
    >
      <span>
        Showing <strong style={{ color: colors.ink }}>{first.toLocaleString('en-GB')}</strong>–
        <strong style={{ color: colors.ink }}>{last.toLocaleString('en-GB')}</strong> of{' '}
        <strong style={{ color: colors.ink }}>{total.toLocaleString('en-GB')}</strong>
      </span>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <a
          href={hasPrev ? hrefFor(page - 1) : '#'}
          aria-disabled={!hasPrev}
          style={pagerBtn(hasPrev)}
        >
          ← Prev
        </a>
        <span style={{ fontSize: text.xs, color: colors.ink50 }}>
          Page {page} of {maxPage}
        </span>
        <a
          href={hasNext ? hrefFor(page + 1) : '#'}
          aria-disabled={!hasNext}
          style={pagerBtn(hasNext)}
        >
          Next →
        </a>
      </div>
    </nav>
  );
}

function pagerBtn(enabled: boolean): CSSProperties {
  return {
    padding: `${space[1]} ${space[3]}`,
    border: `1px solid ${enabled ? colors.border : colors.ink10}`,
    borderRadius: radii.sm,
    background: enabled ? colors.white : colors.ink05,
    color: enabled ? colors.ink70 : colors.ink30,
    fontSize: text.xs,
    fontWeight: 600,
    textDecoration: 'none',
    pointerEvents: enabled ? 'auto' : 'none',
  };
}
