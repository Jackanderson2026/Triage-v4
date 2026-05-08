// Menu-grain ops aggregates for Tab 4 (Inactive Menus). Brief §7.4.
// "A site can be active overall but have one menu that's broken" — the join key
// is menu_code (= LEFT(pos_code, 10)).

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';
import { menuIdSql, partnerIdSql, platformCaseSql, platformCodeSql } from '../keys';

export interface MenuOpsRow {
  menuId: string;
  partnerId: string;
  partnerName: string | null;
  brandName: string | null;
  brandStack: string | null;
  platform: string | null;
  isDeliveroo: boolean;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  scheduledMinutes7d: number | null;
  menuLaunchDate: string | null;
}

interface RawRow {
  menu_id: string;
  partner_id: string;
  partner_name: string | null;
  brand_name: string | null;
  brand_stack: string | null;
  platform: string | null;
  last_order_date: string | null;
  scheduled_minutes_7d: number | null;
  menu_launch_date: string | null;
}

const SQL = `
WITH ops AS (
  SELECT
    ${menuIdSql()}                        AS menu_id,
    ${partnerIdSql()}                     AS partner_id,
    ${platformCodeSql()}                  AS platform_code,
    ${platformCaseSql()}                  AS platform,
    order_date,
    total_order_count
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 28 DAY)
                       AND CURRENT_DATE('Europe/London')
),
menu_ops AS (
  SELECT
    menu_id,
    ANY_VALUE(partner_id)                                                  AS partner_id,
    ANY_VALUE(platform)                                                    AS platform,
    MAX(IF(total_order_count > 0, order_date, NULL))                       AS last_order_date,
    LOGICAL_OR(platform_code = 'ROO')                                      AS is_roo
  FROM ops
  GROUP BY menu_id
),
menu_meta AS (
  SELECT
    ${menuIdSql()}                                                         AS menu_id,
    ANY_VALUE(brand_name)                                                  AS brand_name,
    ANY_VALUE(hubspot_name)                                                AS partner_name,
    MIN(menu_launch_date)                                                  AS menu_launch_date,
    MIN(churn_churned_from_date)                                           AS earliest_churn
  FROM \`sessions-core-data.analytics.pos_code_detail_prod\`
  GROUP BY menu_id
),
brand_stack_now AS (
  SELECT menu_code, ANY_VALUE(brand_stack) AS brand_stack
  FROM \`sessions-core-data.analytics.host_brand_stacks\`
  WHERE start_date <= CURRENT_DATE('Europe/London')
    AND (end_date IS NULL OR end_date >= CURRENT_DATE('Europe/London'))
  GROUP BY menu_code
),
sched_7d AS (
  SELECT
    SUBSTR(d5.pos_code, 1, 10) AS menu_id,
    SUM(d5.restaurant_scheduled_minutes) AS scheduled_minutes_7d
  FROM \`sessions-core-data.deliveroo.daily_reports_report_five_production_view\` AS d5
  WHERE d5.date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 7 DAY)
    AND d5.date <  CURRENT_DATE('Europe/London')
  GROUP BY menu_id
)
SELECT
  mo.menu_id,
  mo.partner_id,
  mm.partner_name,
  mm.brand_name,
  bs.brand_stack,
  mo.platform,
  mo.last_order_date,
  s.scheduled_minutes_7d,
  mm.menu_launch_date
FROM menu_ops mo
LEFT JOIN menu_meta mm    USING (menu_id)
LEFT JOIN brand_stack_now bs ON bs.menu_code = mo.menu_id
LEFT JOIN sched_7d s      USING (menu_id)
WHERE mm.earliest_churn IS NULL OR mm.earliest_churn > CURRENT_DATE('Europe/London')
`;

function rowToMenu(r: RawRow): MenuOpsRow {
  const today = new Date();
  const last = r.last_order_date;
  const daysSinceLastOrder = last
    ? Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - new Date(last).getTime()) / 86400000)
    : null;
  return {
    menuId: r.menu_id,
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    brandName: r.brand_name,
    brandStack: r.brand_stack,
    platform: r.platform,
    isDeliveroo: r.platform === 'DELIVEROO',
    lastOrderDate: r.last_order_date,
    daysSinceLastOrder,
    scheduledMinutes7d: r.scheduled_minutes_7d,
    menuLaunchDate: r.menu_launch_date,
  };
}

async function fetchMenuOpsRaw(): Promise<MenuOpsRow[]> {
  const { rows } = await runQuery<RawRow>(SQL);
  return rows.map(rowToMenu);
}

export const fetchMenuOps = cachedQuery(fetchMenuOpsRaw, {
  tag: TAB_TAGS.queue,
  ttlSeconds: TTL.ops,
  extraTags: ['metric:menu-ops'],
});
