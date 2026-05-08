// Tab 6 (Non-Compliant by GMV) data + detail-card compliance block.
// Brief §5.2 + §7.6. Adapts Appendix B Query 3 ("Compliance"); SQL sketch
// taken verbatim from §7.6 with the test-venue exclusion preserved.
//
// Compliance is a MONTHLY snapshot in serve.prod_venues_sessions_score_stg.
// We always show the latest `score_month` where `month_completed = 'Yes'`.

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';

export interface ComplianceRow {
  venueId: string;
  venueName: string | null;
  scoreMonth: string;
  overallCompliant: boolean;
  foodCompliant: boolean;
  packagingCompliant: boolean;
  nonCompliantFood: string[];
  nonCompliantPackaging: string[];
  totalPoints: number | null;
  openRatePoints: number | null;
  ratingPoints: number | null;
  inaccurateOrdersPoints: number | null;
  totalCashback: number | null;
  gmv28d: number | null;
  hasEmptyLists: boolean;
}

interface RawRow {
  venue_id: string;
  venue_name: string | null;
  score_month: string;
  overall_compliant: boolean;
  food_compliant: boolean;
  packaging_compliant: boolean;
  non_compliant_food_list: string[] | null;
  non_compliant_packaging_list: string[] | null;
  total_points: number | null;
  open_rate_points: number | null;
  rating_points: number | null;
  inaccurate_orders_points: number | null;
  total_cashback: number | null;
  gmv_28d: number | null;
}

// Test-venue exclusion list — preserved verbatim from Appendix B Query 3.
// Update via the data team when new test venues are introduced.
const TEST_VENUE_IDS: string[] = [];

const SQL = `
WITH latest_compliance AS (
  SELECT
    venue_Id,
    score_month,
    overall_compliant,
    food_compliant,
    packaging_compliant,
    non_compliant_food_list,
    non_compliant_packaging_list,
    total_points,
    open_rate_points,
    rating_points,
    inaccurate_orders_points,
    total_cashback
  FROM \`sessions-core-data.serve.prod_venues_sessions_score_stg\`
  WHERE month_completed = 'Yes'
    AND venue_Id NOT IN UNNEST(@test_venues)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY venue_Id ORDER BY score_month DESC) = 1
),
gmv_28d AS (
  SELECT
    pos.hubspot_serve_venue_id AS venue_id,
    SUM(ops.total_gmv)         AS gmv_28d
  FROM \`sessions-core-data.production.delivery_core_ops\` AS ops
  JOIN \`sessions-core-data.analytics.pos_code_detail_prod\` AS pos USING (pos_code)
  WHERE ops.order_date >= DATE_SUB(CURRENT_DATE('Europe/London'), INTERVAL 28 DAY)
  GROUP BY 1
)
SELECT
  v.venueId AS venue_id,
  v.name    AS venue_name,
  CAST(lc.score_month AS STRING) AS score_month,
  lc.overall_compliant,
  lc.food_compliant,
  lc.packaging_compliant,
  lc.non_compliant_food_list,
  lc.non_compliant_packaging_list,
  lc.total_points,
  lc.open_rate_points,
  lc.rating_points,
  lc.inaccurate_orders_points,
  lc.total_cashback,
  g.gmv_28d
FROM latest_compliance lc
JOIN \`sessions-core-data.serve.prod_venues_stg\` v
  ON v.venueId = lc.venue_Id
LEFT JOIN gmv_28d g
  ON g.venue_id = lc.venue_Id
`;

function rowToCompliance(r: RawRow): ComplianceRow {
  const food = r.non_compliant_food_list ?? [];
  const packaging = r.non_compliant_packaging_list ?? [];
  return {
    venueId: r.venue_id,
    venueName: r.venue_name,
    scoreMonth: r.score_month,
    overallCompliant: r.overall_compliant,
    foodCompliant: r.food_compliant,
    packagingCompliant: r.packaging_compliant,
    nonCompliantFood: food,
    nonCompliantPackaging: packaging,
    totalPoints: r.total_points,
    openRatePoints: r.open_rate_points,
    ratingPoints: r.rating_points,
    inaccurateOrdersPoints: r.inaccurate_orders_points,
    totalCashback: r.total_cashback,
    gmv28d: r.gmv_28d,
    hasEmptyLists: !r.overall_compliant && food.length === 0 && packaging.length === 0,
  };
}

async function fetchComplianceRaw(): Promise<ComplianceRow[]> {
  const { rows } = await runQuery<RawRow>(SQL, { test_venues: TEST_VENUE_IDS });
  return rows.map(rowToCompliance);
}

export const fetchCompliance = cachedQuery(fetchComplianceRaw, {
  tag: TAB_TAGS.queue,
  ttlSeconds: TTL.monthly,
  extraTags: ['metric:compliance'],
});
