// Global "is the BQ ops feed still updating?" check. One row, one column.
// Used by the FeedFreshnessIndicator pinned to the app header — separate from
// per-partner inactivity (which is its own triage tier).
//
// Cached for 5 minutes — feed freshness changes slowly (the table refreshes
// daily) and we don't want to spend BQ on this every page load.

import { runQuery } from '../client';
import { cachedQuery } from '../cache';

export interface FeedFreshness {
  /** Most recent order_date seen in delivery_core_ops, across all partners. ISO date. */
  maxOrderDate: string | null;
  /** Wall-clock time the query ran. Lets the UI compute "X hours ago" client-side. */
  queriedAt: string;
}

interface RawRow {
  max_order_date: string | null;
}

async function fetchFeedFreshnessRaw(): Promise<FeedFreshness> {
  const { rows } = await runQuery<RawRow>(
    `SELECT MAX(order_date) AS max_order_date
     FROM \`sessions-core-data.production.delivery_core_ops\`
     WHERE order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY)`,
  );
  return {
    maxOrderDate: rows[0]?.max_order_date ?? null,
    queriedAt: new Date().toISOString(),
  };
}

export const fetchFeedFreshness = cachedQuery(fetchFeedFreshnessRaw, {
  tag: 'feed:freshness',
  ttlSeconds: 5 * 60,
});
