import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8787', trace: 'off' },
  // Reuses a dev server if one is already running on 8787.
  webServer: {
    command: 'node scripts/build.mjs && pnpm exec wrangler dev --port 8787 --local',
    url: 'http://127.0.0.1:8787/api/scoreboard',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
