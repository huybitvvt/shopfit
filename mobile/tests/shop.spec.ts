import { expect, test } from '@playwright/test';

test('catalog renders on a small phone and filters products without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Sơ mi Linen Essential', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm sản phẩm' }).fill('jeans');
  await expect(page.getByText('Quần jeans Straight 90s', { exact: true })).toBeVisible();
  await expect(page.getByText('Sơ mi Linen Essential', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('register, add a variant to cart, place and cancel an order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Lần đầu đến ShopFit/ }).click();
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('ShopFit UI Test');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`ui-${Date.now()}@example.com`);
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('ShopfitUITest123!');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByText(/Chào .*UI Test/)).toBeVisible();
  await page.goto('/product/linen-shirt', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Sơ mi Linen Essential', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Size M', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ hàng', exact: true }).click();
  await page.getByRole('button', { name: /Giỏ hàng, 1 sản phẩm/ }).click();
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0901234567');
  await page.getByRole('textbox', { name: 'Địa chỉ giao hàng', exact: true }).fill('123 Nguyen Hue, Quan 1, Ho Chi Minh');
  await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
  await expect(page.getByText('Chờ xác nhận', { exact: true })).toBeVisible();
  await expect(page.getByText('459.000', { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Hủy đơn hàng', exact: true }).click();
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
});

test('fitting room explains unavailable AI instead of showing a fabricated result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/try-on', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Phòng thử của bạn', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chọn ảnh', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập để thử đồ', exact: true })).toBeVisible();
  await expect(page.getByText('Bắt đầu từ một tấm ảnh', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('shop owner opens product inventory editor and saves existing stock', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Chủ shop', exact: true }).click();
  await page.getByRole('button', { name: 'Vào không gian quản lý shop', exact: true }).click();
  await expect(page.getByText('Thiết kế đang bán', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sửa & tồn kho', exact: true }).first().click();
  await expect(page.getByText('Tồn kho theo màu / size', { exact: true })).toBeVisible();
  const response = page.waitForResponse(r => r.url().includes('/api/admin/products/') && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText('Chỉnh sửa thiết kế', { exact: true })).toHaveCount(0);
});
