import { defineConfig, devices } from '@playwright/test';

// Brief §13 step 3 — one happy-path E2E. Spawns the dev server with the auth
// bypass + fixture mode (no GOOGLE_APPLICATION_CREDENTIALS_JSON) so the test
// runs without GCP creds, Postgres, or Google OAuth.

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3110',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx next dev -p 3110',
    url: 'http://localhost:3110/queue',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      E2E_BYPASS_AUTH: '1',
      NEXTAUTH_SECRET: 'e2e-secret-not-used-because-of-bypass',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
