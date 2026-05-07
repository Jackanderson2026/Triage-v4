'use server';

import { revalidateTag } from 'next/cache';

const ALLOWED_TAGS = new Set([
  'tab:queue',
  'tab:offboarding',
  'tab:inactive-core',
  'tab:inactive-menus',
  'tab:paused',
  'tab:non-compliant',
]);

export async function revalidateTabAction(tag: string): Promise<void> {
  if (!ALLOWED_TAGS.has(tag)) return;
  revalidateTag(tag);
}
