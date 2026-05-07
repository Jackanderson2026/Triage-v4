'use client';

import { useState, type CSSProperties } from 'react';
import { colors, radii, shadow, text } from './tokens';

export type AnnotationType = 'actioned' | 'known_issue' | 'churned' | 'paused';

export interface TagModalProps {
  partnerName: string;
  onClose: () => void;
  onSave: (annotationType: AnnotationType, note: string) => Promise<void> | void;
}

const labels: Record<AnnotationType, string> = {
  actioned: 'Actioned today',
  known_issue: 'Known issue',
  churned: 'Churned',
  paused: 'Paused',
};

const descs: Record<AnnotationType, string> = {
  actioned: 'Snoozes for 24 hours.',
  known_issue: 'Snoozes until manually cleared.',
  churned: 'Removes from queue permanently.',
  paused: 'Moves to the Paused tab.',
};

const NOTE_REQUIRED: AnnotationType[] = ['known_issue', 'actioned'];

export function TagModal({ partnerName, onClose, onSave }: TagModalProps) {
  const [selected, setSelected] = useState<AnnotationType | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const noteRequired = selected !== null && NOTE_REQUIRED.includes(selected);
  const noteValid = !noteRequired || note.trim().length > 0;
  const canSave = selected !== null && noteValid && !saving;

  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.32)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const card: CSSProperties = {
    background: colors.white,
    borderRadius: radii.lg,
    padding: 24,
    width: 380,
    boxShadow: shadow.md,
  };

  async function handleSave() {
    if (!canSave || !selected) return;
    setSaving(true);
    try {
      await onSave(selected, note.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Annotation actions">
        <div style={{ fontSize: text.md, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>{partnerName}</div>
        <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: 16 }}>Select an action</div>

        {(Object.keys(labels) as AnnotationType[]).map((tag) => {
          const isSelected = selected === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setSelected(tag)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: isSelected ? colors.grapeSoft : colors.ink05,
                border: `1px solid ${isSelected ? colors.grape : colors.border}`,
                borderRadius: radii.md,
                padding: '12px 14px',
                marginBottom: 8,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontSize: text.base,
                  fontWeight: 600,
                  color: isSelected ? colors.grapeDeep : colors.ink,
                }}
              >
                {labels[tag]}
              </div>
              <div style={{ fontSize: text.xs, color: colors.ink50, marginTop: 2 }}>{descs[tag]}</div>
            </button>
          );
        })}

        {noteRequired && (
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={selected === 'actioned' ? 'What action was taken?' : 'Describe the known issue…'}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '10px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              fontSize: text.base,
              color: colors.ink,
              resize: 'vertical',
              minHeight: 80,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              fontSize: text.base,
              color: colors.ink70,
              background: colors.white,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: '8px 16px',
              background: colors.grape,
              border: 'none',
              borderRadius: radii.md,
              fontSize: text.base,
              color: colors.white,
              fontWeight: 600,
              opacity: canSave ? 1 : 0.4,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
