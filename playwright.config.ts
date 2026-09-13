import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout : un vrai navigateur, l'app servie par ng serve, le back
// local sur 8080 (proxy /api). Lancer le back avant : docker compose up -d.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Telephone : taille, tactile et pixel ratio d'un iPhone, sur le moteur Chromium
    // (un seul navigateur a installer, en local comme en CI).
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' },
    },
  ],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'pnpm start --port 4200',
        url: 'http://localhost:4200',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
