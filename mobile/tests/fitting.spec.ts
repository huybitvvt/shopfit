import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import path from 'node:path';

async function customer(page: Page, api: APIRequestContext) {
  const response = await api.post('http://localhost:8000/api/auth/register', { data: { name: 'Fitting UI Test', email: `fitting-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, password: 'FittingTest123!' } });
  expect(response.status()).toBe(201);
  const session = await response.json();
  await page.addInitScript(value => localStorage.setItem('shopfit-session', JSON.stringify(value)), session);
  return { Authorization: `Bearer ${session.token}` };
}

test('body measurements drive explained size advice and selected size reaches fitting room', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await customer(page, request);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Hồ sơ cơ thể/ }).click();
  for (const [label, value] of [['Chiều cao (cm) *', '175'], ['Cân nặng (kg) *', '70'], ['Vòng ngực (cm)', '94'], ['Vòng eo (cm)', '80'], ['Vòng mông (cm)', '96']]) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Lưu hồ sơ cơ thể', exact: true }).click();
  await expect(page.getByText('Góc nhỏ của bạn', { exact: true })).toBeVisible();
  await page.goto('/product/linen-shirt', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Gợi ý size L/)).toBeVisible();
  await page.getByRole('button', { name: 'Chọn size L được gợi ý', exact: true }).click();
  await expect(page.getByText(/cơ thể 94.*104.*dư 10/)).toBeVisible();
  await page.getByRole('button', { name: 'Thử trên ảnh của tôi', exact: true }).click();
  await expect(page.getByText('Size đưa vào ảnh AI · L', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('four-view arrows wrap around, before/after works and comparison opens without paid calls', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await customer(page, request);
  const image = '/media/everyday-tee.jpg';
  const job = {
    id: 'ui-four-view-fixture', product_id: 'everyday-tee', product_name: 'Áo thun Everyday', color: 'Trắng', size: 'L', status: 'completed',
    photo_url: image, result_url: image, error: null, duration_ms: 100, model: 'ui-test-only', created_at: new Date().toISOString(), retry_count: 0,
    body_snapshot: null, fit_snapshot: null, views: ['front', 'left', 'back', 'right'].map(angle => ({ angle, status: 'completed', url: image })),
  };
  await page.route('**/api/tryons', route => route.request().method() === 'GET' ? route.fulfill({ json: [job] }) : route.abort());
  await page.route('**/api/tryons/ui-four-view-fixture', route => route.fulfill({ json: job }));
  await page.route('**/api/tryons/ui-four-view-fixture/evaluation', route => route.fulfill({ json: route.request().method() === 'POST' ? { identity_score: 4, garment_score: 4, fit_score: 3, actual_fit: 'fits', notes: '', actual_url: image, updated_at: new Date().toISOString() } : null }));
  await page.goto('/try-on', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Xem lần thử Áo thun Everyday', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Góc tiếp theo', exact: true })).toBeInViewport();
  await expect(page.getByTestId('view-angle')).toHaveText('Góc trước');
  for (const angle of ['trái', 'sau', 'phải', 'trước']) {
    await page.getByRole('button', { name: 'Góc tiếp theo', exact: true }).click();
    await expect(page.getByTestId('view-angle')).toHaveText(`Góc ${angle}`);
  }
  await page.getByRole('button', { name: 'Góc trước đó', exact: true }).click();
  await expect(page.getByTestId('view-angle')).toHaveText('Góc phải');
  await page.getByRole('button', { name: 'Xem góc trước', exact: true }).click();
  await page.getByRole('button', { name: 'So sánh với ảnh gốc', exact: true }).click();
  await expect(page.getByTestId('view-angle')).toHaveText('Ảnh gốc');
  await page.getByRole('button', { name: 'Xem ảnh sau khi thử', exact: true }).click();
  await expect(page.getByTestId('view-angle')).toHaveText('Góc trước');
  await page.screenshot({ path: '../artifacts/four-view-mobile-ui.png', fullPage: true });
  await page.getByRole('button', { name: 'Đối chiếu với ảnh mặc thật', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chọn ảnh mặc thật', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu đánh giá đối chiếu', exact: true })).toBeDisabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Chọn ảnh mặc thật', exact: true }).click();
  await (await chooser).setFiles(path.resolve('../backend/assets/everyday-tee.jpg'));
  for (const label of ['Giữ đúng người và vóc dáng 4 điểm', 'Đúng màu, phom và chi tiết đồ 4 điểm', 'Độ vừa giống khi mặc thật 3 điểm']) await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Lưu đánh giá đối chiếu', exact: true }).click();
  await expect(page.getByText(/Đã lưu đánh giá\. Chọn lại ảnh/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('checked photo and chosen size submit a four-view job without calling a paid provider', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const headers = await customer(page, request);
  expect((await request.patch('http://localhost:8000/api/body-profile', { headers, data: { height_cm: 175, weight_kg: 70, chest_cm: 94, fit_preference: 'regular' } })).status()).toBe(200);
  let submitted = false;
  const warning = 'Ảnh 474 × 633 px hơi nhỏ; vẫn có thể thử đồ nếu đủ rõ.';
  await page.route('**/api/photo-check', route => route.fulfill({ json: { accepted: true, messages: [], resolution_ok: false, warnings: [warning] } }));
  await page.route('**/api/tryons', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    const body = route.request().postData() || '';
    expect(body).toContain('name="size"');
    expect(body).toMatch(/name="size"\r?\n\r?\nL/);
    submitted = true;
    return route.fulfill({ status: 202, json: { id: 'submitted-fixture', product_id: 'linen-shirt', color: 'Trắng', size: 'L', status: 'failed', photo_url: '/media/linen-shirt.jpg', result_url: null, error: 'Simulated provider failure for UI test', retry_count: 0, views: ['front', 'left', 'back', 'right'].map(angle => ({ angle, status: 'failed', url: null })), body_snapshot: null, fit_snapshot: null } });
  });
  await page.goto('/try-on?productId=linen-shirt&size=L', { waitUntil: 'domcontentloaded' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Chọn ảnh', exact: true }).click();
  await (await chooser).setFiles(path.resolve('../backend/assets/everyday-tee.jpg'));
  await expect(page.getByText('Ảnh đạt kiểm tra đầu vào', { exact: true })).toBeVisible();
  await expect(page.getByText(warning, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo 4 ảnh thử đồ của tôi', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Tạo 4 ảnh thử đồ của tôi', exact: true }).click();
  await expect(page.getByText('Simulated provider failure for UI test', { exact: true })).toBeVisible();
  expect(submitted).toBeTruthy();
});

test('shop can view and save per-product measurement table', async ({ page }) => {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Chủ shop', exact: true }).click();
  await page.getByRole('button', { name: 'Vào không gian quản lý shop', exact: true }).click();
  await page.getByRole('button', { name: /^Số đo / }).first().click();
  await expect(page.getByRole('textbox', { name: 'Vòng ngực size S (cm)', exact: true })).toBeVisible();
  const saved = page.waitForResponse(r => r.url().includes('/size-chart') && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Lưu bảng số đo', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Thiết kế đang bán', { exact: true })).toBeVisible();
});
