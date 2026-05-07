// Read-through cache wrapper. Brief §5.1 — metric-specific TTLs, revalidation
// tags so the header "Reload" button can bust the current tab's tags.
//
// Usage:
//   export const fetchFoo = cachedQuery(
//     async (args) => { ... },
//     { tag: 'tab:queue', ttlSeconds: 600 },
//   );

import { unstable_cache } from 'next/cache';

export interface CacheOptions {
  /** Revalidation tag — e.g. 'tab:queue', 'metric:gmv'. Used by revalidateTag(). */
  tag: string;
  /** TTL in seconds. Default 600 (10 min, brief default). */
  ttlSeconds?: number;
  /** Extra tags so a single reload can invalidate multiple metrics. */
  extraTags?: string[];
}

export const TTL = {
  default: 600, // 10 min — brief default
  ops: 300, // 5 min — Open Rate, current-day GMV
  slow: 1800, // 30 min — Sessions Score components, weekly aggregates
  monthly: 3600, // 60 min — compliance (monthly snapshot), offboarding-risk monthly view
} as const;

export function cachedQuery<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  options: CacheOptions,
): (...args: Args) => Promise<R> {
  const tags = [options.tag, ...(options.extraTags ?? [])];
  // unstable_cache derives the cache key from the function reference + args,
  // so we don't need to encode them into the key array ourselves.
  return unstable_cache(fn, [options.tag], {
    tags,
    revalidate: options.ttlSeconds ?? TTL.default,
  });
}

// Tags every tab's read path uses, so the "Reload" button has a canonical list.
export const TAB_TAGS = {
  queue: 'tab:queue',
  offboarding: 'tab:offboarding',
  inactiveCore: 'tab:inactive-core',
  inactiveMenus: 'tab:inactive-menus',
  paused: 'tab:paused',
  nonCompliant: 'tab:non-compliant',
} as const;
export type TabTag = (typeof TAB_TAGS)[keyof typeof TAB_TAGS];
