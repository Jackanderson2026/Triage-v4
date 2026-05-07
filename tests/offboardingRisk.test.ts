import { describe, expect, it } from 'vitest';
import { scoreSite, type SiteSignals } from '@/lib/offboarding-risk/scoring';

const baseline: SiteSignals = {
  partnerId: 'P000001',
  partnerName: 'Halo Burger Shoreditch',
  brandStack: 'Halo Burger',
  refurbishment: false,
  daysSinceLastOrder: 1,
  riderWait3m: 0.04,
  missingItems3m: 0.005,
};

describe('Deliveroo offboarding-risk scoring', () => {
  it('inactive_days = 25 → Red band (21–27d)', () => {
    const r = scoreSite({ ...baseline, daysSinceLastOrder: 25 });
    expect(r.triggers.find((t) => t.trigger === 'inactive')?.band).toBe('red');
    expect(r.band).toBe('red');
  });

  it('rider wait 12% over 3 months → Red band (≥ 11%)', () => {
    const r = scoreSite({ ...baseline, riderWait3m: 0.12 });
    expect(r.triggers.find((t) => t.trigger === 'rider_wait')?.band).toBe('red');
    expect(r.band).toBe('red');
  });

  // The brief is internally inconsistent on this case. §7.2.1 table: "Red if ≥
  // 3.5%; Amber if ≥ 3%". §13 fixture example: 3.6% → Amber. The §7.2.1 table
  // is the more authoritative source (it carries the contractual band
  // definitions), so 3.6% lands in Red. Flagged for resolution with Jack.
  it('missing items 3.6% over 3 months → Red band (≥ 3.5%, per §7.2.1 table)', () => {
    const r = scoreSite({ ...baseline, missingItems3m: 0.036 });
    expect(r.triggers.find((t) => t.trigger === 'missing_items')?.band).toBe('red');
    expect(r.band).toBe('red');
  });

  it('missing items 3.2% over 3 months → Amber band (3% ≤ x < 3.5%)', () => {
    const r = scoreSite({ ...baseline, missingItems3m: 0.032 });
    expect(r.triggers.find((t) => t.trigger === 'missing_items')?.band).toBe('amber');
    expect(r.band).toBe('amber');
  });

  it('overall band is the highest across triggers', () => {
    const r = scoreSite({
      ...baseline,
      daysSinceLastOrder: 22, // red
      riderWait3m: 0.13, // critical
      missingItems3m: 0.036, // amber
    });
    expect(r.band).toBe('critical');
  });

  it('refurbishment flag → excluded with green band, no triggers fire', () => {
    const r = scoreSite({
      ...baseline,
      refurbishment: true,
      daysSinceLastOrder: 60,
      riderWait3m: 0.5,
      missingItems3m: 0.5,
    });
    expect(r.excluded).toBe('refurbishment');
    expect(r.triggers).toHaveLength(0);
    expect(r.band).toBe('green');
  });

  it('clean signals → green band with no triggers', () => {
    const r = scoreSite(baseline);
    expect(r.band).toBe('green');
    expect(r.triggers).toHaveLength(0);
  });

  it('inactive 28+ days → Critical (the offboarding trigger itself)', () => {
    const r = scoreSite({ ...baseline, daysSinceLastOrder: 30 });
    expect(r.band).toBe('critical');
  });

  it('null signals do not flag a trigger', () => {
    const r = scoreSite({
      ...baseline,
      daysSinceLastOrder: null,
      riderWait3m: null,
      missingItems3m: null,
    });
    expect(r.triggers).toHaveLength(0);
    expect(r.band).toBe('green');
  });
});
