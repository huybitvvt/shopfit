import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('../artifacts/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8081/');
  await page.getByText('Sơ mi Linen Essential', { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '../artifacts/screenshots/home-desktop.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: '../artifacts/screenshots/home-mobile.png' });
  await page.goto('http://localhost:8081/try-on');
  await page.getByRole('button', { name: 'Chọn ảnh', exact: true }).waitFor();
  await page.screenshot({ path: '../artifacts/screenshots/fitting-mobile.png' });
  console.log(JSON.stringify({ screenshots: 3, errors }));
} finally { await browser.close(); }
