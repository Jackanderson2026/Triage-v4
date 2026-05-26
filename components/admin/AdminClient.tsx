'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { tokens } from '@/components/primitives';
import { PARTNER_TYPES, BRAND_STACKS, BRAND_STACK_LABELS } from '@/lib/triage/enums';
import {
  addAllocationRule,
  createOpsExec,
  deleteOpsExec,
  removeAllocationRule,
  setScopeLimit,
  type OpsExecConfig,
} from '@/lib/admin/opsExecs';

const { colors, fonts, radii, space, text } = tokens;

// Tabs that honour per-exec scope limits. Extend as the 3-section split rolls
// out to more tabs.
const SCOPEABLE_TABS: Array<{ key: string; label: string }> = [{ key: 'queue', label: 'Triage Queue' }];

const card: CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  padding: `${space[4]} ${space[5]}`,
  marginBottom: space[4],
  fontFamily: fonts.body,
};

const label: CSSProperties = {
  fontSize: text.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: colors.ink50,
  fontWeight: 600,
};

const input: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: text.sm,
  padding: `${space[1]} ${space[2]}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  background: colors.white,
  color: colors.ink,
};

const btn: CSSProperties = {
  padding: `${space[1]} ${space[3]}`,
  border: `1px solid ${colors.grape}`,
  background: colors.grapeSoft,
  color: colors.grape,
  borderRadius: radii.sm,
  fontSize: text.xs,
  fontWeight: 600,
  cursor: 'pointer',
};

const linkBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.red,
  fontSize: text.xs,
  cursor: 'pointer',
  padding: 0,
};

export function AdminClient({ config }: { config: OpsExecConfig[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div style={{ fontFamily: fonts.body }}>
      {err && (
        <div style={{ ...card, borderColor: colors.red, color: colors.red, background: colors.redSoft }}>
          {err}
        </div>
      )}

      {/* Add exec */}
      <div style={card}>
        <div style={{ ...label, marginBottom: space[2] }}>Add ops exec</div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...input, minWidth: 180 }}
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            style={{ ...input, minWidth: 240 }}
            placeholder="name@sessions.co.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            style={btn}
            disabled={pending}
            onClick={() =>
              run(async () => {
                await createOpsExec(name, email);
                setName('');
                setEmail('');
              })
            }
          >
            Add
          </button>
        </div>
      </div>

      {config.length === 0 && (
        <div style={{ ...card, color: colors.ink50 }}>
          No ops execs yet. Add one above — until then, every signed-in user sees the unscoped view
          (all partners in scope).
        </div>
      )}

      {config.map((c) => (
        <ExecCard key={c.exec.id} config={c} pending={pending} run={run} />
      ))}
    </div>
  );
}

function ExecCard({
  config,
  pending,
  run,
}: {
  config: OpsExecConfig;
  pending: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const { exec, rules, limits } = config;
  const [ruleType, setRuleType] = useState('');
  const [ruleBrand, setRuleBrand] = useState('');

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space[3] }}>
        <div>
          <span style={{ fontSize: text.lg, fontWeight: 700, color: colors.ink }}>{exec.name}</span>
          <span style={{ fontSize: text.sm, color: colors.ink50, marginLeft: space[2] }}>{exec.email}</span>
        </div>
        <button style={linkBtn} disabled={pending} onClick={() => run(() => deleteOpsExec(exec.id))}>
          Remove exec
        </button>
      </div>

      {/* Allocation rules */}
      <div style={{ marginBottom: space[3] }}>
        <div style={{ ...label, marginBottom: space[2] }}>Assigned sites (match any rule)</div>
        {rules.length === 0 ? (
          <div style={{ fontSize: text.sm, color: colors.ink50, marginBottom: space[2] }}>
            No rules — this exec is assigned nothing yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], marginBottom: space[2] }}>
            {rules.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: text.sm }}>
                <span
                  style={{
                    background: colors.ink05,
                    borderRadius: radii.sm,
                    padding: `2px 8px`,
                    color: colors.ink,
                  }}
                >
                  {r.partnerType ?? 'Any type'} · {r.brandStack ? (BRAND_STACK_LABELS[r.brandStack] ?? r.brandStack) : 'Any brand'}
                </span>
                <button style={linkBtn} disabled={pending} onClick={() => run(() => removeAllocationRule(r.id))}>
                  remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={input} value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
            <option value="">Any partner type</option>
            {PARTNER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select style={input} value={ruleBrand} onChange={(e) => setRuleBrand(e.target.value)}>
            <option value="">Any brand</option>
            {BRAND_STACKS.map((b) => (
              <option key={b} value={b}>
                {BRAND_STACK_LABELS[b] ?? b}
              </option>
            ))}
          </select>
          <button
            style={btn}
            disabled={pending || (!ruleType && !ruleBrand)}
            onClick={() =>
              run(async () => {
                await addAllocationRule(exec.id, ruleType || null, ruleBrand || null);
                setRuleType('');
                setRuleBrand('');
              })
            }
          >
            Add rule
          </button>
        </div>
      </div>

      {/* Scope limits */}
      <div>
        <div style={{ ...label, marginBottom: space[2] }}>Max in-scope partners per tab</div>
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap' }}>
          {SCOPEABLE_TABS.map((tab) => {
            const current = limits.find((l) => l.tab === tab.key)?.maxPartners;
            return (
              <LimitInput
                key={tab.key}
                label={tab.label}
                value={current}
                pending={pending}
                onSave={(n) => run(() => setScopeLimit(exec.id, tab.key, n))}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LimitInput({
  label: lbl,
  value,
  pending,
  onSave,
}: {
  label: string;
  value: number | undefined;
  pending: boolean;
  onSave: (n: number) => void;
}) {
  const [v, setV] = useState(value?.toString() ?? '');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
      <span style={{ fontSize: text.sm, color: colors.ink70 }}>{lbl}</span>
      <input
        type="number"
        min={0}
        style={{ ...input, width: 70 }}
        value={v}
        placeholder="∞"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== '' && Number(v) !== value) onSave(Number(v));
        }}
        disabled={pending}
      />
    </div>
  );
}
