// BigQuery client. Brief §5.1.
// Credentials in GOOGLE_APPLICATION_CREDENTIALS_JSON as a single base64-encoded
// JSON blob (Vercel-friendly — no file paths).
// Project sessions-core-data; service account is read-only on production /
// analytics / serve / hubspot / marketing / deliveroo datasets per §15 #10.

import { BigQuery, type BigQueryOptions } from '@google-cloud/bigquery';

let _client: BigQuery | null = null;

export function getBigQuery(): BigQuery {
  if (_client) return _client;

  const projectId = process.env.GCP_PROJECT_ID || 'sessions-core-data';
  const opts: BigQueryOptions = { projectId };

  const blob = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (blob) {
    const json = blob.trim().startsWith('{')
      ? blob
      : Buffer.from(blob, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { client_email: string; private_key: string; project_id?: string };
    opts.credentials = { client_email: parsed.client_email, private_key: parsed.private_key };
    if (parsed.project_id) opts.projectId = parsed.project_id;
  } else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS_JSON must be set (base64-encoded service account JSON).',
    );
  }

  _client = new BigQuery(opts);
  return _client;
}

export interface QueryResult<T> {
  rows: T[];
  bytesProcessed: number;
  jobId: string | undefined;
}

export async function runQuery<T>(
  query: string,
  params: Record<string, unknown> = {},
): Promise<QueryResult<T>> {
  const bq = getBigQuery();

  // BigQuery refuses empty array params unless their type is declared. Auto-tag
  // any empty arrays as STRING (the only empty-array param we use is a venue-ID
  // list — string-typed). Callers can override by passing the type-tagged value
  // form before this point.
  // The SDK's QueryParamTypes is a struct-shape; any-cast keeps TS happy.
  const types: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v) && v.length === 0) types[k] = ['STRING'];
  }

  const [job] = await bq.createQueryJob({
    query,
    params,
    ...(Object.keys(types).length > 0 ? { types: types as never } : {}),
    useLegacySql: false,
    // Datasets in sessions-core-data live in europe-west2 (London), not the
    // multi-region EU. Hardcoded — no datasets exist outside this region.
    location: 'europe-west2',
  });
  const [rawRows] = await job.getQueryResults();
  const meta = job.metadata?.statistics?.query;
  const bytesProcessed = Number(meta?.totalBytesProcessed ?? 0);

  // Cost guard from §5.1 — warn loudly if a single query scans more than ~5 GB
  // until the data team confirms a per-query ceiling (§15 #11).
  const SOFT_LIMIT_BYTES = Number(process.env.BQ_PER_QUERY_BYTES_CEILING ?? 5 * 1024 ** 3);
  if (bytesProcessed > SOFT_LIMIT_BYTES) {
    console.warn(
      `[bq] Query exceeded soft byte ceiling: ${bytesProcessed} bytes for job ${job.id}. ` +
        `Verify partition filters are present.`,
    );
  }

  // BQ DATE / TIMESTAMP / DATETIME columns come back as class instances
  // ({ value: 'YYYY-MM-DD', _type: 'BigQueryDate' }). React's prod server→client
  // serialisation rejects non-plain objects. Walk the rows and unwrap any
  // single-property `{ value: string }` shape.
  const rows = (rawRows as unknown[]).map(bqNormalize) as T[];

  return { rows, bytesProcessed, jobId: job.id };
}

function bqNormalize(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(bqNormalize);
  // Class instances (non-plain prototypes) — unwrap BQ wrappers.
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) {
    const obj = input as { value?: unknown };
    if (typeof obj.value === 'string') return obj.value;
    if (typeof obj.value === 'number' || typeof obj.value === 'boolean') return obj.value;
    // Fallback: stringify class instances we don't recognise so they at least cross the boundary.
    return String(input);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = bqNormalize(v);
  }
  return out;
}
