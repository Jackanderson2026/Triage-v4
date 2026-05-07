// pos_code derivation. Brief §5.2:
//   LEFT(pos_code, 7)  → partner_id
//   LEFT(pos_code, 10) → menu_id
//   RIGHT(pos_code, 3) → platform code (ROO / UBR / JET / OTHER)
//
// Every BQ query imports from here. No LEFT(pos_code, …) anywhere else.

export type PlatformCode = 'ROO' | 'UBR' | 'JET';
export type PlatformName = 'DELIVEROO' | 'UBER' | 'JUSTEAT';

export const partnerIdSql = (col = 'pos_code'): string => `LEFT(${col}, 7)`;
export const menuIdSql = (col = 'pos_code'): string => `LEFT(${col}, 10)`;
export const platformCodeSql = (col = 'pos_code'): string => `RIGHT(${col}, 3)`;

// Canonical platform-name CASE — use verbatim wherever a human-readable platform string is surfaced.
export const platformCaseSql = (col = 'pos_code'): string => `
  CASE RIGHT(${col}, 3)
    WHEN 'ROO' THEN 'DELIVEROO'
    WHEN 'UBR' THEN 'UBER'
    WHEN 'JET' THEN 'JUSTEAT'
    ELSE NULL
  END
`;

export const partnerIdFromPosCode = (posCode: string): string => posCode.slice(0, 7);
export const menuIdFromPosCode = (posCode: string): string => posCode.slice(0, 10);

export const platformCodeFromPosCode = (posCode: string): PlatformCode | 'OTHER' => {
  const code = posCode.slice(-3) as PlatformCode;
  return code === 'ROO' || code === 'UBR' || code === 'JET' ? code : 'OTHER';
};

export const platformName = (code: PlatformCode | 'OTHER' | string): PlatformName | null => {
  switch (code) {
    case 'ROO':
      return 'DELIVEROO';
    case 'UBR':
      return 'UBER';
    case 'JET':
      return 'JUSTEAT';
    default:
      return null;
  }
};
