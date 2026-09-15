import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: true,
  reporter: [['list']], use: { baseURL: process.env.DEMO_URL || 'http://127.0.0.1:4173/lien/', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
})
