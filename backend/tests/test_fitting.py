import hashlib
import io
import json
import time

import pytest
from PIL import Image

from app.config import Settings
from app.db import Database
from app.photo_checks import PhotoAnalyzer
from app.tryon import normalize_image
from test_api import client, create_tryon, login, photo_bytes, wait_job

PROFILE = {"height_cm": 175, "weight_kg": 70, "chest_cm": 94, "waist_cm": 80, "hip_cm": 96}
CLEAR_INSPECTION = {"person_count": 1, "full_body_visible": True, "front_facing": True,
    "standing_straight": True, "clear_lighting": True, "sharp": True, "body_unobstructed": True}


def test_profile_is_private_and_validated(client):
    customer, admin = login(client), login(client, True)
    assert client.get("/api/body-profile").status_code == 401
    assert client.patch("/api/body-profile", headers=customer, json={**PROFILE, "height_cm": 0}).status_code == 422
    assert client.patch("/api/body-profile", headers=customer, json=PROFILE).status_code == 200
    assert client.get("/api/body-profile", headers=admin).json()["profile"] is None
    assert client.delete("/api/body-profile", headers=customer).status_code == 204
    assert client.get("/api/body-profile", headers=customer).json()["profile"] is None


def test_size_advice_requires_circumferences_and_explains_ease(client):
    customer = login(client)
    path = "/api/products/linen-shirt/size-advice"
    assert client.post(path, headers=customer, json={"color": "Trắng"}).json()["status"] == "needs_profile"
    client.patch("/api/body-profile", headers=customer, json={"height_cm": 175, "weight_kg": 70})
    assert client.post(path, headers=customer, json={"color": "Trắng"}).json()["missing"] == ["chest_cm"]
    client.patch("/api/body-profile", headers=customer, json=PROFILE)
    advice = client.post(path, headers=customer, json={"color": "Trắng"}).json()
    assert advice["recommended_size"] == "L"  # 104 - 94 = 10 cm; M has only 6 cm, target 8 cm.
    recommended = next(c for c in advice["candidates"] if c["size"] == "L")
    assert recommended["checks"][0]["ease_cm"] == 10
    assert "minh họa" in advice["warnings"][0]
    admin = login(client, True)
    client.patch("/api/admin/products/linen-shirt", headers=admin, json={"variants": [
        {"size": s, "color": "Trắng", "stock": 0} for s in ("L", "XL")]})
    assert client.post(path, headers=customer, json={"color": "Trắng"}).json()["status"] == "no_fit"


def test_chart_verification_requires_real_fields_and_admin(client):
    path = "/api/admin/products/linen-shirt/size-chart"
    assert client.patch(path, headers=login(client), json={"rows": []}).status_code == 403
    admin = login(client, True)
    assert client.patch(path, headers=admin, json={"verified": True, "rows": []}).status_code == 400
    assert client.patch(path, headers=admin, json={"rows": [{"size": "XXL", "chest_cm": 120}]}).status_code == 400
    chart = {"verified": True, "rows": [{"size": s, "chest_cm": 96 + 4*i} for i, s in enumerate(["S", "M", "L", "XL"])]}
    assert client.patch(path, headers=admin, json=chart).json()["size_chart"]["verified"] is True


def test_four_views_signed_and_immutable_fit_snapshot(client):
    customer = login(client)
    job = wait_job(client, customer, create_tryon(client, customer).json()["id"])
    assert [v["angle"] for v in job["views"]] == ["front", "left", "back", "right"]
    assert all(v["status"] == "completed" and client.get(v["url"]).status_code == 200 for v in job["views"])
    assert all("path" not in v for v in job["views"])
    assert "product" not in job["fit_snapshot"]
    assert job["size"] == "M" and job["body_snapshot"]["chest_cm"] == 94
    client.patch("/api/body-profile", headers=customer, json={**PROFILE, "chest_cm": 100})
    assert client.get(f"/api/tryons/{job['id']}", headers=customer).json()["body_snapshot"]["chest_cm"] == 94


def test_partial_failure_retries_only_missing_view(client):
    engine = client.app.state.tryon.engine
    calls = []
    original = engine.generate_view

    def fail_back(*args):
        angle = args[3]
        calls.append(angle)
        if angle == "back":
            raise RuntimeError("test simulated failure")
        return original(*args)

    engine.generate_view = fail_back
    customer = login(client)
    job = wait_job(client, customer, create_tryon(client, customer).json()["id"])
    assert job["status"] == "partial" and job["result_url"]
    assert calls == ["left", "back", "right"]
    engine.generate_view = lambda *args: (calls.append(args[3]) or original(*args))
    assert client.post(f"/api/tryons/{job['id']}/retry", headers=login(client, True)).status_code == 404
    assert client.post(f"/api/tryons/{job['id']}/retry", headers=customer).status_code == 202
    retried = wait_job(client, customer, job["id"])
    assert retried["status"] == "completed" and retried["retry_count"] == 1
    assert calls == ["left", "back", "right", "back"]
    assert client.post(f"/api/tryons/{job['id']}/retry", headers=customer).status_code == 409


def test_rejected_photo_never_starts_generation(client):
    customer = login(client)
    client.app.state.tryon.engine.generate = lambda *args: (_ for _ in ()).throw(AssertionError("must not call"))
    client.app.state.photo_analyzer.check = lambda *args: {"accepted": False, "messages": ["Full body required"]}
    client.patch("/api/body-profile", headers=customer, json=PROFILE)
    assert client.post("/api/tryons", headers=customer, data={"product_id": "linen-shirt", "color": "Trắng", "size": "M"},
                       files={"photo": ("photo.jpg", photo_bytes(), "image/jpeg")}).status_code == 400
    assert client.get("/api/tryons", headers=customer).json() == []


def test_photo_checks_reject_crop_and_cache_per_owner(tmp_path):
    settings = Settings(data_dir=tmp_path, gemini_api_key="", seed_demo=True)
    db = Database(settings)
    db.initialize()
    analyzer = PhotoAnalyzer(db, settings)
    calls = []
    analyzer.inspect = lambda image: (calls.append(True) or {"person_count": 1, "full_body_visible": False,
        "front_facing": True, "standing_straight": True, "clear_lighting": True, "sharp": True, "body_unobstructed": True})
    image = io.BytesIO()
    Image.new("RGB", (768, 1024)).save(image, "JPEG")
    report = analyzer.check("demo-customer", image.getvalue())
    assert report["accepted"] is False and "bàn chân" in report["messages"][0]
    analyzer.check("demo-customer", image.getvalue())
    assert len(calls) == 1
    analyzer.check("demo-admin", image.getvalue())
    assert len(calls) == 2


def test_clear_small_photo_is_accepted_without_upscaling(tmp_path):
    settings = Settings(data_dir=tmp_path, gemini_api_key="", seed_demo=True)
    db = Database(settings)
    db.initialize()
    analyzer = PhotoAnalyzer(db, settings)
    analyzer.inspect = lambda photo: CLEAR_INSPECTION.copy()
    image = io.BytesIO()
    Image.new("RGB", (474, 633)).save(image, "JPEG")
    photo = normalize_image(image.getvalue())
    with Image.open(io.BytesIO(photo)) as decoded:
        assert decoded.size == (474, 633)
    report = analyzer.check("demo-customer", photo)
    assert report["accepted"] and report["messages"] == []
    assert report["resolution_ok"] is False and "474 × 633" in report["warnings"][0]


@pytest.mark.parametrize("dimensions", [(474, 633), (768, 1024)])
def test_severe_blur_is_rejected_regardless_of_resolution(tmp_path, dimensions):
    settings = Settings(data_dir=tmp_path, gemini_api_key="", seed_demo=True)
    db = Database(settings)
    db.initialize()
    analyzer = PhotoAnalyzer(db, settings)
    analyzer.inspect = lambda photo: {**CLEAR_INSPECTION, "sharp": False}
    image = io.BytesIO()
    Image.new("RGB", dimensions).save(image, "JPEG")
    report = analyzer.check("demo-customer", image.getvalue())
    assert report["accepted"] is False
    assert len(report["messages"]) == 1 and "quá mờ" in report["messages"][0]


def test_old_resolution_rejection_is_reassessed_without_paid_check_or_extending_cache(tmp_path):
    settings = Settings(data_dir=tmp_path, gemini_api_key="", seed_demo=True)
    db = Database(settings)
    db.initialize()
    analyzer = PhotoAnalyzer(db, settings)
    analyzer.inspect = lambda photo: (_ for _ in ()).throw(AssertionError("must reuse cached inspection"))
    image = io.BytesIO()
    Image.new("RGB", (474, 633)).save(image, "JPEG")
    photo = image.getvalue()
    old_report = {"accepted": False, "resolution_ok": False, "checks": CLEAR_INSPECTION,
        "messages": ["Dùng ảnh tối thiểu 512 × 768 px, chụp dọc toàn thân."]}
    expires = int(time.time()) + 600
    digest = hashlib.sha256(photo).hexdigest()
    with db.connect() as conn:
        conn.execute("INSERT INTO photo_checks VALUES (?,?,?,?)", ("demo-customer", digest, json.dumps(old_report), expires))
    report = analyzer.check("demo-customer", photo)
    assert report["accepted"] and report["messages"] == [] and report["warnings"]
    with db.connect() as conn:
        assert conn.execute("SELECT expires_at FROM photo_checks WHERE user_id=? AND digest=?", ("demo-customer", digest)).fetchone()[0] == expires


def test_actual_wearing_evaluation_private_and_removed_with_job(client):
    customer = login(client)
    job = wait_job(client, customer, create_tryon(client, customer).json()["id"])
    path = f"/api/tryons/{job['id']}/evaluation"
    assert client.get(path, headers=customer).json() is None
    response = client.post(path, headers=customer, data={"identity_score": 4, "garment_score": 3, "fit_score": 2,
        "actual_fit": "tight", "notes": "Real wearing comparison"}, files={"photo": ("actual.jpg", photo_bytes(), "image/jpeg")})
    assert response.status_code == 200
    url = response.json()["actual_url"]
    assert client.get(url).status_code == 200
    assert client.get(path, headers=login(client, True)).status_code == 404
    assert client.delete(f"/api/tryons/{job['id']}", headers=customer).status_code == 204
    assert client.get(url).status_code == 403
    assert list(client.app.state.db.settings.data_dir.joinpath("private").iterdir()) == []


def test_wrong_outfit_is_not_exposed_as_a_successful_view(client):
    customer = login(client)
    client.app.state.photo_analyzer.validate_view = lambda front, candidate, angle: {
        "accepted": angle != "left", "checks": {"outfit_consistent": angle != "left"}}
    job = wait_job(client, customer, create_tryon(client, customer).json()["id"])
    assert job["status"] == "partial"
    left = next(v for v in job["views"] if v["angle"] == "left")
    assert left["status"] == "failed" and left["url"] is None
    assert left["quality"]["checks"]["outfit_consistent"] is False
    assert not client.app.state.db.settings.data_dir.joinpath("private", f"{job['id']}-left.jpg").exists()


def test_generation_requires_profile_and_available_selected_variant(client):
    customer = login(client)
    def submit(size):
        return client.post("/api/tryons", headers=customer,
                           data={"product_id": "linen-shirt", "color": "Trắng", "size": size},
                           files={"photo": ("photo.jpg", photo_bytes(), "image/jpeg")})
    assert submit("M").status_code == 400
    client.patch("/api/body-profile", headers=customer, json=PROFILE)
    assert submit("XXL").status_code == 400
    assert client.get("/api/tryons", headers=customer).json() == []


def test_retry_limit_and_deleted_records_still_count_towards_daily_limit(client):
    customer = login(client)
    client.app.state.photo_analyzer.validate_view = lambda *args: {"accepted": False, "checks": {}}
    job = wait_job(client, customer, create_tryon(client, customer).json()["id"])
    for _ in range(2):
        assert client.post(f"/api/tryons/{job['id']}/retry", headers=customer).status_code == 202
        assert wait_job(client, customer, job["id"])["status"] == "partial"
    assert client.post(f"/api/tryons/{job['id']}/retry", headers=customer).status_code == 429
    client.app.state.tryon.settings.daily_limit = 3
    assert client.delete(f"/api/tryons/{job['id']}", headers=customer).status_code == 204
    assert create_tryon(client, customer).status_code == 429


def test_migration_preserves_existing_single_view_and_profile(tmp_path):
    settings = Settings(data_dir=tmp_path, seed_demo=True, gemini_api_key="")
    db = Database(settings)
    db.initialize()
    with db.connect() as conn:
        conn.execute("UPDATE products SET name='My custom name' WHERE id='linen-shirt'")
        conn.execute("INSERT INTO body_profiles VALUES (?,?,?)", ("demo-customer", json.dumps(PROFILE), "today"))
        conn.execute("INSERT INTO tryons (id,user_id,product_id,status,photo_path,result_path,color,image_secret,model,created_at) VALUES ('legacy','demo-customer','linen-shirt','completed','old-photo.jpg','old-result.jpg','white','secret','old-model','yesterday')")
        for column in ("size", "body_snapshot", "fit_snapshot", "photo_check", "views", "retry_count"):
            conn.execute(f"ALTER TABLE tryons DROP COLUMN {column}")
        conn.execute("ALTER TABLE products DROP COLUMN size_chart")
    db.initialize()
    with db.connect() as conn:
        assert conn.execute("SELECT name FROM products WHERE id='linen-shirt'").fetchone()[0] == "My custom name"
        assert json.loads(conn.execute("SELECT profile FROM body_profiles").fetchone()[0]) == PROFILE
        legacy = conn.execute("SELECT * FROM tryons WHERE id='legacy'").fetchone()
        assert legacy["result_path"] == "old-result.jpg" and legacy["views"] == "{}"
