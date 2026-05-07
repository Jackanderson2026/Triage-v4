import { describe, expect, it } from 'vitest';
import {
  menuIdFromPosCode,
  menuIdSql,
  partnerIdFromPosCode,
  partnerIdSql,
  platformCaseSql,
  platformCodeFromPosCode,
  platformCodeSql,
  platformName,
} from '@/lib/bq/keys';

// Round-trip a fixture pos_code through every helper. If any of these flip,
// every BQ query downstream is silently wrong. Kept tiny so it doubles as a smoke test.
describe('pos_code key derivation', () => {
  const pos = '1234567ABCROO';

  it('partnerId is the first 7 chars', () => {
    expect(partnerIdFromPosCode(pos)).toBe('1234567');
  });

  it('menuId is the first 10 chars', () => {
    expect(menuIdFromPosCode(pos)).toBe('1234567ABC');
  });

  it('platformCode is the last 3 chars, mapped to ROO/UBR/JET/OTHER', () => {
    expect(platformCodeFromPosCode(pos)).toBe('ROO');
    expect(platformCodeFromPosCode('1234567ABCXYZ')).toBe('OTHER');
  });

  it('platformName maps codes to human-readable names', () => {
    expect(platformName('ROO')).toBe('DELIVEROO');
    expect(platformName('UBR')).toBe('UBER');
    expect(platformName('JET')).toBe('JUSTEAT');
    expect(platformName('OTHER')).toBeNull();
  });

  it('SQL helpers default to the column name pos_code', () => {
    expect(partnerIdSql()).toBe('LEFT(pos_code, 7)');
    expect(menuIdSql()).toBe('LEFT(pos_code, 10)');
    expect(platformCodeSql()).toBe('RIGHT(pos_code, 3)');
    expect(platformCaseSql()).toContain("WHEN 'ROO' THEN 'DELIVEROO'");
  });
});
