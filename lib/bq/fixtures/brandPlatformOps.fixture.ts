import type { BrandPlatformRow } from '../queries/brandPlatformOps';
import { BRAND_OPS_FIXTURE } from './brandOps.fixture';

// Mock per-brand × per-platform split. For each brand fixture row, mint
// 1–3 platform variants matching the parent partner's platforms (which we
// approximate as Deliveroo + Uber for partners with brand entries).

const PLATFORMS: Array<{ platform: string; share: number; isRoo: boolean }> = [
  { platform: 'DELIVEROO', share: 0.7, isRoo: true },
  { platform: 'UBER', share: 0.3, isRoo: false },
];

export const BRAND_PLATFORM_OPS_FIXTURE: Map<string, BrandPlatformRow[]> = (() => {
  const out = new Map<string, BrandPlatformRow[]>();
  for (const entry of Array.from(BRAND_OPS_FIXTURE.entries())) {
    const partnerId = entry[0];
    const brands = entry[1];
    for (const brand of brands) {
      const rows = PLATFORMS.map((pl) => ({
        partnerId,
        brandName: brand.brandName,
        platform: pl.platform,
        gmv7d: Math.round(brand.gmv7d * pl.share),
        gmv28d: Math.round(brand.gmv7d * pl.share * 4),
        orders7d: Math.round(brand.orders7d * pl.share),
        orders28d: Math.round(brand.orders7d * pl.share * 4),
        openRate7d: brand.openRate7d,
        missingItemsPct7d: brand.missingItemsPct7d,
        riderWait5minPct7d: pl.isRoo ? brand.riderWait5minPct7d : null,
        rating28d: brand.rating28d,
        rejectedCount7d: Math.round(brand.rejectedCount7d * pl.share),
      }));
      out.set(`${partnerId}::${brand.brandName}`, rows);
    }
  }
  return out;
})();
