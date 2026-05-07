import type { OffboardingSignalRow } from '../queries/offboardingSignals';

// Spread of risk bands so the Tab 2 view exercises every cell in the band table.
export const OFFBOARDING_SIGNALS_FIXTURE: OffboardingSignalRow[] = [
  {
    partnerId: 'P000001',
    partnerName: 'Halo Burger Shoreditch',
    brandStack: 'Halo Burger + SoBe Burger',
    refurbishment: false,
    daysSinceLastOrder: 1,
    riderWait3m: 0.06,
    missingItems3m: 0.012,
    orders3m: 4920,
  },
  {
    partnerId: 'P000002',
    partnerName: "Biff's Camden",
    brandStack: "Biff's solo",
    refurbishment: false,
    daysSinceLastOrder: 22, // Red — inactive
    riderWait3m: 0.04,
    missingItems3m: 0.01,
    orders3m: 410,
  },
  {
    partnerId: 'P000003',
    partnerName: 'SoBe Burger Brixton',
    brandStack: 'SoBe Burger solo',
    refurbishment: false,
    daysSinceLastOrder: 1,
    riderWait3m: 0.135, // Critical — rider wait
    missingItems3m: 0.041, // Critical — missing items
    orders3m: 3120,
  },
  {
    partnerId: 'P000007',
    partnerName: 'Trial Period Site',
    brandStack: 'Halo Burger solo',
    refurbishment: false,
    daysSinceLastOrder: 16, // Amber — inactive
    riderWait3m: 0.095, // Amber — rider wait (≥ 9%)
    missingItems3m: 0.032, // Amber — missing items (≥ 3%)
    orders3m: 240,
  },
  {
    partnerId: 'P000008',
    partnerName: 'Refurbishment Site',
    brandStack: "Biff's + SoBe Burger",
    refurbishment: true,
    daysSinceLastOrder: 60,
    riderWait3m: 0.5,
    missingItems3m: 0.5,
    orders3m: 0,
  },
];
