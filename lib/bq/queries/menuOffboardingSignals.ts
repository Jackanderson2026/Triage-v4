// Menu-grain offboarding signals for /offboarding-risk. Per brand×platform×site,
// computes the trailing 3-month % for the two contractual triggers (rider wait,
// missing items), days since last order, AND the number of consecutive months
// above each Service Pack band threshold for "how long has this been bad".
//
// Monthly resolution chosen (vs weekly) because the contract uses 3-month
// windows — weekly noise would flicker trigger/clear states. 12 months of
// history is plenty to bound "X months above threshold" at a sensible max.
//
// ROO-only — rider wait and the offboarding contract apply only to Deliveroo.

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';
import { menuIdSql, partnerIdSql, platformCodeSql } from '../keys';

export interface MenuOffboardingSignalRow {
  menuId: string;
  partnerId: string;
  menuName: string | null;
  partnerName: string | null;
  brandName: string | null;
  brandStack: string | null;
  platform: string | null; // DELIVEROO / UBER / JUSTEAT — usually DELIVEROO since we filter ROO
  refurbishment: boolean;
  daysSinceLastOrder: number | null;
  /** Trailing 3-month missing-items rate (fraction). Null if no orders. */
  missingItems3m: number | null;
  /** Trailing 3-month rider-wait>5min rate (fraction). Null if no orders. */
  riderWait3m: number | null;
  /** Consecutive full months above the amber missing-items threshold (looking backwards from last completed month). */
  missingItemsMonthsAboveAmber: number;
  /** Consecutive full months above the amber rider-wait threshold. */
  riderWaitMonthsAboveAmber: number;
  /** Consecutive full months inactive (no orders). */
  inactiveMonths: number;
  orders3m: number;
}

interface RawRow {
  menu_id: string;
  partner_id: string;
  menu_name: string | null;
  partner_name: string | null;
  brand_name: string | null;
  brand_stack: string | null;
  platform: string | null;
  last_order_date: string | null;
  rider_wait_3m: number | null;
  missing_items_3m: number | null;
  orders_3m: number;
  rider_wait_months_above: number | null;
  missing_items_months_above: number | null;
  inactive_months: number | null;
}

// Thresholds for the per-month "above amber" tally.
// Inactive: a month is "above amber" if total orders in that month == 0.
// Rider wait: a month is "above amber" if monthly rate >= RIDER_WAIT_BANDS.amber (0.09).
// Missing items: a month is "above amber" if monthly rate >= MISSING_ITEMS_BANDS.amber (0.03).
//
// Constants inlined into the SQL below — kept here as a comment so a future
// retune in lib/triage/thresholds.ts has an obvious lookup hint.
const SQL = `
WITH ops AS (
  SELECT
    ${menuIdSql()}                                                           AS menu_id,
    ${partnerIdSql()}                                                        AS partner_id,
    DATE_TRUNC(order_date, MONTH)                                            AS month_start,
    order_date,
    total_order_count,
    total_orders_rider_wait_5m_plus,
    total_orders_missing_items_count
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/London'), MONTH), INTERVAL 12 MONTH)
                       AND CURRENT_DATE('Europe/London')
    AND ${platformCodeSql()} = 'ROO'
),
month_agg AS (
  SELECT
    menu_id,
    partner_id,
    month_start,
    SUM(total_order_count)                                                                          AS orders,
    SAFE_DIVIDE(SUM(total_orders_rider_wait_5m_plus), SUM(total_order_count))                       AS rider_wait_rate,
    SAFE_DIVIDE(SUM(total_orders_missing_items_count), SUM(total_order_count))                      AS missing_items_rate
  FROM ops
  GROUP BY menu_id, partner_id, month_start
),
month_flags AS (
  -- Tag each month with whether it crossed the amber band.
  SELECT
    menu_id,
    partner_id,
    month_start,
    orders,
    rider_wait_rate,
    missing_items_rate,
    (orders = 0 OR orders IS NULL)               AS is_inactive,
    rider_wait_rate >= 0.09                      AS rider_wait_above,
    missing_items_rate >= 0.03                   AS missing_items_above
  FROM month_agg
  WHERE month_start < DATE_TRUNC(CURRENT_DATE('Europe/London'), MONTH)
),
streaks AS (
  -- For each menu, count consecutive most-recent completed months where the flag is true.
  -- ROW_NUMBER over reverse-chronological ordering, then take the position of the first FALSE.
  SELECT
    menu_id,
    partner_id,
    -- inactive streak
    COUNTIF(is_inactive_streak) OVER (PARTITION BY menu_id) AS inactive_months,
    COUNTIF(rider_streak)       OVER (PARTITION BY menu_id) AS rider_wait_months_above,
    COUNTIF(missing_streak)     OVER (PARTITION BY menu_id) AS missing_items_months_above
  FROM (
    SELECT
      menu_id,
      partner_id,
      month_start,
      is_inactive,
      rider_wait_above,
      missing_items_above,
      -- "streak" flag: true if every more-recent month (and this one) is also true.
      is_inactive
        AND COUNTIF(NOT is_inactive)        OVER (PARTITION BY menu_id ORDER BY month_start DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) = 0
        AS is_inactive_streak,
      rider_wait_above
        AND COUNTIF(NOT rider_wait_above)   OVER (PARTITION BY menu_id ORDER BY month_start DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) = 0
        AS rider_streak,
      missing_items_above
        AND COUNTIF(NOT missing_items_above) OVER (PARTITION BY menu_id ORDER BY month_start DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) = 0
        AS missing_streak
    FROM month_flags
  )
  QUALIFY ROW_NUMBER() OVER (PARTITION BY menu_id ORDER BY month_start DESC) = 1
),
agg_3m AS (
  -- Trailing 3 months (rolling, not calendar) for the displayed % values.
  SELECT
    menu_id,
    partner_id,
    SAFE_DIVIDE(SUM(total_orders_rider_wait_5m_plus), SUM(total_order_count))                       AS rider_wait_3m,
    SAFE_DIVIDE(SUM(total_orders_missing_items_count), SUM(total_order_count))                      AS missing_items_3m,
    SUM(total_order_count)                                                                          AS orders_3m,
    MAX(IF(total_order_count > 0, order_date, NULL))                                                AS last_order_date
  FROM ops
  WHERE order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 90 DAY)
  GROUP BY menu_id, partner_id
),
menu_meta AS (
  SELECT
    ${menuIdSql()}                                                            AS menu_id,
    ANY_VALUE(brand_name)                                                     AS brand_name,
    ANY_VALUE(hubspot_name)                                                   AS partner_name,
    MIN(churn_churned_from_date)                                              AS earliest_churn
  FROM \`sessions-core-data.analytics.pos_code_detail_prod\`
  GROUP BY menu_id
),
brand_stack_now AS (
  SELECT menu_code, ANY_VALUE(brand_stack) AS brand_stack
  FROM \`sessions-core-data.analytics.host_brand_stacks\`
  WHERE start_date <= CURRENT_DATE('Europe/London')
    AND (end_date IS NULL OR end_date >= CURRENT_DATE('Europe/London'))
  GROUP BY menu_code
)
SELECT
  agg.menu_id,
  agg.partner_id,
  CONCAT(COALESCE(mm.brand_name, 'Unknown'), ' · ', COALESCE(mm.partner_name, agg.partner_id)) AS menu_name,
  mm.partner_name,
  mm.brand_name,
  bs.brand_stack,
  'DELIVEROO'                                                                AS platform,
  agg.last_order_date,
  agg.rider_wait_3m,
  agg.missing_items_3m,
  COALESCE(agg.orders_3m, 0)                                                 AS orders_3m,
  COALESCE(s.rider_wait_months_above, 0)                                     AS rider_wait_months_above,
  COALESCE(s.missing_items_months_above, 0)                                  AS missing_items_months_above,
  COALESCE(s.inactive_months, 0)                                             AS inactive_months
FROM agg_3m agg
LEFT JOIN menu_meta mm USING (menu_id)
LEFT JOIN streaks s     USING (menu_id, partner_id)
LEFT JOIN brand_stack_now bs ON bs.menu_code = agg.menu_id
WHERE mm.earliest_churn IS NULL OR mm.earliest_churn > CURRENT_DATE('Europe/London')
`;

function rowToSignal(r: RawRow): MenuOffboardingSignalRow {
  const today = new Date();
  const last = r.last_order_date;
  const daysSinceLastOrder = last
    ? Math.floor(
        (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
          new Date(last).getTime()) /
          86400000,
      )
    : null;
  return {
    menuId: r.menu_id,
    partnerId: r.partner_id,
    menuName: r.menu_name,
    partnerName: r.partner_name,
    brandName: r.brand_name,
    brandStack: r.brand_stack,
    platform: r.platform,
    refurbishment: false, // open dep #4 — wire when HubSpot field name lands
    daysSinceLastOrder,
    missingItems3m: r.missing_items_3m,
    riderWait3m: r.rider_wait_3m,
    missingItemsMonthsAboveAmber: Number(r.missing_items_months_above ?? 0),
    riderWaitMonthsAboveAmber: Number(r.rider_wait_months_above ?? 0),
    inactiveMonths: Number(r.inactive_months ?? 0),
    orders3m: Number(r.orders_3m ?? 0),
  };
}

async function fetchMenuOffboardingSignalsRaw(): Promise<MenuOffboardingSignalRow[]> {
  const { rows } = await runQuery<RawRow>(SQL);
  return rows.map(rowToSignal);
}

export const fetchMenuOffboardingSignals = cachedQuery(fetchMenuOffboardingSignalsRaw, {
  tag: TAB_TAGS.offboarding,
  ttlSeconds: TTL.slow,
  extraTags: ['metric:menu-offboarding-signals'],
});
