import type { PartnerSparkline } from '../queries/sparklines';
import { PARTNER_OPS_FIXTURE } from './partnerOps.fixture';

function eightWeeks(): string[] {
  const out: string[] = [];
  const today = new Date();
  // Walk back to most recent Monday.
  const dayOfWeek = (today.getUTCDay() + 6) % 7; // Mon=0
  today.setUTCDate(today.getUTCDate() - dayOfWeek);
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const WEEKS = eightWeeks();

function jitter(base: number, variance: number, seed: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < WEEKS.length; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    out.push(Math.max(0, base + (r - 0.5) * 2 * variance));
  }
  return out;
}

export const SPARKLINES_FIXTURE: Map<string, PartnerSparkline> = new Map(
  PARTNER_OPS_FIXTURE.map((p, idx) => {
    const seed = idx + 1;
    const sl: PartnerSparkline = {
      partnerId: p.partnerId,
      weeks: WEEKS,
      gmv: jitter(p.gmv7d || p.gmv28d / 4 || 1500, (p.gmv7d || 1500) * 0.25, seed),
      openRate: p.openRate7d === null ? Array(WEEKS.length).fill(null) : jitter(p.openRate7d, 0.03, seed + 1),
      missingItems:
        p.missingItemsPct7d === null
          ? Array(WEEKS.length).fill(null)
          : jitter(p.missingItemsPct7d, 0.012, seed + 2),
      riderWait:
        p.riderWait5minPct7d === null
          ? Array(WEEKS.length).fill(null)
          : jitter(p.riderWait5minPct7d, 0.025, seed + 3),
      rating:
        p.rating28d === null ? Array(WEEKS.length).fill(null) : jitter(p.rating28d, 0.15, seed + 4),
    };
    return [p.partnerId, sl];
  }),
);
