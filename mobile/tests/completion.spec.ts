import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function setupCustomer(page: Page, api: APIRequestContext) {
  const response = await api.post('http://localhost:8000/api/auth/register', { data: { name: 'Completion UI', email: `completion-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, password: 'CompletionTest123!' } });
  expect(response.status()).toBe(201);
  const session = await response.json();
  await page.addInitScript(value => localStorage.setItem('shopfit-session', JSON.stringify(value)), session);
  return { Authorization: `Bearer ${session.token}` };
}

test('fit map and favorite garment comparison explain the selected size on a phone', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const headers = await setupCustomer(page, request);
  await request.patch('http://localhost:8000/api/body-profile', { headers, data: { height_cm: 175, weight_kg: 70, chest_cm: 94, fit_preference: 'regular' } });
  await page.goto('/wardrobe', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Tên món đồ đang mặc vừa', exact: true }).fill('Áo chuẩn của tôi');
  await page.getByRole('textbox', { name: 'Vòng ngực đồ tham chiếu (cm)', exact: true }).fill('104');
  await page.getByRole('textbox', { name: 'Dài sản phẩm đồ tham chiếu (cm)', exact: true }).fill('68');
  await page.getByRole('button', { name: 'Lưu đồ mặc vừa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sửa Áo chuẩn của tôi', exact: true })).toBeVisible();
  await page.goto('/product/linen-shirt', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Size L', exact: true }).click();
  await expect(page.getByText('Bản đồ độ vừa · Size L', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vùng ngực: Đạt mục tiêu', exact: true }).click();
  await expect(page.getByText(/Vòng ngực: cơ thể 94 \/ thành phẩm 104 cm/)).toBeVisible();
  await page.getByRole('button', { name: 'So với Áo chuẩn của tôi', exact: true }).click();
  await expect(page.getByText(/Dài sản phẩm: 70 \/ đồ của bạn 68 cm → lớn hơn 2 cm/)).toBeVisible();
  await page.getByRole('button', { name: 'Size S', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vùng ngực: Thiếu độ dư', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByTestId('fit-map').screenshot({ path: '../artifacts/fit-map-mobile.png' });
});

test('verified purchase review can be shared, edited and withdrawn', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupCustomer(page, request);
  const order = { id: 'order-fixture', status: 'completed', total: 459000, created_at: new Date().toISOString(), customer_name: 'Completion UI', phone: '0901234567', address: 'Test address', items: [{ id: 987654, product_id: 'linen-shirt', name: 'Sơ mi Linen Essential', image_url: '/media/linen-shirt.jpg', size: 'M', color: 'Trắng', quantity: 1, price: 459000, fit_review: null as null | { actual_fit: string; notes: string; updated_at: string } }] };
  await page.route('**/api/orders', route => route.fulfill({ json: [order] }));
  await page.route('**/api/orders/order-fixture/items/987654/fit-review', async route => {
    if (route.request().method() === 'DELETE') { order.items[0].fit_review = null; await route.fulfill({ status: 204 }); return; }
    const body = route.request().postDataJSON();
    order.items[0].fit_review = { ...body, updated_at: new Date().toISOString() };
    await route.fulfill({ json: order.items[0].fit_review });
  });
  await page.goto('/orders', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Đánh giá size đã mua', exact: true }).click();
  await page.getByRole('button', { name: 'Chật', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gửi đánh giá size', exact: true })).toBeDisabled();
  await page.getByRole('switch', { name: 'Đồng ý gửi phản hồi size cho shop', exact: true }).click();
  await page.getByRole('button', { name: 'Gửi đánh giá size', exact: true }).click();
  await page.getByRole('button', { name: 'Sửa đánh giá size', exact: true }).click();
  await page.getByRole('button', { name: 'Gỡ đánh giá size đã gửi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đánh giá size đã mua', exact: true })).toBeVisible();
});

test('shop fit dashboard shows sample counts and budget without invented accuracy', async ({ page }) => {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Chủ shop', exact: true }).click();
  await page.getByRole('button', { name: 'Vào không gian quản lý shop', exact: true }).click();
  await page.getByRole('button', { name: 'Chất lượng độ vừa & hạn mức AI', exact: true }).click();
  await expect(page.getByText('Hoạt động phòng thử', { exact: true })).toBeVisible();
  await expect(page.getByText(/Đã dự trù \$/)).toBeVisible();
  await expect(page.getByText(/không phải hóa đơn Google/)).toBeVisible();
  await expect(page.getByText(/Đã xác nhận số đo:/)).toBeVisible();
});

test('connection setup validates URL and never forwards authorization during host probe', async ({ page, request }) => {
  await setupCustomer(page, request);
  await page.goto('/connection', { waitUntil: 'domcontentloaded' });
  const field = page.getByRole('textbox', { name: 'Địa chỉ backend ShopFit', exact: true });
  await field.fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Kiểm tra & lưu kết nối', exact: true }).click();
  await expect(page.getByText(/Nhập địa chỉ http\(s\)/)).toBeVisible();
  let authorization: string | undefined;
  await page.route('**/api/health', route => { authorization = route.request().headers()['authorization']; return route.fulfill({ json: { status: 'ok', engine: 'openvto', model: 'test', ai_ready: false, demo_accounts: true } }); });
  await field.fill('http://localhost:8000');
  await page.getByRole('button', { name: 'Kiểm tra & lưu kết nối', exact: true }).click();
  await expect(page.getByText(/Đã kết nối shop/)).toBeVisible();
  expect(authorization).toBeUndefined();
});
