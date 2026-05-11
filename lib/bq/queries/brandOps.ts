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
  /** 7d ad spend for this brand (sum across the brand's pos_codes). */
  adSpend7d: number;
  adSpend28d: number;
  /** 7d discount £ value (= sum total_offer_value). Discount % = discountValue7d / gmv7d. */
  discountValue7d: number;
  discountValue28d: number;
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
  ad_spend: number | null;
  discount_value: number | null;
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
),
ppc AS (
  SELECT pos_code, DATE_TRUNC(date, WEEK(MONDAY)) AS week_start, SUM(advert_cost_to_restaurant) AS ad_spend
  FROM \`sessions-core-data.marketing.ppc_daily_pos_code\`
  WHERE date BETWEEN DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/London'), WEEK(MONDAY)), INTERVAL 8 WEEK)
                 AND CURRENT_DATE('Europe/London')
  GROUP BY pos_code, week_start
),
offer AS (
  SELECT pos_code, DATE_TRUNC(order_date, WEEK(MONDAY)) AS week_start, SUM(total_offer_value) AS discount_value
  FROM \`sessions-core-data.production.platform_offer_daily_pos_code_view\`
  WHERE order_date BETWEEN DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/London'), WEEK(MONDAY)), INTERVAL 8 WEEK)
                       AND CURRENT_DATE('Europe/London')
  GROUP BY pos_code, week_start
),
brand_ops_week AS (
  -- Aggregate ops to (partner, brand, week) BEFORE joining ppc/offer, otherwise
  -- the join fan-outs by the number of order_date rows in each week.
  SELECT
    ops.partner_id,
    bm.brand_name,
    ops.week_start,
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
),
brand_marketing_week AS (
  -- ad spend + discount per (partner, brand, week). Joins ppc/offer to brand_map
  -- via pos_code, then aggregates so the marketing values map cleanly to the
  -- same (partner, brand, week) grain as brand_ops_week.
  SELECT
    ${partnerIdSql('bm.pos_code')}                                          AS partner_id,
    bm.brand_name,
    COALESCE(ppc.week_start, offer.week_start)                              AS week_start,
    SUM(COALESCE(ppc.ad_spend, 0))                                          AS ad_spend,
    SUM(COALESCE(offer.discount_value, 0))                                  AS discount_value
  FROM brand_map bm
  LEFT JOIN ppc   ON ppc.pos_code   = bm.pos_code
  LEFT JOIN offer ON offer.pos_code = bm.pos_code AND offer.week_start = ppc.week_start
  WHERE COALESCE(ppc.week_start, offer.week_start) IS NOT NULL
  GROUP BY partner_id, brand_name, week_start
)
SELECT
  bow.partner_id,
  bow.brand_name,
  CAST(bow.week_start AS STRING)                                                          AS week_start,
  bow.gmv, bow.orders, bow.rating, bow.open_rate, bow.missing_items_pct, bow.rider_wait_pct, bow.rejected_count,
  COALESCE(bmw.ad_spend, 0)                                                               AS ad_spend,
  COALESCE(bmw.discount_value, 0)                                                         AS discount_value
FROM brand_ops_week bow
LEFT JOIN brand_marketing_week bmw
  ON bmw.partner_id = bow.partner_id
 AND bmw.brand_name = bow.brand_name
 AND bmw.week_start = bow.week_start
ORDER BY bow.partner_id, bow.brand_name, bow.week_start
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
        adSpend7d: 0,
        adSpend28d: 0,
        discountValue7d: 0,
        discountValue28d: 0,
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
    // Carry the marketing aggregates per row; we'll fold them in when computing 7d/28d below.
    (row as BrandOpsRow & { _adByWeek?: Map<string, number>; _discByWeek?: Map<string, number> })._adByWeek =
      ((row as BrandOpsRow & { _adByWeek?: Map<string, number> })._adByWeek ?? new Map()).set(
        r.week_start,
        Number(r.ad_spend ?? 0),
      );
    (row as BrandOpsRow & { _discByWeek?: Map<string, number> })._discByWeek =
      ((row as BrandOpsRow & { _discByWeek?: Map<string, number> })._discByWeek ?? new Map()).set(
        r.week_start,
        Number(r.discount_value ?? 0),
      );
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

    // Ad spend + discount over 7d (last week) and 28d (last 4 weeks).
    const adByWeek = (row as BrandOpsRow & { _adByWeek?: Map<string, number> })._adByWeek;
    const discByWeek = (row as BrandOpsRow & { _discByWeek?: Map<string, number> })._discByWeek;
    if (adByWeek) {
      row.adSpend7d = adByWeek.get(lastWeek.weekStart) ?? 0;
      row.adSpend28d = row.weeks.slice(-4).reduce((acc, w) => acc + (adByWeek.get(w.weekStart) ?? 0), 0);
    }
    if (discByWeek) {
      row.discountValue7d = discByWeek.get(lastWeek.weekStart) ?? 0;
      row.discountValue28d = row.weeks.slice(-4).reduce((acc, w) => acc + (discByWeek.get(w.weekStart) ?? 0), 0);
    }
    delete (row as BrandOpsRow & { _adByWeek?: unknown; _discByWeek?: unknown })._adByWeek;
    delete (row as BrandOpsRow & { _adByWeek?: unknown; _discByWeek?: unknown })._discByWeek;
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

// Don't wrap in cachedQuery — the live result with all partners × brands ×
// 8 weeks exceeds Next's unstable_cache 2 MB limit (real data: ~7.4 MB).
// Each request runs the BQ query directly (~1-2s); BQ's own query cache
// covers repeated identical hits within a session.
export async function fetchBrandOps(): Promise<Map<string, BrandOpsRow[]>> {
  const entries = await fetchBrandOpsRaw();
  return new Map(entries);
}

// Cache-tag constants kept here so a future Reload button on /queue still
// invalidates the server-side BQ cache via revalidateTag.
void TAB_TAGS;
void TTL;

// Suppress unused warning — kept for future per-week aggregation if we move
// the 28d rollup off the partner row and onto the brand row.
void ONE_WEEK_MS;
