// Deliveroo offboarding risk scoring. Brief §7.2.1.
//
// Three triggers from the Service Pack 2025 Renewal Host Site Termination
// section:
//   1. Inactive site — no orders in preceding month
//   2. Rider wait > 5 min on > 13% of delivery orders, previous 3 months
//   3. Missing items on > 4% of orders, previous 3 months
//
// A site's overall band is the highest band across the three triggers.
// Bands: Green < Amber < Red < Critical.

import {
  INACTIVE_BANDS_DAYS,
  MISSING_ITEMS_BANDS,
  RIDER_WAIT_BANDS,
} from '@/lib/triage/thresholds';

export type RiskBand = 'green' | 'amber' | 'red' | 'critical';
export type TriggerKind = 'inactive' | 'rider_wait' | 'missing_items';

const BAND_RANK: Record<RiskBand, number> = {
  green: 0,
  amber: 1,
  red: 2,
  critical: 3,
};

export interface SiteSignals {
  partnerId: string;
  partnerName: string | null;
  brandStack: string | null;
  /** Refurbishment/closure flag. Source TBC (open dependency #4). */
  refurbishment: boolean;
  /** Days since last ROO order. Null = never ordered. */
  daysSinceLastOrder: number | null;
  /** Rider-wait > 5min as a fraction (0–1) over the previous 3 months. */
  riderWait3m: number | null;
  /** Missing items as a fraction (0–1) over the previous 3 months. */
  missingItems3m: number | null;
}

export interface TriggerVerdict {
  trigger: TriggerKind;
  band: RiskBand;
  /** Human-readable explanation including the lookback value, for the UI. */
  explanation: string;
  /** Service Pack reference for display + audit. */
  sourceRef: string;
}

export interface SiteRisk {
  partnerId: string;
  partnerName: string | null;
  brandStack: string | null;
  excluded: 'refurbishment' | null;
  triggers: TriggerVerdict[];
  band: RiskBand;
  recommendedAction: string;
}

function inactiveBand(days: number | null): RiskBand {
  if (days === null) return 'green';
  if (days >= INACTIVE_BANDS_DAYS.critical) return 'critical';
  if (days >= INACTIVE_BANDS_DAYS.red) return 'red';
  if (days >= INACTIVE_BANDS_DAYS.amber) return 'amber';
  return 'green';
}

function pctBand(value: number | null, bands: { critical: number; red: number; amber: number }): RiskBand {
  if (value === null) return 'green';
  if (value >= bands.critical) return 'critical';
  if (value >= bands.red) return 'red';
  if (value >= bands.amber) return 'amber';
  return 'green';
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function recommend(triggers: TriggerVerdict[], overall: RiskBand): string {
  if (overall === 'critical') return 'Open with Deliveroo relationship manager and partner today.';
  if (overall === 'red') return 'Schedule operational review with the partner this week.';
  if (overall === 'amber') return 'Pre-empt with a partner check-in before drift continues.';
  if (triggers.some((t) => t.trigger === 'inactive' && t.band !== 'green')) {
    return 'Confirm intentional pause vs. true inactivity.';
  }
  return 'No immediate action.';
}

export function scoreSite(signals: SiteSignals): SiteRisk {
  if (signals.refurbishment) {
    return {
      partnerId: signals.partnerId,
      partnerName: signals.partnerName,
      brandStack: signals.brandStack,
      excluded: 'refurbishment',
      triggers: [],
      band: 'green',
      recommendedAction: 'Excluded — refurbishment / planned closure declared.',
    };
  }

  const triggers: TriggerVerdict[] = [];

  const inactive = inactiveBand(signals.daysSinceLastOrder);
  if (inactive !== 'green') {
    triggers.push({
      trigger: 'inactive',
      band: inactive,
      explanation: `${signals.daysSinceLastOrder ?? '—'} days since last order`,
      sourceRef: 'Service Pack 2025 — Host Site Termination, "preceding month" trigger',
    });
  }

  const rider = pctBand(signals.riderWait3m, RIDER_WAIT_BANDS);
  if (rider !== 'green') {
    triggers.push({
      trigger: 'rider_wait',
      band: rider,
      explanation: `Rider wait > 5 min on ${fmtPct(signals.riderWait3m)} of orders, last 3 months`,
      sourceRef: 'Service Pack 2025 — Host Site Termination, > 13% / 3 months',
    });
  }

  const missing = pctBand(signals.missingItems3m, MISSING_ITEMS_BANDS);
  if (missing !== 'green') {
    triggers.push({
      trigger: 'missing_items',
      band: missing,
      explanation: `Missing items on ${fmtPct(signals.missingItems3m)} of orders, last 3 months`,
      sourceRef: 'Service Pack 2025 — Host Site Termination, > 4% / 3 months',
    });
  }

  const band = triggers.reduce<RiskBand>((acc, t) => (BAND_RANK[t.band] > BAND_RANK[acc] ? t.band : acc), 'green');

  return {
    partnerId: signals.partnerId,
    partnerName: signals.partnerName,
    brandStack: signals.brandStack,
    excluded: null,
    triggers,
    band,
    recommendedAction: recommend(triggers, band),
  };
}

export function rankRisk(a: SiteRisk, b: SiteRisk): number {
  return BAND_RANK[b.band] - BAND_RANK[a.band];
}
