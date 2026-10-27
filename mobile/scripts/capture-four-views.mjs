import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Reads only metadata; no generation, credentials or signed image URLs are saved.
const report = JSON.parse(await readFile('../artifacts/four-view-live-check.json', 'utf8'));
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8081/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Khách hàng', exact: true }).click();
  await page.getByText('Góc nhỏ của bạn', { exact: true }).waitFor();
  await page.goto('http://localhost:8081/try-on', { waitUntil: 'domcontentloaded' });
  const history = page.getByRole('button', { name: /Xem lần thử/ }).first();
  const frontLoaded = page.waitForResponse(r => r.url().includes('/image/front'));
  await history.click();
  await (await frontLoaded).finished();
  await page.getByTestId('view-angle').waitFor();
  await page.getByRole('img', { name: 'Ảnh thử đồ góc trước', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.getByTestId('view-angle').evaluate(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent.scrollTop;
    }
    return 0;
  })).toBe(0);
  await page.screenshot({ path: '../artifacts/four-view-live-mobile.png' });
  for (const angle of ['left', 'back', 'right']) {
    const loaded = page.waitForResponse(r => r.url().includes(`/image/${angle}`));
    await page.getByRole('button', { name: 'Góc tiếp theo', exact: true }).click();
    await (await loaded).finished();
    await page.screenshot({ path: `../artifacts/four-view-live-ui-${angle}.png` });
  }
  console.log(JSON.stringify({ job_id: report.job_id, screenshots: 4, errors }));
} finally { await browser.close(); }
