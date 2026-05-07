// Day-1 schema discovery. Brief §15 #12, #13, #14.
// Pulls DISTINCT values from the three columns whose enum lists are still [OPEN]
// in the brief, prints them, and writes them into lib/triage/enums.ts so the
// filter dropdowns reflect what's actually in production.
//
// Run with:  npm run discover-enums
//
// Requires GOOGLE_APPLICATION_CREDENTIALS_JSON in env (service account scoped to
// sessions-core-data, read-only on production / analytics).

import { runQuery } from '@/lib/bq/client';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface DistinctRow {
  value: string | null;
}

async function distinct(column: string, table: string): Promise<string[]> {
  const { rows } = await runQuery<DistinctRow>(`
    SELECT DISTINCT ${column} AS value
    FROM \`sessions-core-data.${table}\`
    WHERE ${column} IS NOT NULL
    ORDER BY value
  `);
  return rows.map((r) => r.value).filter((v): v is string => typeof v === 'string' && v.length > 0);
}

async function main(): Promise<void> {
  console.log('Discovering enum values from sessions-core-data…');

  const [hostStatuses, partnerBuckets, brandStacks] = await Promise.all([
    distinct('hubspot_host_status', 'analytics.pos_code_detail_prod'),
    distinct('host_partner_bucket', 'analytics.pos_code_detail_prod'),
    distinct('brand_stack', 'analytics.host_brand_stacks'),
  ]);

  console.log('hubspot_host_status:', hostStatuses);
  console.log('host_partner_bucket:', partnerBuckets);
  console.log('brand_stack:', brandStacks);

  // Apply the §5.2 normalisation to partner buckets.
  const partnerTypes = Array.from(
    new Set(partnerBuckets.map((p) => (p === 'Duet only' ? 'Delivery' : p))),
  ).sort();

  const enumsPath = resolve(__dirname, '..', 'lib', 'triage', 'enums.ts');
  const current = await readFile(enumsPath, 'utf8');

  const replaced = current
    .replace(
      /export const HOST_STATUSES = \[[\s\S]*?\] as const;/,
      `export const HOST_STATUSES = [\n${hostStatuses.map((s) => `  ${JSON.stringify(s)},`).join('\n')}\n] as const;`,
    )
    .replace(
      /export const PARTNER_TYPES = \[[\s\S]*?\] as const;/,
      `export const PARTNER_TYPES = [\n${partnerTypes.map((s) => `  ${JSON.stringify(s)},`).join('\n')}\n] as const;`,
    )
    .replace(
      /export const BRAND_STACKS: string\[\] = \[[\s\S]*?\];/,
      `export const BRAND_STACKS: string[] = [\n${brandStacks.map((s) => `  ${JSON.stringify(s)},`).join('\n')}\n];`,
    );

  await writeFile(enumsPath, replaced, 'utf8');
  console.log(`Wrote ${enumsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
