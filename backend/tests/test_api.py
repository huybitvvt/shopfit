import io
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.tryon import OpenVTOEngine


def photo_bytes():
    out = io.BytesIO()
    Image.new("RGB", (256, 384), "#ddd9ce").save(out, format="JPEG")
    return out.getvalue()


class TestEngine:
    __test__ = False
    enabled = True

    def generate(self, photo, garment, category, color, context=None):
        return photo_bytes(), {"provider": "test-only", "model": "test-image-model"}

    def generate_view(self, photo, garment, front, angle, category, color, context, back_garment=None):
        return photo_bytes(), {"provider": "test-only"}


class TestAnalyzer:
    __test__ = False

    def check(self, user_id, photo):
        return {"accepted": True, "messages": [], "checks": {"person_count": 1}}

    def validate_view(self, front, candidate, angle):
        return {"accepted": True, "checks": {"outfit_consistent": True, "angle_correct": True}}

    def validate_front(self, original, candidate, garment, category, color):
        return {"accepted": True, "checks": {"full_body_visible": True}}


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, seed_demo=True, gemini_api_key=""), engine=TestEngine(), analyzer=TestAnalyzer())
    app.state.tryon._garment = lambda product: photo_bytes()
    with TestClient(app) as client:
        yield client


def login(client, admin=False):
    response = client.post("/api/auth/login", json={"email": "shop@shopfit.local" if admin else "khach@shopfit.local", "password": "ShopfitAdmin123!" if admin else "Shopfit123!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def checkout_body(quantity=1):
    return {"customer_name": "Nguyen Van An", "phone": "0901234567", "address": "123 Nguyen Hue, Quan 1, TP Ho Chi Minh", "items": [{"product_id": "linen-shirt", "size": "M", "color": "Trắng", "quantity": quantity, "price": 1}]}


def stock(client):
    p = client.get("/api/products/linen-shirt").json()
    return next(v["stock"] for v in p["variants"] if v["size"] == "M" and v["color"] == "Trắng")


def create_tryon(client, headers):
    client.patch("/api/body-profile", headers=headers, json={"height_cm": 175, "weight_kg": 70, "chest_cm": 94, "waist_cm": 80, "hip_cm": 96})
    return client.post("/api/tryons", headers=headers, data={"product_id": "linen-shirt", "color": "Trắng", "size": "M"}, files={"photo": ("photo.jpg", photo_bytes(), "image/jpeg")})


def wait_job(client, headers, job_id):
    for _ in range(100):
        job = client.get(f"/api/tryons/{job_id}", headers=headers).json()
        if job["status"] in ("completed", "failed", "partial"):
            return job
        time.sleep(0.01)
    pytest.fail("Background job did not complete")


def test_catalog_public_admin_routes_protected(client):
    response = client.get("/api/products")
    assert response.status_code == 200
    assert len(response.json()) == 6
    assert client.get("/api/admin/products").status_code == 401
    assert client.get("/api/admin/products", headers=login(client)).status_code == 403
    assert client.get("/api/admin/products", headers=login(client, True)).status_code == 200


def test_registration_normalizes_email_and_logout_revokes_token(client):
    response = client.post("/api/auth/register", json={"name": "Minh Anh", "email": "TEST@Example.com", "password": "password123"})
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "customer"
    assert response.json()["user"]["email"] == "test@example.com"
    headers = {"Authorization": f"Bearer {response.json()['token']}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.post("/api/auth/register", json={"name": "A User", "email": "test@example.com", "password": "password123"}).status_code == 409


def test_server_calculates_price_and_deducts_correct_variant(client):
    response = client.post("/api/orders", headers=login(client), json=checkout_body(2))
    assert response.status_code == 201
    assert response.json()["total"] == 459000 * 2
    assert response.json()["items"][0]["price"] == 459000
    assert stock(client) == 10


def test_order_failure_rolls_back_all_stock_and_no_partial_order(client):
    headers = login(client)
    body = checkout_body(8)
    body["items"].append(body["items"][0].copy())
    assert client.post("/api/orders", headers=headers, json=body).status_code == 409
    assert stock(client) == 12
    assert client.get("/api/orders", headers=headers).json() == []


def test_cancellation_restores_stock_once_and_blocks_invalid_transitions(client):
    headers = login(client)
    oid = client.post("/api/orders", headers=headers, json=checkout_body(3)).json()["id"]
    assert stock(client) == 9
    assert client.patch(f"/api/orders/{oid}", headers=headers, json={"status": "completed"}).status_code == 403
    assert client.patch(f"/api/orders/{oid}", headers=headers, json={"status": "cancelled"}).status_code == 200
    assert stock(client) == 12
    assert client.patch(f"/api/orders/{oid}", headers=headers, json={"status": "cancelled"}).status_code in (403, 409)
    assert stock(client) == 12


def test_admin_order_lifecycle_and_revenue(client):
    customer = login(client)
    admin = login(client, True)
    oid = client.post("/api/orders", headers=customer, json=checkout_body()).json()["id"]
    assert client.patch(f"/api/orders/{oid}", headers=admin, json={"status": "completed"}).status_code == 409
    for status in ("confirmed", "shipping", "completed"):
        assert client.patch(f"/api/orders/{oid}", headers=admin, json={"status": status}).status_code == 200
    assert client.get("/api/admin/summary", headers=admin).json()["revenue"] == 459000


def test_customer_cannot_read_or_change_other_users_order(client):
    customer = login(client)
    oid = client.post("/api/orders", headers=customer, json=checkout_body()).json()["id"]
    session = client.post("/api/auth/register", json={"name": "Other", "email": "other@example.com", "password": "password123"}).json()
    other = {"Authorization": f"Bearer {session['token']}"}
    assert client.get("/api/orders", headers=other).json() == []
    assert client.patch(f"/api/orders/{oid}", headers=other, json={"status": "cancelled"}).status_code == 404


def test_product_upload_create_inventory_update_and_hide(client):
    admin = login(client, True)
    upload = client.post("/api/admin/upload", headers=admin, files={"file": ("shirt.jpg", photo_bytes(), "image/jpeg")})
    assert upload.status_code == 201
    product = {"name": "Ao Test", "category": "Áo", "tryon_category": "tops", "price": 300000, "image_url": upload.json()["url"], "description": "A sample garment for an integration test", "colors": [{"name": "Trắng", "hex": "#FFFFFF"}], "sizes": ["M"], "stock_per_variant": 7}
    response = client.post("/api/admin/products", headers=admin, json=product)
    assert response.status_code == 201
    pid = response.json()["id"]
    assert response.json()["stock"] == 7
    patch = {"price": 350000, "variants": [{"size": "M", "color": "Trắng", "stock": 4}]}
    assert client.patch(f"/api/admin/products/{pid}", headers=admin, json=patch).json()["stock"] == 4
    assert client.patch(f"/api/admin/products/{pid}", headers=admin, json={"active": False}).status_code == 200
    assert client.get(f"/api/products/{pid}").status_code == 404


def test_invalid_variant_update_rolls_back_price(client):
    admin = login(client, True)
    response = client.patch("/api/admin/products/linen-shirt", headers=admin, json={"price": 1, "variants": [{"size": "NOT-A-SIZE", "color": "Trắng", "stock": 4}]})
    assert response.status_code == 400
    assert client.get("/api/products/linen-shirt").json()["price"] == 459000


def test_uploaded_image_is_validated(client):
    assert client.post("/api/admin/upload", headers=login(client, True), files={"file": ("not.jpg", b"not an image", "image/jpeg")}).status_code == 400


def test_tryon_background_job_and_private_signed_images(client):
    headers = login(client)
    response = create_tryon(client, headers)
    assert response.status_code == 202
    job = wait_job(client, headers, response.json()["id"])
    assert job["status"] == "completed"
    assert job["duration_ms"] >= 0
    assert "image_secret" not in job and "photo_path" not in job
    assert client.get(job["result_url"]).status_code == 200
    assert client.get(job["result_url"] + "tampered").status_code == 403
    assert client.get(f"/api/tryons/{job['id']}/image/photo?expires=0&signature=no").status_code == 403
    assert client.get(f"/api/tryons/{job['id']}", headers=login(client, True)).status_code == 404


def test_delete_tryon_removes_images_and_preserves_quota_count(client):
    headers = login(client)
    job = wait_job(client, headers, create_tryon(client, headers).json()["id"])
    assert client.delete(f"/api/tryons/{job['id']}", headers=headers).status_code == 204
    assert client.get("/api/tryons", headers=headers).json() == []
    assert client.get(job["photo_url"]).status_code == 403
    with client.app.state.db.connect() as conn:
        row = conn.execute("SELECT * FROM tryons WHERE id=?", (job["id"],)).fetchone()
        assert row["deleted"] == 1 and row["photo_path"] == "" and row["result_path"] is None
    assert list(client.app.state.db.settings.data_dir.joinpath("private").iterdir()) == []


def test_unconfigured_ai_returns_explicit_unavailable(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, seed_demo=True, gemini_api_key=""))
    with TestClient(app) as client:
        assert client.get("/api/health").json()["ai_ready"] is False
        assert create_tryon(client, login(client)).status_code == 503


def test_openvto_pipeline_uses_google_provider_and_both_reference_images(monkeypatch, tmp_path):
    from openvto.providers.google import GoogleProvider

    captured = {}

    def generate_content(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[SimpleNamespace(inline_data=SimpleNamespace(data=photo_bytes()))]))])

    monkeypatch.setattr(GoogleProvider, "_ensure_client", lambda self: SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    engine = OpenVTOEngine(Settings(data_dir=tmp_path, gemini_api_key="test-key-not-real"))
    image, metadata = engine.generate(photo_bytes(), photo_bytes(), "tops", "Trắng", {"selected_size": "L", "body": {"chest_cm": 94}})
    assert Image.open(io.BytesIO(image)).size == (256, 384)
    parts = captured["contents"][0].parts
    assert sum(p.inline_data is not None for p in parts) == 2
    assert any(p.text and "Trắng" in p.text for p in parts)
    assert any(p.text and '"selected_size": "L"' in p.text and '"chest_cm": 94' in p.text for p in parts)
    assert captured["model"] == "gemini-3.1-flash-image"
    assert metadata["provider"] == "openvto/google"
    captured.clear()
    engine.generate_view(photo_bytes(), photo_bytes(), photo_bytes(), "left", "tops", "Trắng", {"selected_size": "L"})
    parts = captured["contents"][0].parts
    # Do not include the original full-body photo: its old outfit caused side views to revert.
    assert sum(p.inline_data is not None for p in parts) == 2
    assert any(p.text and "LEFT profile" in p.text and '"selected_size": "L"' in p.text for p in parts)
