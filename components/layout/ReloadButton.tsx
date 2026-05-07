'use client';

import { useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { revalidateTabAction } from './actions';
import { tokens } from '@/components/primitives';

const { colors, radii, text, space } = tokens;

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[1]} ${space[3]}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  fontSize: text.sm,
  background: colors.white,
  color: colors.ink70,
};

export function ReloadButton({ tag }: { tag: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      style={{ ...buttonStyle, opacity: pending ? 0.5 : 1 }}
      onClick={() =>
        start(async () => {
          await revalidateTabAction(tag);
          router.refresh();
        })
      }
      disabled={pending}
    >
      {pending ? 'Reloading…' : 'Reload'}
    </button>
  );
}
