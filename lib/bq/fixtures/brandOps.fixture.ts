import type { BrandOpsRow, BrandWeek } from '../queries/brandOps';

function eightWeeks(): string[] {
  const out: string[] = [];
  const today = new Date();
  const dayOfWeek = (today.getUTCDay() + 6) % 7;
  today.setUTCDate(today.getUTCDate() - dayOfWeek);
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const WEEKS = eightWeeks();

function weeks(opts: { gmv: number; orders: number; rating: number | null; open: number | null; miss: number | null; seed: number }): BrandWeek[] {
  let s = opts.seed;
  return WEEKS.map((weekStart) => {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const wobble = (b: number, v: number): number => Math.max(0, b + (r - 0.5) * 2 * v);
    return {
      weekStart,
      gmv: wobble(opts.gmv, opts.gmv * 0.2),
      orders: Math.round(wobble(opts.orders, opts.orders * 0.18)),
      rating: opts.rating === null ? null : wobble(opts.rating, 0.12),
      openRate: opts.open === null ? null : wobble(opts.open, 0.025),
      missingItemsPct: opts.miss === null ? null : wobble(opts.miss, 0.012),
    };
  });
}

function brand(partnerId: string, brandName: string, base: { gmv: number; orders: number; rating: number | null; open: number | null; miss: number | null; rider: number | null; rejected: number; seed: number }): BrandOpsRow {
  const w = weeks(base);
  const last = w[w.length - 1]!;
  return {
    partnerId,
    brandName,
    gmv7d: last.gmv,
    orders7d: last.orders,
    rating28d: last.rating,
    openRate7d: last.openRate,
    missingItemsPct7d: last.missingItemsPct,
    riderWait5minPct7d: base.rider,
    rejectedCount7d: base.rejected,
    weeks: w,
  };
}

export const BRAND_OPS_FIXTURE: Map<string, BrandOpsRow[]> = new Map([
  ['P000001', [
    brand('P000001', 'Halo Burger', { gmv: 12400, orders: 280, rating: 4.5, open: 0.91, miss: 0.012, rider: 0.06, rejected: 1, seed: 11 }),
    brand('P000001', 'SoBe Burger', { gmv: 6020, orders: 132, rating: 4.6, open: 0.93, miss: 0.011, rider: 0.05, rejected: 0, seed: 12 }),
  ]],
  ['P000002', [
    brand('P000002', "Biff's", { gmv: 0, orders: 0, rating: 4.6, open: null, miss: null, rider: null, rejected: 0, seed: 21 }),
  ]],
  ['P000003', [
    brand('P000003', 'SoBe Burger', { gmv: 6210, orders: 168, rating: 4.2, open: 0.97, miss: 0.041, rider: 0.105, rejected: 3, seed: 31 }),
  ]],
  ['P000004', [
    brand('P000004', 'Halo Burger', { gmv: 9320, orders: 215, rating: 4.7, open: 0.99, miss: 0.008, rider: 0.045, rejected: 0, seed: 41 }),
  ]],
  ['P000005', [
    brand('P000005', 'Halo Burger', { gmv: 0, orders: 0, rating: 4.4, open: null, miss: null, rider: null, rejected: 0, seed: 51 }),
    brand('P000005', 'SoBe Burger', { gmv: 0, orders: 0, rating: 4.4, open: null, miss: null, rider: null, rejected: 0, seed: 52 }),
  ]],
  ['P000006', [
    brand('P000006', 'SoBe Burger', { gmv: 0, orders: 0, rating: 4.3, open: null, miss: null, rider: null, rejected: 0, seed: 61 }),
  ]],
  ['P000010', [
    brand('P000010', "Biff's", { gmv: 0, orders: 0, rating: 4.5, open: null, miss: null, rider: null, rejected: 0, seed: 71 }),
  ]],
]);
