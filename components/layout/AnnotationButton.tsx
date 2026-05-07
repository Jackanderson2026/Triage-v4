'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { TagModal, type AnnotationType } from '@/components/primitives/TagModal';
import { tokens } from '@/components/primitives';
import { createAnnotation } from '@/lib/annotations';

const { colors, radii, space, text } = tokens;

const buttonStyle: CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  padding: `${space[1]} ${space[3]}`,
  fontSize: text.xs,
  color: colors.ink70,
};

interface AnnotationButtonProps {
  partnerId: string;
  partnerName: string;
}

export function AnnotationButton({ partnerId, partnerName }: AnnotationButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function handleSave(annotationType: AnnotationType, note: string) {
    await new Promise<void>((resolve, reject) => {
      start(async () => {
        try {
          await createAnnotation(partnerId, annotationType, note || null);
          router.refresh();
          resolve();
        } catch (err) {
          console.error(err);
          reject(err);
        }
      });
    });
  }

  return (
    <>
      <button
        type="button"
        style={{ ...buttonStyle, opacity: pending ? 0.5 : 1 }}
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        Annotate
      </button>
      {open && (
        <TagModal
          partnerName={partnerName}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
