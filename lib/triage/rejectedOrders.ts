// Rejected-orders view. Derived from PartnerOpsRow — no second BQ query
// needed because rejected_count_7d is already aggregated per partner in
// granularOps. Filter > 0; sort by rejected count descending.

import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';

export interface RejectedOrderRow {
  partnerId: string;
  partnerName: string | null;
  brandStack: string | null;
  platforms: string[];
  rejectedCount: number;
  totalOrders: number;
  rejectRate: number; // already a fraction (0–1)
}

export function buildRejectedOrders(partners: PartnerOpsRow[]): RejectedOrderRow[] {
  return partners
    .filter((p) => p.rejectedCount7d > 0)
    .map((p) => ({
      partnerId: p.partnerId,
      partnerName: p.partnerName,
      brandStack: p.brandStack,
      platforms: p.platforms,
      rejectedCount: p.rejectedCount7d,
      totalOrders: p.orders7d,
      rejectRate: p.rejectedRate7d ?? 0,
    }))
    .sort((a, b) => b.rejectedCount - a.rejectedCount);
}
