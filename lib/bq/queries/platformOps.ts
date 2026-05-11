// Per-partner-per-platform ops aggregates. Surfaced inside PartnerCard's
// expanded body so AMs can see whether a partner is good overall but bad on
// one specific platform (e.g. Deliveroo on fire, Uber fine).
//
// Trailing 28 days, partner_id × platform grain.

import { runQuery } from '../client';
import { partnerIdSql, platformCaseSql, platformCodeSql } from '../keys';

export interface PartnerPlatformRow {
  partnerId: string;
  platform: string; // DELIVEROO / UBER / JUSTEAT
  gmv7d: number;
  gmv28d: number;
  orders7d: number;
  orders28d: number;
  openRate7d: number | null;
  missingItemsPct7d: number | null;
  riderWait5minPct7d: number | null;
  rating28d: number | null;
  rejectedCount7d: number;
}

interface RawRow {
  partner_id: string;
  platform: string;
  gmv_7d: number;
  gmv_28d: number;
  orders_7d: number;
  orders_28d: number;
  open_rate_7d: number | null;
  missing_items_pct_7d: number | null;
  rider_wait_pct_7d: number | null;
  rating_28d: number | null;
  rejected_count_7d: number;
}

const SQL = `
WITH ops AS (
  SELECT
    ${partnerIdSql()}                                                       AS partner_id,
    ${platformCodeSql()}                                                    AS platform_code,
    ${platformCaseSql()}                                                    AS platform,
    order_date,
    total_gmv,
    total_order_count,
    bad_avg_open_rate,
    rating_sum,
    rating_count,
    total_orders_rider_wait_5m_plus,
    total_orders_missing_items_count,
    cnt_orders_rejected_total
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 28 DAY)
                       AND CURRENT_DATE('Europe/London')
)
SELECT
  partner_id,
  platform,
  SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_gmv, 0))           AS gmv_7d,
  SUM(total_gmv)                                                                                         AS gmv_28d,
  SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_order_count, 0))   AS orders_7d,
  SUM(total_order_count)                                                                                 AS orders_28d,
  AVG(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), bad_avg_open_rate, NULL)) AS open_rate_7d,
  SAFE_DIVIDE(
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_orders_missing_items_count, 0)),
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), total_order_count, 0))
  )                                                                                                      AS missing_items_pct_7d,
  SAFE_DIVIDE(
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY) AND platform_code = 'ROO', total_orders_rider_wait_5m_plus, 0)),
    SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY) AND platform_code = 'ROO', total_order_count, 0))
  )                                                                                                      AS rider_wait_pct_7d,
  SAFE_DIVIDE(SUM(rating_sum), SUM(rating_count))                                                        AS rating_28d,
  SUM(IF(order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY), cnt_orders_rejected_total, 0)) AS rejected_count_7d
FROM ops
WHERE platform IS NOT NULL
GROUP BY partner_id, platform
ORDER BY partner_id, platform
`;

function rowToPlatform(r: RawRow): PartnerPlatformRow {
  return {
    partnerId: r.partner_id,
    platform: r.platform,
    gmv7d: Number(r.gmv_7d ?? 0),
    gmv28d: Number(r.gmv_28d ?? 0),
    orders7d: Number(r.orders_7d ?? 0),
    orders28d: Number(r.orders_28d ?? 0),
    openRate7d: r.open_rate_7d,
    missingItemsPct7d: r.missing_items_pct_7d,
    riderWait5minPct7d: r.rider_wait_pct_7d,
    rating28d: r.rating_28d,
    rejectedCount7d: Number(r.rejected_count_7d ?? 0),
  };
}

export async function fetchPlatformOps(): Promise<Map<string, PartnerPlatformRow[]>> {
  const { rows } = await runQuery<RawRow>(SQL);
  const byPartner = new Map<string, PartnerPlatformRow[]>();
  for (const r of rows) {
    const view = rowToPlatform(r);
    const list = byPartner.get(view.partnerId) ?? [];
    list.push(view);
    byPartner.set(view.partnerId, list);
  }
  return byPartner;
}
