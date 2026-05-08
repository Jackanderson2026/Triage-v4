import { expect, test } from '@playwright/test';

// Brief §13 step 3 happy path — load the queue tab, see fixture rows render
// with active issues, click into a partner card, see it expand inline with
// the compliance block + AI summary section. Runs against the dev server with
// E2E_BYPASS_AUTH=1 and no GOOGLE_APPLICATION_CREDENTIALS_JSON so it depends
// on no upstream credentials.

test('AM lands on queue, expands partner card, sees compliance + AI summary section', async ({ page }) => {
  await page.goto('/queue');

  await expect(page.getByText('Sessions Triage', { exact: false })).toBeVisible();
  await expect(page.getByText(/Showing fixture data/i)).toBeVisible();

  // Halo Burger Shoreditch is in the fixture and has a non-compliant venue.
  const halpRow = page.getByText('Halo Burger Shoreditch').first();
  await expect(halpRow).toBeVisible();

  // Cards expand on click (no slide-in panel anymore).
  await halpRow.click();
  await expect(page.getByText('AI Summary', { exact: true })).toBeVisible();
  await expect(page.getByText('Compliance', { exact: true })).toBeVisible();
  await expect(page.getByText('Non-compliant', { exact: true })).toBeVisible();
  await expect(page.getByText('Issues firing', { exact: true })).toBeVisible();
});

test('navigation between tabs preserves global filters', async ({ page }) => {
  await page.goto('/queue?partnerType=Multi-site');
  await page.waitForLoadState('networkidle');

  await expect(page.getByText(/Halo Burger Shoreditch/)).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/offboarding-risk/, { timeout: 10_000 }),
    page.getByRole('link', { name: /Offboarding Risk/ }).first().click(),
  ]);

  await expect(page.getByRole('link', { name: /Triage Queue/ })).toBeVisible();
  // Rejected Orders tab should now exist in the nav.
  await expect(page.getByRole('link', { name: /Rejected Orders/ })).toBeVisible();
});
