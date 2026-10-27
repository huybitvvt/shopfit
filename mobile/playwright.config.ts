import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '../artifacts/playwright',
  use: {
    baseURL: 'http://localhost:8081',
    browserName: 'chromium',
    channel: process.platform === 'win32' && existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 'msedge' : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'node ../scripts/api.mjs', url: 'http://localhost:8000/api/health', reuseExistingServer: true, timeout: 30000 },
    { command: 'npx expo start --web --port 8081 --localhost', url: 'http://localhost:8081', reuseExistingServer: true, timeout: 120000, env: { BROWSER: 'none', CI: '1' } },
  ],
});
