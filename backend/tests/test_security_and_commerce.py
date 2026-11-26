import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from test_api import TestAnalyzer, TestEngine, checkout_body, client, create_tryon, login, photo_bytes, wait_job


def test_payment_confirm_requires_admin_and_webhook_verifies_secret_and_amount(tmp_path):
    settings = Settings(data_dir=tmp_path, seed_demo=True, gemini_api_key="", payment_webhook_secret="whsec_test_123")
    app = create_app(settings, engine=TestEngine(), analyzer=TestAnalyzer())
    with TestClient(app) as api:
        customer = login(api)
        admin = login(api, True)

        order = api.post("/api/payment/create-order", headers=customer, json={"package_id": "pack_30"}).json()
        tid = order["transaction_id"]
        code = order["payment_code"]
        assert order["qr_url"].startswith("https://qr.sepay.vn/img?")
        assert code in order["qr_url"]

        # Customer clicking "I have paid" only transitions to 'verifying', never grants free credits
        res = api.post(f"/api/payment/confirm/{tid}", headers=customer)
        assert res.status_code == 200
        assert res.json()["status"] == "verifying"
        assert api.get("/api/user/quota", headers=customer).json()["starter_tryons_left"] == 3
        assert api.get("/api/user/vouchers", headers=customer).json() == []

        # Webhook without secret or wrong secret is blocked
        assert api.post("/api/payment/webhook", json={"content": code, "transferAmount": 49000}).status_code == 401
        assert api.post("/api/payment/webhook", headers={"X-Webhook-Secret": "wrong"}, json={"content": code, "transferAmount": 49000}).status_code == 401

        # Webhook with insufficient transfer amount is ignored (still returns SePay success=True)
        underpaid = api.post(
            "/api/payment/webhook",
            headers={"Authorization": "Apikey whsec_test_123"},
            json={"id": 1001, "transferType": "in", "content": code, "transferAmount": 1000},
        )
        assert underpaid.status_code == 200 and underpaid.json()["success"] is True and underpaid.json()["status"] == "ignored"
        assert api.get("/api/user/quota", headers=customer).json()["starter_tryons_left"] == 3

        # Admin sees verifying payment and can approve 1-touch (or valid webhook completes it)
        pending_list = api.get("/api/admin/payments", headers=admin).json()
        assert any(p["id"] == tid and p["status"] == "verifying" for p in pending_list)
        approved = api.post(f"/api/admin/payments/{tid}/approve", headers=admin)
        assert approved.status_code == 200 and approved.json()["status"] == "completed"
        assert api.get("/api/user/quota", headers=customer).json()["starter_tryons_left"] == 33
        assert len(api.get("/api/user/vouchers", headers=customer).json()) == 1


def test_sepay_webhook_topup_idempotency_and_transfer_filters(tmp_path):
    settings = Settings(
        data_dir=tmp_path,
        seed_demo=True,
        gemini_api_key="",
        payment_webhook_secret="sepay_live_secret_999",
        bank_id="VPBank",
        bank_account="012344413",
        bank_account_name="NGUYEN DOAN HUY",
    )
    app = create_app(settings, engine=TestEngine(), analyzer=TestAnalyzer())
    with TestClient(app) as api:
        customer = login(api)
        admin = login(api, True)
        order = api.post("/api/payment/create-order", headers=customer, json={"package_id": "pack_30"}).json()
        code = order["payment_code"]
        sepay_headers = {"Authorization": "Apikey sepay_live_secret_999"}

        # Outgoing transfer must be ignored
        out_res = api.post(
            "/api/payment/webhook",
            headers=sepay_headers,
            json={"id": 2001, "gateway": "VPBank", "accountNumber": "012344413", "transferType": "out", "transferAmount": 49000, "content": code},
        )
        assert out_res.status_code == 200 and out_res.json()["success"] is True and out_res.json()["status"] == "ignored"

        # Wrong bank account must be ignored
        wrong_acc = api.post(
            "/api/payment/webhook",
            headers=sepay_headers,
            json={"id": 2002, "gateway": "VPBank", "accountNumber": "999999999", "transferType": "in", "transferAmount": 49000, "content": code},
        )
        assert wrong_acc.status_code == 200 and wrong_acc.json()["success"] is True and wrong_acc.json()["status"] == "ignored"

        # Valid SePay incoming transfer completes top-up automatically
        payload = {
            "id": 2003,
            "gateway": "VPBank",
            "transactionDate": "2026-11-26 21:00:00",
            "accountNumber": "012344413",
            "code": None,
            "content": f"VPB.CT.{code}.CHUYEN KHOAN",
            "transferType": "in",
            "transferAmount": 49000,
            "referenceCode": "FT2633000123",
        }
        ok = api.post("/api/payment/webhook", headers=sepay_headers, json=payload)
        assert ok.status_code == 200
        assert ok.json()["success"] is True and ok.json()["kind"] == "topup" and ok.json()["status"] == "completed"
        assert api.get("/api/user/quota", headers=customer).json()["starter_tryons_left"] == 33
        assert len(api.get("/api/user/vouchers", headers=customer).json()) == 1

        # Duplicate SePay webhook with same id must NOT double-credit
        dup = api.post("/api/payment/webhook", headers=sepay_headers, json=payload)
        assert dup.status_code == 200 and dup.json()["success"] is True and dup.json()["status"] == "duplicate"
        assert api.get("/api/user/quota", headers=customer).json()["starter_tryons_left"] == 33
        assert len(api.get("/api/user/vouchers", headers=customer).json()) == 1

        # Audit metadata stored on payment record
        admin_rows = api.get("/api/admin/payments", headers=admin).json()
        matched = next(p for p in admin_rows if p["id"] == order["transaction_id"])
        assert matched["sepay_tx_id"] == "2003"
        assert matched["reference_code"] == "FT2633000123"
        assert matched["gateway"] == "VPBank"


def test_vietqr_order_checkout_sepay_auto_confirm_and_admin_fallback(tmp_path):
    settings = Settings(
        data_dir=tmp_path,
        seed_demo=True,
        gemini_api_key="",
        payment_webhook_secret="sepay_order_secret",
        bank_id="VPBank",
        bank_account="012344413",
        bank_account_name="NGUYEN DOAN HUY",
        tryon_angles=("front",),
    )
    app = create_app(settings, engine=TestEngine(), analyzer=TestAnalyzer())
    with TestClient(app) as api:
        health = api.get("/api/health").json()
        assert health["tryon_angles"] == ["front"]

        customer = login(api)
        admin = login(api, True)

        # 1. Create VietQR order
        res = api.post("/api/orders", headers=customer, json={**checkout_body(1), "payment_method": "vietqr"})
        assert res.status_code == 201
        order = res.json()
        oid = order["id"]
        pcode = order["payment_code"]
        assert order["payment_method"] == "vietqr"
        assert order["payment_status"] == "unpaid"
        assert order["status"] == "pending"
        assert pcode and pcode.startswith("SF") and len(pcode) == 8
        assert order["payment_qr_url"].startswith("https://qr.sepay.vn/img?")
        assert order["bank_id"] == "VPBank" and order["bank_account"] == "012344413"

        # Customer report-paid transitions to verifying, NEVER paid
        rep = api.post(f"/api/orders/{oid}/report-paid", headers=customer)
        assert rep.status_code == 200 and rep.json()["payment_status"] == "verifying" and rep.json()["status"] == "pending"

        # Underpaid SePay transfer is ignored
        sepay_headers = {"Authorization": "Apikey sepay_order_secret"}
        under = api.post(
            "/api/payment/webhook",
            headers=sepay_headers,
            json={"id": 3001, "accountNumber": "012344413", "transferType": "in", "transferAmount": 10000, "content": pcode},
        )
        assert under.status_code == 200 and under.json()["success"] is True and under.json()["status"] == "ignored"
        assert api.get(f"/api/orders/{oid}", headers=customer).json()["payment_status"] == "verifying"

        # Full-amount SePay transfer marks order paid AND auto-confirms order!
        paid = api.post(
            "/api/payment/webhook",
            headers=sepay_headers,
            json={"id": 3002, "gateway": "VPBank", "accountNumber": "012344413", "transferType": "in", "transferAmount": 459000, "content": f"KH THANH TOAN {pcode}"},
        )
        assert paid.status_code == 200
        assert paid.json()["success"] is True and paid.json()["kind"] == "order" and paid.json()["status"] == "paid" and paid.json()["order_id"] == oid

        latest = api.get(f"/api/orders/{oid}", headers=customer).json()
        assert latest["payment_status"] == "paid"
        assert latest["status"] == "confirmed"
        assert latest["sepay_tx_id"] == "3002"
        assert latest["paid_at"] is not None

        # Paid order cannot be self-cancelled by customer
        assert api.patch(f"/api/orders/{oid}", headers=customer, json={"status": "cancelled"}).status_code == 409

        # Duplicate SePay webhook returns duplicate safely
        dup = api.post(
            "/api/payment/webhook",
            headers=sepay_headers,
            json={"id": 3002, "gateway": "VPBank", "accountNumber": "012344413", "transferType": "in", "transferAmount": 459000, "content": f"KH THANH TOAN {pcode}"},
        )
        assert dup.status_code == 200 and dup.json()["success"] is True and dup.json()["status"] == "duplicate"

        # 2. Admin manual fallback confirm-payment on another VietQR order
        order2 = api.post("/api/orders", headers=customer, json={**checkout_body(1), "payment_method": "vietqr"}).json()
        confirmed2 = api.post(f"/api/admin/orders/{order2['id']}/confirm-payment", headers=admin)
        assert confirmed2.status_code == 200
        assert confirmed2.json()["payment_status"] == "paid" and confirmed2.json()["status"] == "confirmed"


def test_account_deletion_succeeds_with_orders_payments_and_vouchers(client):
    reg = client.post("/api/auth/register", json={"name": "Delete Me", "email": "deleteme@example.com", "password": "password123"})
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    admin = login(client, True)

    # Create order + payment + voucher
    ord_res = client.post("/api/orders", headers=headers, json=checkout_body(1))
    assert ord_res.status_code == 201
    oid = ord_res.json()["id"]

    pay_res = client.post("/api/payment/create-order", headers=headers, json={"package_id": "pack_30"}).json()
    client.post(f"/api/admin/payments/{pay_res['transaction_id']}/approve", headers=admin)
    assert len(client.get("/api/user/vouchers", headers=headers).json()) == 1

    # Delete account must succeed (200) without ForeignKeyViolation while preserving anonymized shop order record
    del_res = client.delete("/api/auth/me", headers=headers)
    assert del_res.status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    admin_orders = client.get("/api/orders", headers=admin).json()
    preserved = next(o for o in admin_orders if o["id"] == oid)
    assert preserved["customer_name"] == "Người dùng đã xóa"
    assert preserved["user_id"] is None


def test_vip_tier_only_upgrades_on_completed_orders_and_vouchers_restore_on_cancel(client):
    reg = client.post("/api/auth/register", json={"name": "VIP Buyer", "email": "vip@example.com", "password": "password123"})
    headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    admin = login(client, True)

    # Grant a 30k voucher via approved top-up (49k spent)
    pay = client.post("/api/payment/create-order", headers=headers, json={"package_id": "pack_30"}).json()
    client.post(f"/api/admin/payments/{pay['transaction_id']}/approve", headers=admin)
    voucher = client.get("/api/user/vouchers", headers=headers).json()[0]

    # Place a large COD order using the voucher
    body = {**checkout_body(3), "voucher_code": voucher["code"]}  # 459,000 * 3 = 1,377,000 -> - 30,000 = 1,347,000
    order = client.post("/api/orders", headers=headers, json=body)
    assert order.status_code == 201
    assert order.json()["subtotal"] == 459000 * 3
    assert order.json()["discount_amount"] == 30000
    assert order.json()["total"] == 459000 * 3 - 30000

    # Pending COD order must NOT prematurely upgrade VIP tier!
    assert client.get("/api/user/quota", headers=headers).json()["vip_tier"] == "bronze"
    assert client.get("/api/user/vouchers", headers=headers).json() == []

    # Cancelling restores the voucher!
    assert client.patch(f"/api/orders/{order.json()['id']}", headers=headers, json={"status": "cancelled"}).status_code == 200
    assert len(client.get("/api/user/vouchers", headers=headers).json()) == 1

    # Re-order and complete -> upgrades to Silver (5% discount on next order!)
    order2 = client.post("/api/orders", headers=headers, json=body).json()
    for st in ("confirmed", "shipping", "completed"):
        assert client.patch(f"/api/orders/{order2['id']}", headers=admin, json={"status": st}).status_code == 200
    quota = client.get("/api/user/quota", headers=headers).json()
    assert quota["vip_tier"] == "silver" and quota["discount_percent"] == 5


def test_size_chart_preserves_detail_image_and_product_supports_full_edit(client):
    admin = login(client, True)
    up_main = client.post("/api/admin/upload", headers=admin, files={"file": ("m.jpg", photo_bytes(), "image/jpeg")}).json()["url"]
    up_back = client.post("/api/admin/upload", headers=admin, files={"file": ("b.jpg", photo_bytes(), "image/jpeg")}).json()["url"]
    up_detail = client.post("/api/admin/upload", headers=admin, files={"file": ("d.jpg", photo_bytes(), "image/jpeg")}).json()["url"]

    created = client.post("/api/admin/products", headers=admin, json={
        "name": "Đầm Lụa Mới",
        "category": "Đầm liền",
        "tryon_category": "one-pieces",
        "price": 690000,
        "image_url": up_main,
        "back_image_url": up_back,
        "detail_image_url": up_detail,
        "material": "Lụa tơ tằm",
        "description": "Thiết kế đầm lụa suông thanh lịch",
        "colors": [{"name": "Trắng", "hex": "#FFFFFF"}, {"name": "Đen", "hex": "#1C2421"}],
        "sizes": ["S", "M"],
        "stock_per_variant": 5,
    })
    assert created.status_code == 201
    prod = created.json()
    pid = prod["id"]
    # Auto-generated size chart rows must exist immediately for AI Sizing
    assert len(prod["size_chart"]["rows"]) == 2
    assert prod["detail_image_url"] == up_detail

    # Updating size chart without sending detail_image_url must NOT wipe detail_image_url
    patched_chart = client.patch(f"/api/admin/products/{pid}/size-chart", headers=admin, json={
        "rows": prod["size_chart"]["rows"],
        "verified": True,
        "back_image_url": up_back,
    })
    assert patched_chart.status_code == 200
    assert patched_chart.json()["detail_image_url"] == up_detail

    # Full product edit: update description, material, sizes, colors
    edited = client.patch(f"/api/admin/products/{pid}", headers=admin, json={
        "description": "Mô tả đã cập nhật đầy đủ hơn",
        "material": "Lụa Mulberry 100%",
        "sizes": ["S", "M", "L"],
    })
    assert edited.status_code == 200
    assert edited.json()["material"] == "Lụa Mulberry 100%"
    assert edited.json()["sizes"] == ["S", "M", "L"]
    assert len(edited.json()["variants"]) == 6  # 3 sizes x 2 colors


def test_chushop_password_change_persists_across_reinitialize(tmp_path):
    settings = Settings(data_dir=tmp_path, seed_demo=False, gemini_api_key="")
    app = create_app(settings)
    with TestClient(app) as api:
        res = api.post("/api/auth/login", json={"email": "chushop", "password": "123"})
        assert res.status_code == 200
        headers = {"Authorization": f"Bearer {res.json()['token']}"}
        chg = api.post("/api/auth/change-password", headers=headers, json={"current_password": "123", "new_password": "NewStrongPassword!99"})
        assert chg.status_code == 200

    # Simulate server restart / redeploy: password must NOT reset back to '123'
    app2 = create_app(settings)
    with TestClient(app2) as api2:
        assert api2.post("/api/auth/login", json={"email": "chushop", "password": "123"}).status_code == 401
        assert api2.post("/api/auth/login", json={"email": "chushop", "password": "NewStrongPassword!99"}).status_code == 200


def test_tryon_analytics_conversion_rate_never_exceeds_100_percent(client):
    customer = login(client)
    admin = login(client, True)
    # 1 user tries linen-shirt once, then buys 5 units, while another user buys 5 units without trying
    job = wait_job(client, customer, create_tryon(client, customer).json()["id"])
    assert job["status"] == "completed"
    client.post("/api/orders", headers=customer, json=checkout_body(5))

    other = client.post("/api/auth/register", json={"name": "Organic", "email": "organic@example.com", "password": "password123"}).json()
    client.post("/api/orders", headers={"Authorization": f"Bearer {other['token']}"}, json=checkout_body(5))

    ana = client.get("/api/admin/tryon-analytics", headers=admin).json()
    linen = next(x for x in ana["top_products"] if x["product_id"] == "linen-shirt")
    assert linen["conversion_rate"] == 100.0
    assert ana["avg_conversion_rate"] <= 100.0


def test_public_vs_private_fit_reviews_mask_customer_identity(client):
    reg = client.post("/api/auth/register", json={"name": "Nguyễn Minh Anh", "email": "minhanh@example.com", "password": "password123"})
    headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    admin = login(client, True)

    order = client.post("/api/orders", headers=headers, json={**checkout_body(1), "customer_name": "Nguyễn Minh Anh"}).json()
    for st in ("confirmed", "shipping", "completed"):
        assert client.patch(f"/api/orders/{order['id']}", headers=admin, json={"status": st}).status_code == 200

    item_id = order["items"][0]["id"]

    # 1. Private review (default share_public=False) must NOT expose notes publicly
    r_priv = client.post(
        f"/api/orders/{order['id']}/items/{item_id}/fit-review",
        headers=headers,
        json={"actual_fit": "fits", "notes": "Ghi chú riêng tư chỉ cho shop"},
    )
    assert r_priv.status_code == 200
    fb_priv = client.get("/api/products/linen-shirt/fit-feedback").json()
    assert fb_priv["reviews"] == []
    assert "Ghi chú riêng tư" not in str(fb_priv)

    # 2. Public opt-in (share_public=True) masks buyer name ("N*** A***") and shares helpful sizing note
    r_pub = client.post(
        f"/api/orders/{order['id']}/items/{item_id}/fit-review",
        headers=headers,
        json={"actual_fit": "fits", "notes": "Cao 1m60 nặng 50kg mặc size M vừa vặn, chất vải mát.", "share_public": True},
    )
    assert r_pub.status_code == 200
    fb_pub = client.get("/api/products/linen-shirt/fit-feedback").json()
    assert len(fb_pub["reviews"]) == 1
    rev = fb_pub["reviews"][0]
    assert rev["masked_user"] == "N*** A***"
    assert "Nguyễn Minh Anh" not in str(fb_pub)
    assert rev["size"] == "M"
    assert rev["actual_fit"] == "fits"
    assert "1m60" in rev["notes"]

    my_orders = client.get("/api/orders", headers=headers).json()
    assert my_orders[0]["items"][0]["fit_review"]["share_public"] is True

