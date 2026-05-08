// Brand-grain ops aggregates per partner. Powers the brand sub-rows on the
// expanded partner card (v3 parity — a partner can be clean overall but have
// one brand on fire).
//
// Brand grain = brand_name from pos_code_detail_prod, aggregated across all
// menus that share that brand for a given partner. We carry 8 weeks of weekly
// rollups inline so the brand row sparkline doesn't require a second query.

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';
import { partnerIdSql, platformCodeSql } from '../keys';

export interface BrandWeek {
  weekStart: string;
  gmv: number;
  orders: number;
  rating: number | null;
  openRate: number | null;
  missingItemsPct: number | null;
}

export interface BrandOpsRow {
  partnerId: string;
  brandName: string;
  /** Most recent week's GMV (the chip on the row). */
  gmv7d: number;
  orders7d: number;
  rating28d: number | null;
  openRate7d: number | null;
  missingItemsPct7d: number | null;
  riderWait5minPct7d: number | null;
  rejectedCount7d: number;
  weeks: BrandWeek[];
}

interface RawWeekRow {
  partner_id: string;
  brand_name: string;
  week_start: string;
  gmv: number | null;
  orders: number | null;
  rating: number | null;
  open_rate: number | null;
  missing_items_pct: number | null;
  rider_wait_pct: number | null;
  rejected_count: number | null;
}

const SQL = `
WITH ops AS (
  SELECT
    ${partnerIdSql()}                                                       AS partner_id,
    ${platformCodeSql()}                                                    AS platform_code,
    pos_code,
    DATE_TRUNC(order_date, WEEK(MONDAY))                                    AS week_start,
    total_gmv,
    total_order_count,
    bad_avg_open_rate,
    rating_sum,
    rating_count,
    total_orders_rider_wait_5m_plus,
    total_orders_missing_items_count,
    cnt_orders_rejected_total
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/London'), WEEK(MONDAY)), INTERVAL 8 WEEK)
                       AND CURRENT_DATE('Europe/London')
),
brand_map AS (
  SELECT
    pos_code,
    ANY_VALUE(brand_name)                                                   AS brand_name
  FROM \`sessions-core-data.analytics.pos_code_detail_prod\`
  WHERE brand_name IS NOT NULL
  GROUP BY pos_code
)
SELECT
  ops.partner_id,
  bm.brand_name,
  CAST(ops.week_start AS STRING)                                                          AS week_start,
  SUM(ops.total_gmv)                                                                      AS gmv,
  SUM(ops.total_order_count)                                                              AS orders,
  SAFE_DIVIDE(SUM(ops.rating_sum), SUM(ops.rating_count))                                 AS rating,
  AVG(ops.bad_avg_open_rate)                                                              AS open_rate,
  SAFE_DIVIDE(SUM(ops.total_orders_missing_items_count), SUM(ops.total_order_count))      AS missing_items_pct,
  SAFE_DIVIDE(
    SUM(IF(ops.platform_code = 'ROO', ops.total_orders_rider_wait_5m_plus, 0)),
    SUM(IF(ops.platform_code = 'ROO', ops.total_order_count, 0))
  )                                                                                       AS rider_wait_pct,
  SUM(ops.cnt_orders_rejected_total)                                                      AS rejected_count
FROM ops
JOIN brand_map bm USING (pos_code)
GROUP BY partner_id, brand_name, week_start
ORDER BY partner_id, brand_name, week_start
`;

const ONE_WEEK_MS = 7 * 86_400_000;

function rollUp(rows: RawWeekRow[]): Map<string, BrandOpsRow[]> {
  const byPartnerBrand = new Map<string, BrandOpsRow>();
  for (const r of rows) {
    const key = `${r.partner_id}::${r.brand_name}`;
    let row = byPartnerBrand.get(key);
    if (!row) {
      row = {
        partnerId: r.partner_id,
        brandName: r.brand_name,
        gmv7d: 0,
        orders7d: 0,
        rating28d: null,
        openRate7d: null,
        missingItemsPct7d: null,
        riderWait5minPct7d: null,
        rejectedCount7d: 0,
        weeks: [],
      };
      byPartnerBrand.set(key, row);
    }
    row.weeks.push({
      weekStart: r.week_start,
      gmv: Number(r.gmv ?? 0),
      orders: Number(r.orders ?? 0),
      rating: r.rating,
      openRate: r.open_rate,
      missingItemsPct: r.missing_items_pct,
    });
  }

  const allRows = Array.from(byPartnerBrand.values());
  // Derive 7d / 28d aggregates from the most recent week(s).
  for (const row of allRows) {
    if (row.weeks.length === 0) continue;
    const lastWeek = row.weeks[row.weeks.length - 1]!;
    row.gmv7d = lastWeek.gmv;
    row.orders7d = lastWeek.orders;
    row.openRate7d = lastWeek.openRate;
    row.missingItemsPct7d = lastWeek.missingItemsPct;
    row.rating28d = lastWeek.rating;
  }

  // Group by partnerId for the consumer.
  const byPartner = new Map<string, BrandOpsRow[]>();
  for (const row of allRows) {
    const list = byPartner.get(row.partnerId) ?? [];
    list.push(row);
    byPartner.set(row.partnerId, list);
  }
  // Sort brands within a partner by 7d GMV desc.
  byPartner.forEach((list) => {
    list.sort((a: BrandOpsRow, b: BrandOpsRow) => b.gmv7d - a.gmv7d);
  });
  return byPartner;
}

async function fetchBrandOpsRaw(): Promise<Array<[string, BrandOpsRow[]]>> {
  const { rows } = await runQuery<RawWeekRow>(SQL);
  const map = rollUp(rows);
  return Array.from(map.entries());
}

const _fetchBrandOpsCached = cachedQuery(fetchBrandOpsRaw, {
  tag: TAB_TAGS.queue,
  ttlSeconds: TTL.slow,
  extraTags: ['metric:brand-ops'],
});

export async function fetchBrandOps(): Promise<Map<string, BrandOpsRow[]>> {
  return new Map(await _fetchBrandOpsCached());
}

// Suppress unused warning — kept for future per-week aggregation if we move
// the 28d rollup off the partner row and onto the brand row.
void ONE_WEEK_MS;
