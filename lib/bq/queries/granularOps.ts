// Partner-grain ops aggregates over trailing 7d / 28d. Tab 1 (Triage Queue)
// data foundation. Adapts Appendix B Query 1 (Granular Ops). Brief §6 metrics
// 1, 2, 3, 4, 9, 11, 12 derive from this file; §6 metrics 5, 6 (prep time, AOD)
// are also aggregated here so the detail-card metrics block can reuse the row.
//
// Re-derived from §5.2 + §6 SQL patterns in absence of `Queries for Claude.pdf`
// (plan open dependency #3). Conventions preserved: Europe/London time zone,
// CTE-aggregate-then-join to avoid fan-out (§5.2), pos_code helpers from
// lib/bq/keys.ts.

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';
import { partnerIdSql, platformCodeSql } from '../keys';

export interface PartnerOpsRow {
  partnerId: string;
  partnerName: string | null;
  partnerType: string | null;
  hostStatus: string | null;
  brandStack: string | null;
  hubspotCompanyId: string | null;
  /** Sessions Serve venue IDs that share this partner_id (LEFT(pos_code,7)). Used to look up compliance rows. */
  serveVenueIds: string[];
  platforms: string[];
  isOnDeliveroo: boolean;

  gmv7d: number;
  orders7d: number;
  openRate7d: number | null;
  missingItemsPct7d: number | null;
  riderWait5minPct7d: number | null;
  rejectedRate7d: number | null;
  rejectedCount7d: number;
  prepMinutes7d: number | null;
  aod7d: number | null;
  aov7d: number | null;
  rating28d: number | null;

  gmv28d: number;
  orders28d: number;

  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  opsStale: boolean;

  // Paused-state fields (populated for everyone, used by Tab 5).
  pausedFrom: string | null;
  pausedUntil: string | null;
  hostLaunchDate: string | null;

  /** Refurbishment / planned-closure flag. Wired off REFURBISHMENT_HUBSPOT_FIELD; until that's set, defaults to false. */
  refurbishment: boolean;
}

interface RawRow {
  partner_id: string;
  partner_name: string | null;
  partner_type_raw: string | null;
  host_status: string | null;
  brand_stack: string | null;
  hubspot_company_id: string | null;
  serve_venue_ids: string[] | null;
  platforms: string[];

  gmv_7d: number;
  orders_7d: number;
  open_rate_7d: number | null;
  missing_items_pct_7d: number | null;
  rider_wait_pct_7d: number | null;
  rejected_rate_7d: number | null;
  rejected_count_7d: number | null;
  prep_minutes_7d: number | null;
  aod_7d: number | null;
  rating_28d: number | null;

  gmv_28d: number;
  orders_28d: number;

  last_order_date: string | null;
  most_recent_ops_date: string | null;
  paused_from: string | null;
  paused_until: string | null;
  host_launch_date: string | null;
}

const SQL = `
WITH ops AS (
  SELECT
    ${partnerIdSql()}                                                      AS partner_id,
    ${platformCodeSql()}                                                   AS platform_code,
    order_date,
    total_gmv,
    total_order_count,
    bad_avg_open_rate,
    rating_sum,
    rating_count,
    total_orders_rider_wait_5m_plus,
    total_orders_missing_items_count,
    cnt_orders_rejected_total,
    total_prep_time_mins,
    avg_aod
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 28 DAY)
                       AND CURRENT_DATE('Europe/London')
),
partner_meta AS (
  SELECT
    ${partnerIdSql()}                                                      AS partner_id,
    ANY_VALUE(hubspot_name)                                                AS partner_name,
    ANY_VALUE(host_partner_bucket)                                         AS partner_type_raw,
    ANY_VALUE(hubspot_host_status)                                         AS host_status,
    ANY_VALUE(hubspot_companies_id)                                        AS hubspot_company_id,
    ARRAY_AGG(DISTINCT hubspot_serve_venue_id IGNORE NULLS)                AS serve_venue_ids,
    MIN(churn_churned_from_date)                                           AS earliest_churn,
    ANY_VALUE(date_company_entered_pause_status)                           AS paused_from,
    ANY_VALUE(date_company_paused_until)                                   AS paused_until,
    MIN(host_launch_date)                                                  AS host_launch_date,
    ARRAY_AGG(DISTINCT
      CASE ${platformCodeSql()}
        WHEN 'ROO' THEN 'DELIVEROO'
        WHEN 'UBR' THEN 'UBER'
        WHEN 'JET' THEN 'JUSTEAT'
        ELSE NULL
      END IGNORE NULLS)                                                    AS platforms
  FROM \`sessions-core-data.analytics.pos_code_detail_prod\`
  GROUP BY partner_id
),
brand_stack_now AS (
  SELECT
    menu_code,
    ANY_VALUE(brand_stack)                                                 AS brand_stack
  FROM \`sessions-core-data.analytics.host_brand_stacks\`
  WHERE start_date <= CURRENT_DATE('Europe/London')
    AND (end_date IS NULL OR end_date >= CURRENT_DATE('Europe/London'))
  GROUP BY menu_code
),
partner_brand_stack AS (
  SELECT
    p.partner_id,
    STRING_AGG(DISTINCT bs.brand_stack, ' + ' ORDER BY bs.brand_stack)     AS brand_stack
  FROM partner_meta p
  LEFT JOIN \`sessions-core-data.analytics.pos_code_detail_prod\` pd
    ON ${partnerIdSql('pd.pos_code')} = p.partner_id
  LEFT JOIN brand_stack_now bs
    ON SUBSTR(pd.pos_code, 1, 10) = bs.menu_code
  GROUP BY p.partner_id
),
partner_window AS (
  SELECT
    partner_id,
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_gmv, 0))           AS gmv_7d,
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_order_count, 0))   AS orders_7d,
    AVG(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), bad_avg_open_rate, NULL)) AS open_rate_7d,
    SAFE_DIVIDE(
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_orders_missing_items_count, 0)),
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_order_count, 0))
    )                                                                                                      AS missing_items_pct_7d,
    SAFE_DIVIDE(
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY) AND platform_code = 'ROO', total_orders_rider_wait_5m_plus, 0)),
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY) AND platform_code = 'ROO', total_order_count, 0))
    )                                                                                                      AS rider_wait_pct_7d,
    SAFE_DIVIDE(
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), cnt_orders_rejected_total, 0)),
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), cnt_orders_rejected_total + total_order_count, 0))
    )                                                                                                      AS rejected_rate_7d,
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), cnt_orders_rejected_total, 0)) AS rejected_count_7d,
    SAFE_DIVIDE(
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_prep_time_mins, 0)),
      SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_order_count, 0))
    )                                                                                                      AS prep_minutes_7d,
    AVG(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY) AND platform_code = 'ROO', avg_aod, NULL)) AS aod_7d,
    SAFE_DIVIDE(SUM(rating_sum), SUM(rating_count))                                                        AS rating_28d,
    SUM(total_gmv)                                                                                         AS gmv_28d,
    SUM(total_order_count)                                                                                 AS orders_28d,
    MAX(IF(total_order_count > 0, order_date, NULL))                                                       AS last_order_date,
    MAX(order_date)                                                                                        AS most_recent_ops_date
  FROM ops
  GROUP BY partner_id
)
SELECT
  pm.partner_id,
  pm.partner_name,
  pm.partner_type_raw,
  pm.host_status,
  pbs.brand_stack,
  pm.hubspot_company_id,
  pm.serve_venue_ids,
  pm.platforms,
  pw.gmv_7d, pw.orders_7d, pw.open_rate_7d, pw.missing_items_pct_7d,
  pw.rider_wait_pct_7d, pw.rejected_rate_7d, pw.rejected_count_7d, pw.prep_minutes_7d, pw.aod_7d, pw.rating_28d,
  pw.gmv_28d, pw.orders_28d,
  pw.last_order_date, pw.most_recent_ops_date,
  pm.paused_from, pm.paused_until, pm.host_launch_date
FROM partner_meta pm
JOIN partner_window pw USING (partner_id)
LEFT JOIN partner_brand_stack pbs USING (partner_id)
WHERE pm.earliest_churn IS NULL OR pm.earliest_churn > CURRENT_DATE('Europe/London')
ORDER BY pw.gmv_28d DESC
`;

function normalisePartnerType(raw: string | null): string | null {
  if (!raw) return null;
  return raw === 'Duet only' ? 'Delivery' : raw;
}

function rowToPartner(r: RawRow): PartnerOpsRow {
  const last = r.last_order_date;
  const today = new Date();
  const daysSinceLastOrder = last
    ? Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - new Date(last).getTime()) / 86400000)
    : null;
  const mostRecentOps = r.most_recent_ops_date ? new Date(r.most_recent_ops_date) : null;
  const opsStale =
    !mostRecentOps ||
    Date.now() - mostRecentOps.getTime() > 36 * 3600 * 1000;
  return {
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    partnerType: normalisePartnerType(r.partner_type_raw),
    hostStatus: r.host_status,
    brandStack: r.brand_stack,
    hubspotCompanyId: r.hubspot_company_id,
    serveVenueIds: r.serve_venue_ids ?? [],
    platforms: r.platforms ?? [],
    isOnDeliveroo: (r.platforms ?? []).includes('DELIVEROO'),
    gmv7d: Number(r.gmv_7d ?? 0),
    orders7d: Number(r.orders_7d ?? 0),
    openRate7d: r.open_rate_7d,
    missingItemsPct7d: r.missing_items_pct_7d,
    riderWait5minPct7d: r.rider_wait_pct_7d,
    rejectedRate7d: r.rejected_rate_7d,
    rejectedCount7d: Number(r.rejected_count_7d ?? 0),
    prepMinutes7d: r.prep_minutes_7d,
    aod7d: r.aod_7d,
    aov7d:
      r.orders_7d && Number(r.orders_7d) > 0
        ? Number(r.gmv_7d) / Number(r.orders_7d)
        : null,
    rating28d: r.rating_28d,
    gmv28d: Number(r.gmv_28d ?? 0),
    orders28d: Number(r.orders_28d ?? 0),
    lastOrderDate: r.last_order_date,
    daysSinceLastOrder,
    opsStale,
    pausedFrom: r.paused_from,
    pausedUntil: r.paused_until,
    hostLaunchDate: r.host_launch_date,
    // REFURBISHMENT_HUBSPOT_FIELD is null until Jack confirms the source column;
    // once set, swap this default for the column value (also update SELECT clause).
    refurbishment: false,
  };
}

async function fetchPartnerOpsRaw(): Promise<PartnerOpsRow[]> {
  const { rows } = await runQuery<RawRow>(SQL);
  return rows.map(rowToPartner);
}

export const fetchPartnerOps = cachedQuery(fetchPartnerOpsRaw, {
  tag: TAB_TAGS.queue,
  ttlSeconds: TTL.ops,
  extraTags: ['metric:granular-ops'],
});
