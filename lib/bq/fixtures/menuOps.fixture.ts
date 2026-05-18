import type { MenuOpsRow } from '../queries/menuOps';

const today = new Date();
function daysAgo(n: number): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const MENU_OPS_FIXTURE: MenuOpsRow[] = [
  {
    menuId: 'P000001HAL',
    partnerId: 'P000001',
    partnerName: 'Halo Burger Shoreditch',
    brandName: 'Halo Burger',
    brandStack: 'Halo Burger + SoBe Burger',
    platform: 'DELIVEROO',
    isDeliveroo: true,
    lastOrderDate: daysAgo(1),
    daysSinceLastOrder: 1,
    scheduledMinutes7d: 4200,
    menuLaunchDate: daysAgo(540),
    isActive: true,
  },
  {
    menuId: 'P000001SOB',
    partnerId: 'P000001',
    partnerName: 'Halo Burger Shoreditch',
    brandName: 'SoBe Burger',
    brandStack: 'Halo Burger + SoBe Burger',
    platform: 'DELIVEROO',
    isDeliveroo: true,
    lastOrderDate: daysAgo(11), // inactive
    daysSinceLastOrder: 11,
    scheduledMinutes7d: 4200,
    menuLaunchDate: daysAgo(360),
    isActive: true,
  },
  {
    menuId: 'P000003SOB',
    partnerId: 'P000003',
    partnerName: 'SoBe Burger Brixton',
    brandName: 'SoBe Burger',
    brandStack: 'SoBe Burger solo',
    platform: 'DELIVEROO',
    isDeliveroo: true,
    lastOrderDate: daysAgo(1),
    daysSinceLastOrder: 1,
    scheduledMinutes7d: 4100,
    menuLaunchDate: daysAgo(48),
    isActive: true,
  },
  {
    menuId: 'P000003SOJ',
    partnerId: 'P000003',
    partnerName: 'SoBe Burger Brixton',
    brandName: 'SoBe Burger',
    brandStack: 'SoBe Burger solo',
    platform: 'JUSTEAT',
    isDeliveroo: false,
    lastOrderDate: daysAgo(20), // inactive on JE only
    daysSinceLastOrder: 20,
    scheduledMinutes7d: null, // JE has no scheduled-minutes source
    menuLaunchDate: daysAgo(35),
    isActive: true,
  },
];
