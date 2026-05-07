import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '@/components/primitives';

const { colors, radii, space, text } = tokens;

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  width?: number | string;
  render: (row: T) => ReactNode;
}

interface PartnerTableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  rowHrefForId: (row: T) => string;
  emptyState: ReactNode;
}

const tableStyle: CSSProperties = {
  width: '100%',
  background: colors.white,
  borderRadius: radii.lg,
  border: `1px solid ${colors.border}`,
  overflow: 'hidden',
};

const headStyle: CSSProperties = {
  background: colors.ink05,
  color: colors.ink70,
  fontSize: text.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const thStyle = (align: 'left' | 'right'): CSSProperties => ({
  textAlign: align,
  padding: `${space[3]} ${space[4]}`,
  fontWeight: 600,
  borderBottom: `1px solid ${colors.border}`,
});

const rowStyle: CSSProperties = {
  borderBottom: `1px solid ${colors.ink05}`,
};

const cellStyle = (align: 'left' | 'right'): CSSProperties => ({
  textAlign: align,
  padding: `${space[3]} ${space[4]}`,
  verticalAlign: 'middle',
});

const linkRowStyle: CSSProperties = {
  display: 'contents',
  color: 'inherit',
};

const emptyStateStyle: CSSProperties = {
  padding: `${space[12]} ${space[6]}`,
  textAlign: 'center',
  color: colors.ink50,
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
};

export function PartnerTable<T>({ rows, columns, rowHrefForId, emptyState }: PartnerTableProps<T>) {
  if (rows.length === 0) {
    return <div style={emptyStateStyle}>{emptyState}</div>;
  }
  return (
    <table style={tableStyle}>
      <thead style={headStyle}>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={{ ...thStyle(col.align ?? 'left'), width: col.width }}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const href = rowHrefForId(row);
          return (
            <tr key={i} style={rowStyle}>
              {columns.map((col, ci) => (
                <td key={col.key} style={cellStyle(col.align ?? 'left')}>
                  {ci === 0 ? (
                    <Link href={href} scroll={false} style={linkRowStyle}>
                      {col.render(row)}
                    </Link>
                  ) : (
                    col.render(row)
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
