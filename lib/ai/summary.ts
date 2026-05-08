'use server';

// AI summary server action. Triggered when an AM expands a partner card.
// Wraps the Anthropic SDK with prompt caching enabled on the system prompt
// (the partner-context section changes per request, but the operator framing
// is identical, so it caches across calls).
//
// Returns a list of bullets ready to render. On any failure (missing key,
// quota, network), returns a single bullet describing the failure rather
// than throwing — the UI degrades gracefully.

import Anthropic from '@anthropic-ai/sdk';
import type { PartnerOpsRow } from '@/lib/bq/queries/granularOps';
import type { BrandOpsRow } from '@/lib/bq/queries/brandOps';
import type { PartnerSparkline } from '@/lib/bq/queries/sparklines';
import { ISSUE_CATALOGUE, type IssueCode } from '@/lib/triage/hierarchy';

const SYSTEM = `You are a Sessions account-manager assistant.
You write 3-5 short bullet points summarising what's notable about a partner's
recent performance. Be specific with numbers. Flag both problems and positives.
Be direct and concise — no fluff. Each bullet on its own line, starting with •.
No intro sentence. No outro.`;

interface SummaryInput {
  partner: PartnerOpsRow;
  issues: IssueCode[];
  sparkline?: PartnerSparkline;
  brands?: BrandOpsRow[];
}

function buildPrompt(input: SummaryInput): string {
  const { partner, issues, sparkline, brands } = input;
  const issueLabels = issues.map((c) => ISSUE_CATALOGUE[c]?.label ?? c).join(', ') || 'None';
  const brandSummary = brands && brands.length > 0
    ? brands.map((b) => `${b.brandName}: 7d GMV £${Math.round(b.gmv7d)}, orders ${b.orders7d}, rating ${b.rating28d?.toFixed(2) ?? '—'}`).join('\n')
    : 'No brand-level data.';
  const weekly = sparkline
    ? sparkline.weeks.map((w, i) => `Week ${w}: GMV £${Math.round(sparkline.gmv[i] ?? 0)}, OpenRate ${(sparkline.openRate[i] ?? 0) * 100}%, Missing ${(sparkline.missingItems[i] ?? 0) * 100}%, Rating ${sparkline.rating[i]?.toFixed(2) ?? '—'}`).join('\n')
    : 'No weekly data.';
  return `Partner: ${partner.partnerName ?? partner.partnerId}
Type: ${partner.partnerType ?? '—'}
Host status: ${partner.hostStatus ?? '—'}
Brand stack: ${partner.brandStack ?? '—'}
Platforms: ${partner.platforms.join(', ') || '—'}

7d GMV: £${Math.round(partner.gmv7d)}
28d GMV: £${Math.round(partner.gmv28d)}
7d orders: ${partner.orders7d}
Rating (28d): ${partner.rating28d?.toFixed(2) ?? '—'}
Open rate (7d): ${partner.openRate7d !== null ? (partner.openRate7d * 100).toFixed(1) + '%' : '—'}
Missing items (7d): ${partner.missingItemsPct7d !== null ? (partner.missingItemsPct7d * 100).toFixed(1) + '%' : '—'}
Rider wait (7d): ${partner.riderWait5minPct7d !== null ? (partner.riderWait5minPct7d * 100).toFixed(1) + '%' : '—'}
Days since last order: ${partner.daysSinceLastOrder ?? '—'}

Issues firing: ${issueLabels}

Brands:
${brandSummary}

Weekly trend (last 8 weeks):
${weekly}

Respond with bullet points only.`;
}

export async function generateSummary(input: SummaryInput): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return ['• AI summary disabled — ANTHROPIC_API_KEY not set in this environment.'];
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });
    const text = message.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const bullets = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('•'));
    return bullets.length > 0 ? bullets : ['• No summary returned.'];
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return [`• Summary failed: ${msg}`];
  }
}
