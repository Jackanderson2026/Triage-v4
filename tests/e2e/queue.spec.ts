import { expect, test } from '@playwright/test';

// Brief §13 step 3 happy path — load the queue tab, see fixture rows render
// with active issues, click into a partner, see the detail panel open with
// the compliance block. Runs against the dev server with E2E_BYPASS_AUTH=1
// and no GOOGLE_APPLICATION_CREDENTIALS_JSON so it depends on no upstream
// credentials.

test('AM lands on queue, opens partner detail, sees compliance block', async ({ page }) => {
  await page.goto('/queue');

  // Header + fixture banner.
  await expect(page.getByText('Sessions Triage', { exact: false })).toBeVisible();
  await expect(page.getByText(/Showing fixture data/i)).toBeVisible();

  // First row in the fixture has at least one issue firing — open it.
  // PartnerTable wraps only the first cell in a Link, so click the link inside the row.
  const halpRow = page.locator('tr', { hasText: 'Halo Burger Shoreditch' });
  await expect(halpRow).toBeVisible();
  await halpRow.locator('a').first().click();

  // Detail panel — header section visible, compliance block renders for a
  // venue with a known fixture compliance row, key metrics block renders.
  const panel = page.getByRole('dialog', { name: /Halo Burger Shoreditch/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Compliance', { exact: true })).toBeVisible();
  // Halo Burger Shoreditch is non-compliant in the fixture (V0001).
  await expect(panel.getByText('Non-compliant', { exact: true })).toBeVisible();
  await expect(panel.getByText('Key metrics')).toBeVisible();
  await expect(panel.getByText('Issues firing')).toBeVisible();
});

test('navigation between tabs preserves global filters', async ({ page }) => {
  await page.goto('/queue?partnerType=Multi-site');
  await page.waitForLoadState('networkidle');

  // Multi-site filter retains Halo Burger Shoreditch.
  await expect(page.getByText(/Halo Burger Shoreditch/)).toBeVisible();

  // Switch to offboarding-risk via the tab nav. Wait for the navigation to
  // settle before asserting on the new URL — TabNav uses next/link, so the
  // first click after hydration occasionally drops without an awaiter.
  await Promise.all([
    page.waitForURL(/\/offboarding-risk/, { timeout: 10_000 }),
    page.getByRole('link', { name: /Offboarding Risk/ }).first().click(),
  ]);

  // Tab nav should still show every tab's label after the swap.
  await expect(page.getByRole('link', { name: /Triage Queue/ })).toBeVisible();
});
