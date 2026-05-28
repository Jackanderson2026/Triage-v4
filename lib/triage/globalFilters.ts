// Global filter params persist across tab navigation; tab-local ones don't.
//
// Global (propagate):
//   - partnerType, brandStack, hostStatus — set by the chip rows in GlobalFilterBar
//
// Tab-local (don't propagate):
//   - page, sort, tier, brand (sub-tab), firing, days, platform, id (detail panel)

export const GLOBAL_FILTER_KEYS = ['partnerType', 'brandStack', 'hostStatus'] as const;

type SearchParamRecord = Record<string, string | string[] | undefined>;

/**
 * Pull just the global params out of a page's searchParams into a
 * URLSearchParams that TabNav links can append to their hrefs.
 */
export function extractGlobalParams(searchParams: SearchParamRecord): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of GLOBAL_FILTER_KEYS) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) out.set(key, value);
  }
  return out;
}
