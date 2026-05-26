export const dynamic = 'force-dynamic';

import { Shell } from '@/components/layout/Shell';
import { TabNav, TABS } from '@/components/layout/TabNav';
import { tokens } from '@/components/primitives';
import { TAB_TAGS } from '@/lib/bq/cache';
import { getTabCounts, applyTabCounts } from '@/lib/triage/tabCounts';
import { listOpsExecConfig } from '@/lib/admin/opsExecs';
import { AdminClient } from '@/components/admin/AdminClient';

const { colors, fonts, space, text } = tokens;

export default async function AdminPage() {
  const [config, counts] = await Promise.all([listOpsExecConfig(), getTabCounts()]);

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
      tabNav={<TabNav current="/admin" tabs={applyTabCounts(TABS, counts)} />}
    >
      <div style={{ marginBottom: space[4] }} />
      <AdminClient config={config} />
    </Shell>
  );
}
