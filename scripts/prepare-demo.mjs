#!/usr/bin/env node
/**
 * Idempotent live demo preparation script for Capstone Defense.
 * Seeds realistic verified size charts, a ready-to-demo customer account
 * (khachhang@shopfit.vn / 123456) with Body Profile + Wardrobe item,
 * and 3 anonymized buyer fit reviews on "linen-shirt" without touching unit-test defaults.
 */

const API_URL = (process.env.API_URL || 'https://shopfit-api.onrender.com').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'chushop';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123';

async function api(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function ensureUser(name, email, password) {
  try {
    const session = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return session.token;
  } catch {
    const session = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    return session.token;
  }
}

async function main() {
  console.log(`Connecting to ${API_URL} ...`);
  const health = await api('/api/health');
  console.log(`Health: ${health.status} | AI Ready: ${health.ai_ready} | Engine: ${health.engine}`);

  const adminSession = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const adminToken = adminSession.token;
  console.log('✓ Logged in as shop owner (chushop)');

  // 1. Mark flagship products' size charts as shop-verified (while keeping others unverified to showcase both states)
  const products = await api('/api/products');
  for (const targetId of ['linen-shirt', 'midi-dress']) {
    const prod = products.find(p => p.id === targetId);
    if (prod && prod.size_chart?.rows?.length && !prod.size_chart.verified) {
      await api(
        `/api/admin/products/${prod.id}/size-chart`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            rows: prod.size_chart.rows,
            verified: true,
            ease: prod.size_chart.ease,
            back_image_url: prod.back_image_url || prod.size_chart.back_image_url || null,
            detail_image_url: prod.detail_image_url || prod.size_chart.detail_image_url || null,
          }),
        },
        adminToken
      );
      console.log(`✓ Verified real garment measurements for ${prod.id}`);
    } else if (prod) {
      console.log(`• ${prod.id} size chart already verified`);
    }
  }

  // 2. Ensure primary demo customer account + Body Profile + Wardrobe reference garment
  const customerToken = await ensureUser('Nguyễn Minh Anh', 'khachhang@shopfit.vn', '123456');
  await api(
    '/api/body-profile',
    {
      method: 'PATCH',
      body: JSON.stringify({
        height_cm: 160,
        weight_kg: 50,
        chest_cm: 84,
        waist_cm: 66,
        hip_cm: 90,
        shoulder_cm: 38,
        inseam_cm: 70,
        fit_preference: 'regular',
      }),
    },
    customerToken
  );

  const wardrobe = await api('/api/wardrobe', {}, customerToken);
  if (!wardrobe.some(w => w.name === 'Sơ mi công sở đang mặc vừa')) {
    await api(
      '/api/wardrobe',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Sơ mi công sở đang mặc vừa',
          category: 'tops',
          material: 'Cotton Poplin ít giãn',
          measurements: {
            size: 'REF',
            chest_cm: 95,
            waist_cm: 88,
            shoulder_cm: 39,
            length_cm: 65,
          },
        }),
      },
      customerToken
    );
    console.log('✓ Added reference wardrobe garment for khachhang@shopfit.vn');
  }

  // 3. Seed 3 anonymized public buyer fit reviews on flagship product ("linen-shirt" or first active product)
  const targetProduct = products.find(p => p.id === 'linen-shirt') || products[0];
  if (targetProduct) {
    const existingFeedback = await api(`/api/products/${targetProduct.id}/fit-feedback`);
    const existingPublicCount = (existingFeedback.reviews || []).length;
    if (existingPublicCount < 3) {
      const sampleReviewers = [
        {
          name: 'Nguyễn Minh Anh',
          email: 'khachhang@shopfit.vn',
          password: '123456',
          fit: 'fits',
          note: 'Mình cao 1m60 nặng 50kg, hệ thống gợi ý size M chuẩn xác luôn. Vải linen mềm thoáng, lên phom suông nhẹ đúng ý.',
        },
        {
          name: 'Trần Thảo Vy',
          email: 'thaovy.demo@shopfit.vn',
          password: '123456',
          fit: 'fits',
          note: 'Vai và ngực mặc size M rất thoải mái không bị kích, màu ngoài đời giống ảnh chụp cận vải của shop.',
        },
        {
          name: 'Lê Hoàng Ngân',
          email: 'hoangngan.demo@shopfit.vn',
          password: '123456',
          fit: 'loose',
          note: 'Mình 47kg thích mặc rộng kiểu Hàn nên lấy M hơi thụng nhẹ, bạn nào thích ôm gọn hơn có thể lùi xuống S nha.',
        },
      ];

      const chosenColor = targetProduct.colors?.[0]?.name || 'Trắng kem';
      const chosenSize = targetProduct.sizes?.includes('M') ? 'M' : targetProduct.sizes?.[0] || 'M';

      for (const reviewer of sampleReviewers) {
        const tok = await ensureUser(reviewer.name, reviewer.email, reviewer.password);
        const myOrders = await api('/api/orders', {}, tok);
        let completedOrder = myOrders.find(
          o => o.status === 'completed' && o.items?.some(i => i.product_id === targetProduct.id)
        );

        if (!completedOrder) {
          const idemKey = `demo-seed-${reviewer.email}-${targetProduct.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
          const created = await api(
            '/api/orders',
            {
              method: 'POST',
              headers: { 'X-Idempotency-Key': idemKey },
              body: JSON.stringify({
                customer_name: reviewer.name,
                phone: '0912345678',
                address: '144 Xuân Thủy, Cầu Giấy, Hà Nội',
                note: 'Đơn mẫu phục vụ kiểm thử phản hồi size thực tế',
                items: [{ product_id: targetProduct.id, size: chosenSize, color: chosenColor, quantity: 1 }],
              }),
            },
            tok
          );
          for (const st of ['confirmed', 'shipping', 'completed']) {
            completedOrder = await api(
              `/api/orders/${created.id}`,
              { method: 'PATCH', body: JSON.stringify({ status: st }) },
              adminToken
            );
          }
        }

        const orderItem = completedOrder.items.find(i => i.product_id === targetProduct.id);
        if (orderItem) {
          await api(
            `/api/orders/${completedOrder.id}/items/${orderItem.id}/fit-review`,
            {
              method: 'POST',
              body: JSON.stringify({
                actual_fit: reviewer.fit,
                notes: reviewer.note,
                share_public: true,
              }),
            },
            tok
          );
        }
      }
      console.log(`✓ Seeded 3 verified anonymized buyer reviews on ${targetProduct.id}`);
    } else {
      console.log(`• ${targetProduct.id} already has ${existingPublicCount} public buyer reviews`);
    }
  }

  console.log('\n🎉 Live demo preparation complete!');
  console.log('   • Admin:    chushop / 123');
  console.log('   • Customer: khachhang@shopfit.vn / 123456');
}

main().catch(err => {
  console.error('Demo preparation failed:', err);
  process.exit(1);
});
