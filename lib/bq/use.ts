// Live-or-fixture data switch. Plan §13.1 stub-and-iterate strategy.
//
// When GOOGLE_APPLICATION_CREDENTIALS_JSON is unset (no service account yet —
// open dependency #1), every BQ-backed call returns the typed fixture instead
// so the UI ships to a Vercel preview before the data team grants access.
// Production deploys MUST set the credential blob; the fallback is a dev/preview
// affordance only.

import { PARTNER_OPS_FIXTURE } from './fixtures/partnerOps.fixture';
import { OFFBOARDING_SIGNALS_FIXTURE } from './fixtures/offboardingSignals.fixture';
import { COMPLIANCE_FIXTURE } from './fixtures/compliance.fixture';
import { MENU_OPS_FIXTURE } from './fixtures/menuOps.fixture';
import { SPARKLINES_FIXTURE } from './fixtures/sparklines.fixture';
import { fetchPartnerOps as fetchPartnerOpsLive, type PartnerOpsRow } from './queries/granularOps';
import {
  fetchOffboardingSignals as fetchOffboardingSignalsLive,
  type OffboardingSignalRow,
} from './queries/offboardingSignals';
import { fetchCompliance as fetchComplianceLive, type ComplianceRow } from './queries/compliance';
import { fetchMenuOps as fetchMenuOpsLive, type MenuOpsRow } from './queries/menuOps';
import { fetchSparklines as fetchSparklinesLive, type PartnerSparkline } from './queries/sparklines';

export function isLive(): boolean {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export async function getPartnerOps(): Promise<PartnerOpsRow[]> {
  if (isLive()) return fetchPartnerOpsLive();
  return PARTNER_OPS_FIXTURE;
}

export async function getOffboardingSignals(): Promise<OffboardingSignalRow[]> {
  if (isLive()) return fetchOffboardingSignalsLive();
  return OFFBOARDING_SIGNALS_FIXTURE;
}

export async function getCompliance(): Promise<ComplianceRow[]> {
  if (isLive()) return fetchComplianceLive();
  return COMPLIANCE_FIXTURE;
}

export async function getMenuOps(): Promise<MenuOpsRow[]> {
  if (isLive()) return fetchMenuOpsLive();
  return MENU_OPS_FIXTURE;
}

export async function getSparklines(): Promise<Map<string, PartnerSparkline>> {
  if (isLive()) return fetchSparklinesLive();
  return SPARKLINES_FIXTURE;
}
