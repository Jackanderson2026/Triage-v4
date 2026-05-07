// Tab 2 (Deliveroo Offboarding Risk) — per-partner 3-month ROO-only aggregates
// for the three Service Pack triggers. Brief §7.2.1.
//
// Source: production.delivery_core_ops, filtered to RIGHT(pos_code,3) = 'ROO'.
// Joined to analytics.pos_code_detail_prod for partner name + churn filter.
// Excludes churned partners.

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';
import { partnerIdSql, platformCodeSql } from '../keys';

export interface OffboardingSignalRow {
  partnerId: string;
  partnerName: string | null;
  brandStack: string | null;
  refurbishment: boolean;
  daysSinceLastOrder: number | null;
  riderWait3m: number | null;
  missingItems3m: number | null;
  orders3m: number;
}

interface RawRow {
  partner_id: string;
  partner_name: string | null;
  brand_stack: string | null;
  last_order_date: string | null;
  rider_wait_3m: number | null;
  missing_items_3m: number | null;
  orders_3m: number;
}

const SQL = `
WITH ops AS (
  SELECT
    ${partnerIdSql()}                                                      AS partner_id,
    order_date,
    total_order_count,
    total_orders_rider_wait_5m_plus,
    total_orders_missing_items_count
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 90 DAY)
                       AND CURRENT_DATE('Europe/London')
    AND ${platformCodeSql()} = 'ROO'
),
partner_meta AS (
  SELECT
    ${partnerIdSql()}                                                      AS partner_id,
    ANY_VALUE(hubspot_name)                                                AS partner_name,
    MIN(churn_churned_from_date)                                           AS earliest_churn,
    LOGICAL_OR(${platformCodeSql()} = 'ROO')                               AS has_roo
  FROM \`sessions-core-data.analytics.pos_code_detail_prod\`
  GROUP BY partner_id
),
brand_stack_now AS (
  SELECT menu_code, ANY_VALUE(brand_stack) AS brand_stack
  FROM \`sessions-core-data.analytics.host_brand_stacks\`
  WHERE start_date <= CURRENT_DATE('Europe/London')
    AND (end_date IS NULL OR end_date >= CURRENT_DATE('Europe/London'))
  GROUP BY menu_code
),
partner_brand_stack AS (
  SELECT
    pm.partner_id,
    STRING_AGG(DISTINCT bs.brand_stack, ' + ' ORDER BY bs.brand_stack)     AS brand_stack
  FROM partner_meta pm
  LEFT JOIN \`sessions-core-data.analytics.pos_code_detail_prod\` pd
    ON ${partnerIdSql('pd.pos_code')} = pm.partner_id
  LEFT JOIN brand_stack_now bs
    ON SUBSTR(pd.pos_code, 1, 10) = bs.menu_code
  GROUP BY pm.partner_id
),
agg AS (
  SELECT
    partner_id,
    SAFE_DIVIDE(SUM(total_orders_rider_wait_5m_plus), SUM(total_order_count))   AS rider_wait_3m,
    SAFE_DIVIDE(SUM(total_orders_missing_items_count), SUM(total_order_count))  AS missing_items_3m,
    SUM(total_order_count)                                                      AS orders_3m,
    MAX(IF(total_order_count > 0, order_date, NULL))                            AS last_order_date
  FROM ops
  GROUP BY partner_id
)
SELECT
  pm.partner_id,
  pm.partner_name,
  pbs.brand_stack,
  agg.last_order_date,
  agg.rider_wait_3m,
  agg.missing_items_3m,
  COALESCE(agg.orders_3m, 0) AS orders_3m
FROM partner_meta pm
LEFT JOIN agg USING (partner_id)
LEFT JOIN partner_brand_stack pbs USING (partner_id)
WHERE pm.has_roo = TRUE
  AND (pm.earliest_churn IS NULL OR pm.earliest_churn > CURRENT_DATE('Europe/London'))
`;

function rowToSignal(r: RawRow): OffboardingSignalRow {
  const today = new Date();
  const last = r.last_order_date;
  const daysSinceLastOrder = last
    ? Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - new Date(last).getTime()) / 86400000)
    : null;
  return {
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    brandStack: r.brand_stack,
    // Refurbishment flag location is open dependency #4. Until the source field
    // is confirmed, we default to false here and the toggle in the UI will land
    // alongside the wire-up.
    refurbishment: false,
    daysSinceLastOrder,
    riderWait3m: r.rider_wait_3m,
    missingItems3m: r.missing_items_3m,
    orders3m: Number(r.orders_3m ?? 0),
  };
}

async function fetchOffboardingSignalsRaw(): Promise<OffboardingSignalRow[]> {
  const { rows } = await runQuery<RawRow>(SQL);
  return rows.map(rowToSignal);
}

export const fetchOffboardingSignals = cachedQuery(fetchOffboardingSignalsRaw, {
  tag: TAB_TAGS.offboarding,
  ttlSeconds: TTL.slow,
  extraTags: ['metric:offboarding-signals'],
});
