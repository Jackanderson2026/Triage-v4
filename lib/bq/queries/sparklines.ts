// Trailing 8-week partner-grain sparklines. Brief §6 — every MetricChip surfaces
// an 8-week trend.
//
// Adapts Appendix B Query 2 (Weekly Aggregates). Period = Mon-Sun week,
// `DATE_TRUNC(order_date, WEEK(MONDAY))` per §5.2 conventions.
//
// Returned grain: one row per partner per ISO-week with the metrics needed
// for the chip strip on the detail card. Page code looks up by partnerId; missing
// weeks render as gaps (the SparkLine component drops nulls).

import { runQuery } from '../client';
import { cachedQuery, TAB_TAGS, TTL } from '../cache';
import { partnerIdSql, platformCodeSql } from '../keys';

export interface PartnerSparkline {
  partnerId: string;
  weeks: string[]; // ISO date of each week's Monday, oldest → newest
  gmv: number[];
  openRate: Array<number | null>;
  missingItems: Array<number | null>;
  riderWait: Array<number | null>;
  rating: Array<number | null>;
}

interface RawRow {
  partner_id: string;
  week_start: string;
  gmv: number | null;
  open_rate: number | null;
  missing_items_pct: number | null;
  rider_wait_pct: number | null;
  rating: number | null;
}

const SQL = `
WITH ops AS (
  SELECT
    ${partnerIdSql()}                                                AS partner_id,
    ${platformCodeSql()}                                             AS platform_code,
    DATE_TRUNC(order_date, WEEK(MONDAY))                             AS week_start,
    total_gmv,
    total_order_count,
    bad_avg_open_rate,
    rating_sum,
    rating_count,
    total_orders_rider_wait_5m_plus,
    total_orders_missing_items_count
  FROM \`sessions-core-data.production.delivery_core_ops\`
  WHERE order_date BETWEEN DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/London'), WEEK(MONDAY)), INTERVAL 8 WEEK)
                       AND CURRENT_DATE('Europe/London')
)
SELECT
  partner_id,
  CAST(week_start AS STRING)                                                       AS week_start,
  SUM(total_gmv)                                                                   AS gmv,
  AVG(bad_avg_open_rate)                                                           AS open_rate,
  SAFE_DIVIDE(SUM(total_orders_missing_items_count), SUM(total_order_count))       AS missing_items_pct,
  SAFE_DIVIDE(
    SUM(IF(platform_code = 'ROO', total_orders_rider_wait_5m_plus, 0)),
    SUM(IF(platform_code = 'ROO', total_order_count, 0))
  )                                                                                AS rider_wait_pct,
  SAFE_DIVIDE(SUM(rating_sum), SUM(rating_count))                                  AS rating
FROM ops
GROUP BY partner_id, week_start
ORDER BY partner_id, week_start
`;

function bucketsByPartner(raw: RawRow[]): Map<string, PartnerSparkline> {
  const out = new Map<string, PartnerSparkline>();
  for (const r of raw) {
    let s = out.get(r.partner_id);
    if (!s) {
      s = {
        partnerId: r.partner_id,
        weeks: [],
        gmv: [],
        openRate: [],
        missingItems: [],
        riderWait: [],
        rating: [],
      };
      out.set(r.partner_id, s);
    }
    s.weeks.push(r.week_start);
    s.gmv.push(Number(r.gmv ?? 0));
    s.openRate.push(r.open_rate);
    s.missingItems.push(r.missing_items_pct);
    s.riderWait.push(r.rider_wait_pct);
    s.rating.push(r.rating);
  }
  return out;
}

async function fetchSparklinesRaw(): Promise<Map<string, PartnerSparkline>> {
  const { rows } = await runQuery<RawRow>(SQL);
  return bucketsByPartner(rows);
}

// Don't wrap in cachedQuery — the live result with all partners × 8 weeks
// exceeds Next's unstable_cache 2 MB limit. BQ's own query cache covers
// repeated identical hits within a session.
export async function fetchSparklines(): Promise<Map<string, PartnerSparkline>> {
  return fetchSparklinesRaw();
}

void TAB_TAGS;
void TTL;
