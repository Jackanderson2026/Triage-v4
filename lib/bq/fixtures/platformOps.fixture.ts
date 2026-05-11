import type { PartnerPlatformRow } from '../queries/platformOps';
import { PARTNER_OPS_FIXTURE } from './partnerOps.fixture';

// Mock per-platform split: for each fixture partner, mint 1-3 platform rows
// matching their `platforms` array. Splits partner-level totals across
// platforms in fixed ratios so the UI has plausible numbers to render.

const PLATFORM_SHARES: Record<string, Record<string, number>> = {
  // Three-platform partners: 60/30/10
  THREE: { DELIVEROO: 0.6, UBER: 0.3, JUSTEAT: 0.1 },
  // Two-platform partners: 70/30
  TWO_ROO_UBER: { DELIVEROO: 0.7, UBER: 0.3 },
};

function shareKey(platforms: string[]): Record<string, number> {
  if (platforms.length === 3) return PLATFORM_SHARES.THREE!;
  if (platforms.length === 2) return PLATFORM_SHARES.TWO_ROO_UBER!;
  return { [platforms[0] ?? 'DELIVEROO']: 1 };
}

export const PLATFORM_OPS_FIXTURE: Map<string, PartnerPlatformRow[]> = new Map(
  PARTNER_OPS_FIXTURE.map((p) => {
    const shares = shareKey(p.platforms);
    const rows: PartnerPlatformRow[] = p.platforms.map((platform) => {
      const s = shares[platform] ?? 0;
      const isRoo = platform === 'DELIVEROO';
      return {
        partnerId: p.partnerId,
        platform,
        gmv7d: Math.round(p.gmv7d * s),
        gmv28d: Math.round(p.gmv28d * s),
        orders7d: Math.round(p.orders7d * s),
        orders28d: Math.round(p.orders28d * s),
        openRate7d: p.openRate7d,
        missingItemsPct7d: p.missingItemsPct7d,
        riderWait5minPct7d: isRoo ? p.riderWait5minPct7d : null,
        rating28d: p.rating28d,
        rejectedCount7d: Math.round(p.rejectedCount7d * s),
      };
    });
    return [p.partnerId, rows];
  }),
);
