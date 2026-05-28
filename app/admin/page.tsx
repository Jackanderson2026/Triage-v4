export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getTabCounts, applyTabCounts } from '@/lib/triage/tabCounts';
import { listOpsExecConfig } from '@/lib/admin/opsExecs';
import { getPartnerOps } from '@/lib/bq/use';
import { extractGlobalParams } from '@/lib/triage/globalFilters';
import { AdminClient } from '@/components/admin/AdminClient';

const { colors, fonts, space, text } = tokens;

interface PageProps {
  searchParams: { [k: string]: string | string[] | undefined };
}

export default async function AdminPage({ searchParams }: PageProps) {
  const [config, counts, partners] = await Promise.all([
    listOpsExecConfig(),
    getTabCounts(),
    getPartnerOps(),
  ]);
  // Lightweight picker list — id + name only, deduped, sorted by name.
  const partnerOptions = partners
    .map((p) => ({ id: p.partnerId, name: p.partnerName ?? p.partnerId }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Shell
      tabName="Admin"
      tabTag={TAB_TAGS.queue}
      filters={
        <div style={{ fontFamily: fonts.body, fontSize: text.sm, color: colors.ink70 }}>
          Define ops execs, the sites assigned to each, and per-tab in-scope limits. Scope is matched
          against the signed-in Google account email.
        </div>
      }
      tabNav={<TabNav current="/admin" tabs={applyTabCounts(TABS, counts)} globalParams={extractGlobalParams(searchParams)} />}
    >
      <div style={{ marginBottom: space[4] }} />
      <AdminClient config={config} partnerOptions={partnerOptions} />
    </Shell>
  );
}
