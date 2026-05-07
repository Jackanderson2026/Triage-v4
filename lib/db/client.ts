// Neon serverless driver. Tagged-template `sql` is exported so call sites read
// like vanilla SQL while still being parameterised.
//
// DATABASE_URL must be a Neon-compatible connection string with the wss-friendly
// pooler hostname (Vercel's Neon integration provisions this automatically).

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. See .env.example.');
  }
  _sql = neon(url);
  return _sql;
}

export const sql: NeonQueryFunction<false, false> = ((...args: Parameters<NeonQueryFunction<false, false>>) =>
  getSql()(...args)) as NeonQueryFunction<false, false>;
