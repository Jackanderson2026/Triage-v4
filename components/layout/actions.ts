'use server';

import { revalidateTag } from 'next/cache';

const ALLOWED_TAGS = new Set([
  'tab:queue',
  'tab:offboarding',
  'tab:rejected-orders',
]);

export async function revalidateTabAction(tag: string): Promise<void> {
  if (!ALLOWED_TAGS.has(tag)) return;
  revalidateTag(tag);
}
