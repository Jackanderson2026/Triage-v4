// Compliance lookup by partner. Brief §7.0 — the detail-card compliance block.
//
// Compliance is keyed by Sessions Serve venue_Id; partners (LEFT(pos_code,7))
// can have one or more venues. Each PartnerOpsRow carries serveVenueIds; this
// module picks the most recent compliance row across that partner's venues so
// the detail card shows the partner's current compliance state.

import type { ComplianceRow } from '@/lib/bq/queries/compliance';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';

export interface PartnerCompliance {
  /** The compliance row chosen for the partner — the most recent score_month across their venues. */
  row: ComplianceRow;
  /** True when more than one venue belongs to the partner (UI hint that the chosen row is one of several). */
  hasMultipleVenues: boolean;
  /** Number of compliance rows considered when picking. */
  venueCount: number;
}

export function buildComplianceByPartner(
  partners: PartnerOpsRow[],
  compliance: ComplianceRow[],
): Map<string, PartnerCompliance> {
  const byVenue = new Map<string, ComplianceRow>();
  for (const row of compliance) byVenue.set(row.venueId, row);
  const out = new Map<string, PartnerCompliance>();
  for (const p of partners) {
    const rows = p.serveVenueIds.map((id) => byVenue.get(id)).filter((r): r is ComplianceRow => Boolean(r));
    if (rows.length === 0) continue;
    rows.sort((a, b) => b.scoreMonth.localeCompare(a.scoreMonth));
    out.set(p.partnerId, {
      row: rows[0]!,
      hasMultipleVenues: p.serveVenueIds.length > 1,
      venueCount: rows.length,
    });
  }
  return out;
}

export function formatScoreMonth(s: string): string {
  // BigQuery DATE serialises as 'YYYY-MM-DD'.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}
