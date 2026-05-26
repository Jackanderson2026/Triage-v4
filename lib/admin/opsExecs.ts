'use server';

// Ops-exec assignment config — CRUD over ops_execs / allocation_rules /
// scope_limits. Read functions feed the scope computation (lib/triage/scope.ts);
// write functions back the /admin tab forms.
//
// No auth gating beyond the SSO middleware — any signed-in sessions.co.uk user
// can edit the config. Tighten to an admin allow-list later if needed.

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';

export interface OpsExec {
  id: number;
  name: string;
  email: string;
}

export interface AllocationRule {
  id: number;
  opsExecId: number;
  partnerType: string | null;
  brandStack: string | null;
  /** If set, the rule pins one specific partner (LEFT(pos_code,7)), ignoring type/brand. */
  partnerId: string | null;
}

export interface ScopeLimit {
  opsExecId: number;
  tab: string;
  maxPartners: number;
}

export interface OpsExecConfig {
  exec: OpsExec;
  rules: AllocationRule[];
  limits: ScopeLimit[];
}

interface ExecRow { id: number; name: string; email: string }
interface RuleRow { id: number; ops_exec_id: number; partner_type: string | null; brand_stack: string | null; partner_id: string | null }
interface LimitRow { ops_exec_id: number; tab: string; max_partners: number }

export async function listOpsExecConfig(): Promise<OpsExecConfig[]> {
  const [execs, rules, limits] = await Promise.all([
    sql`SELECT id, name, email FROM ops_execs ORDER BY name` as unknown as Promise<ExecRow[]>,
    sql`SELECT id, ops_exec_id, partner_type, brand_stack, partner_id FROM allocation_rules ORDER BY id` as unknown as Promise<RuleRow[]>,
    sql`SELECT ops_exec_id, tab, max_partners FROM scope_limits` as unknown as Promise<LimitRow[]>,
  ]);
  return execs.map((e) => ({
    exec: { id: e.id, name: e.name, email: e.email.toLowerCase() },
    rules: rules
      .filter((r) => r.ops_exec_id === e.id)
      .map((r) => ({
        id: r.id,
        opsExecId: r.ops_exec_id,
        partnerType: r.partner_type,
        brandStack: r.brand_stack,
        partnerId: r.partner_id,
      })),
    limits: limits
      .filter((l) => l.ops_exec_id === e.id)
      .map((l) => ({ opsExecId: l.ops_exec_id, tab: l.tab, maxPartners: l.max_partners })),
  }));
}

export async function createOpsExec(name: string, email: string): Promise<void> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail) throw new Error('Name and email required');
  if (!cleanEmail.endsWith('@sessions.co.uk')) throw new Error('Email must be @sessions.co.uk');
  await sql`
    INSERT INTO ops_execs (name, email) VALUES (${cleanName}, ${cleanEmail})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  `;
  revalidatePath('/admin');
}

export async function deleteOpsExec(id: number): Promise<void> {
  // CASCADE drops the exec's rules + limits.
  await sql`DELETE FROM ops_execs WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function addAllocationRule(
  opsExecId: number,
  partnerType: string | null,
  brandStack: string | null,
): Promise<void> {
  await sql`
    INSERT INTO allocation_rules (ops_exec_id, partner_type, brand_stack)
    VALUES (${opsExecId}, ${partnerType || null}, ${brandStack || null})
  `;
  revalidatePath('/admin');
}

export async function addPartnerAssignment(opsExecId: number, partnerId: string): Promise<void> {
  const pid = partnerId.trim().slice(0, 7);
  if (pid.length !== 7) throw new Error(`partnerId must be 7 chars; got "${partnerId}"`);
  await sql`
    INSERT INTO allocation_rules (ops_exec_id, partner_id)
    VALUES (${opsExecId}, ${pid})
  `;
  revalidatePath('/admin');
}

export async function removeAllocationRule(id: number): Promise<void> {
  await sql`DELETE FROM allocation_rules WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function setScopeLimit(opsExecId: number, tab: string, maxPartners: number): Promise<void> {
  const n = Math.max(0, Math.floor(maxPartners));
  await sql`
    INSERT INTO scope_limits (ops_exec_id, tab, max_partners)
    VALUES (${opsExecId}, ${tab}, ${n})
    ON CONFLICT (ops_exec_id, tab) DO UPDATE SET max_partners = EXCLUDED.max_partners
  `;
  revalidatePath('/admin');
}
