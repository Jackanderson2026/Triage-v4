// Per-ops-exec scope computation for the triage tabs. Splits a priority-sorted
// list of partner views into three buckets: actioned-this-week, in-scope,
// out-of-scope.
//
// Pure — no I/O. The page loads the ops-exec config + annotations and hands
// them in. If the logged-in email doesn't match a registered exec, the view is
// unscoped (everything in-scope) so nobody gets locked out.

import type { OpsExec, OpsExecConfig } from '@/lib/admin/opsExecs';

export interface ScopeablePartner {
  partnerId: string;
  partnerType: string | null;
  brandStack: string | null;
}

export interface ScopeResult<T> {
  /** The exec the view is scoped to, or null for the unscoped admin/observer view. */
  scopedExec: OpsExec | null;
  /** Partners actioned since Monday — pulled out of in/out scope entirely. */
  actioned: T[];
  /** Assigned to this exec, within their per-tab limit, priority-ranked. */
  inScope: T[];
  /** Everything else with an active issue (over limit / assigned elsewhere / unassigned). */
  outOfScope: T[];
}

/** Start of the current Mon–Sun week, local time, as epoch ms. */
export function startOfWeek(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function isThisWeek(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startOfWeek(now);
}

function partnerMatchesExec(p: ScopeablePartner, cfg: OpsExecConfig): boolean {
  return cfg.rules.some((rule) => {
    const typeOk = rule.partnerType == null || rule.partnerType === p.partnerType;
    const brandOk =
      rule.brandStack == null ||
      (p.brandStack ?? '').toLowerCase().includes(rule.brandStack.toLowerCase());
    return typeOk && brandOk;
  });
}

export function computeScope<T>(opts: {
  email: string | null | undefined;
  tab: string;
  config: OpsExecConfig[];
  /** Views, already sorted by triage priority (most urgent first). */
  views: T[];
  getPartner: (v: T) => ScopeablePartner;
  isActionedThisWeek: (v: T) => boolean;
}): ScopeResult<T> {
  const email = (opts.email ?? '').toLowerCase();
  const cfg = opts.config.find((c) => c.exec.email === email) ?? null;

  const actioned = opts.views.filter(opts.isActionedThisWeek);
  const notActioned = opts.views.filter((v) => !opts.isActionedThisWeek(v));

  // Unscoped (admin / observer / unregistered exec): everything in scope.
  if (!cfg) {
    return { scopedExec: null, actioned, inScope: notActioned, outOfScope: [] };
  }

  const assigned = notActioned.filter((v) => partnerMatchesExec(opts.getPartner(v), cfg));
  const limit = cfg.limits.find((l) => l.tab === opts.tab)?.maxPartners ?? Number.POSITIVE_INFINITY;
  const inScope = assigned.slice(0, limit);
  const inScopeIds = new Set(inScope.map((v) => opts.getPartner(v).partnerId));
  const outOfScope = notActioned.filter((v) => !inScopeIds.has(opts.getPartner(v).partnerId));

  return { scopedExec: cfg.exec, actioned, inScope, outOfScope };
}
