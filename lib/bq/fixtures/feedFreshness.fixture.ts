import type { FeedFreshness } from '../queries/feedFreshness';

export const FEED_FRESHNESS_FIXTURE: FeedFreshness = {
  // Pretend the feed updated yesterday — typical "live" state.
  maxOrderDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
  queriedAt: new Date().toISOString(),
  error: null,
};
