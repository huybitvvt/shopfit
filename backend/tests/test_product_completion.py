import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.ai_usage import AIUsage
from app.config import Settings
from app.db import Database, now
from app.main import create_app
from test_api import TestAnalyzer, TestEngine, checkout_body, client, create_tryon, login, photo_bytes, stock, wait_job

PROFILE = {"height_cm": 175, "weight_kg": 70, "chest_cm": 94, "waist_cm": 80, "hip_cm": 96, "fit_preference": "regular"}


def test_fit_regions_explain_thresholds_and_keep_unavailable_sizes_visible(client):
    customer = login(client)
    client.patch('/api/body-profile', headers=customer, json=PROFILE)
    advice = client.post('/api/products/linen-shirt/size-advice', headers=customer, json={"color": "Trắng"}).json()
    assert advice['regions']['S'][0]['region'] == 'below_target'
    assert advice['regions']['L'][0]['region'] == 'target'
    assert advice['regions']['XL'][0]['region'] == 'above_target'
    admin = login(client, True)
    client.patch('/api/admin/products/linen-shirt', headers=admin, json={"variants": [{"size": "XL", "color": "Trắng", "stock": 0}]})
    advice = client.post('/api/products/linen-shirt/size-advice', headers=customer, json={"color": "Trắng"}).json()
    assert 'XL' in advice['regions'] and not any(c['size'] == 'XL' for c in advice['candidates'])


def test_wardrobe_is_private_compares_actual_differences_and_works_without_body(client):
    customer, admin = login(client), login(client, True)
    payload = {"name": "My comfortable shirt", "category": "tops", "material": "Cotton", "measurements": {"size": "REF", "chest_cm": 104, "length_cm": 68}}
    response = client.post('/api/wardrobe', headers=customer, json=payload)
    assert response.status_code == 201
    reference = response.json()
    assert 'user_id' not in reference
    assert client.get('/api/wardrobe', headers=admin).json() == []
    path = '/api/products/linen-shirt/size-advice'
    advice = client.post(path, headers=customer, json={"color": "Trắng", "reference_id": reference['id']}).json()
    assert advice['status'] == 'needs_profile'
    comparison = next(r for r in advice['comparison']['rows'] if r['size'] == 'L')
    assert comparison['checks'][0]['difference_cm'] == 0
    assert next(c for c in comparison['checks'] if c['key'] == 'length_cm')['difference_cm'] == 2
    assert client.post(path, headers=admin, json={"color": "Trắng", "reference_id": reference['id']}).status_code == 404
    assert client.delete(f"/api/wardrobe/{reference['id']}", headers=admin).status_code == 404
    assert client.delete(f"/api/wardrobe/{reference['id']}", headers=customer).status_code == 204
    assert client.post('/api/wardrobe', headers=customer, json={**payload, 'measurements': {'size': 'REF'}}).status_code == 422


def test_purchase_feedback_requires_delivered_owner_and_update_does_not_inflate_counts(client):
    customer, admin = login(client), login(client, True)
    order = client.post('/api/orders', headers=customer, json=checkout_body()).json()
    item_id = order['items'][0]['id']
    path = f"/api/orders/{order['id']}/items/{item_id}/fit-review"
    assert client.post(path, headers=customer, json={'actual_fit': 'tight'}).status_code == 409
    assert client.post(path, headers=admin, json={'actual_fit': 'tight'}).status_code == 404
    for status in ('confirmed', 'shipping', 'completed'):
        assert client.patch(f"/api/orders/{order['id']}", headers=admin, json={'status': status}).status_code == 200
    assert client.post(path, headers=customer, json={'actual_fit': 'tight', 'notes': 'private to shop'}).status_code == 200
    assert client.post(path, headers=customer, json={'actual_fit': 'fits'}).status_code == 200
    data = client.get('/api/products/linen-shirt/fit-feedback').json()
    assert len(data['rows']) == 1
    assert data['rows'][0]['total'] == 1 and data['rows'][0]['fits'] == 1
    assert data['rows'][0]['enough_data'] is False
    assert 'private to shop' not in json.dumps(data)
    insights = client.get('/api/admin/fit-insights', headers=admin).json()
    assert insights['review_count'] == 1
    assert len(insights['recent_reviews']) == 1
    assert 'user_id' not in insights['recent_reviews'][0]
    assert client.get('/api/admin/fit-insights', headers=customer).status_code == 403


def test_three_purchase_feedbacks_raise_review_flag_without_changing_size_chart(client):
    customer, admin = login(client), login(client, True)
    old_chart = client.get('/api/products/linen-shirt').json()['size_chart']
    for actual_fit in ('tight', 'tight', 'fits'):
        order = client.post('/api/orders', headers=customer, json=checkout_body()).json()
        for status in ('confirmed', 'shipping', 'completed'):
            client.patch(f"/api/orders/{order['id']}", headers=admin, json={'status': status})
        client.post(f"/api/orders/{order['id']}/items/{order['items'][0]['id']}/fit-review", headers=customer, json={'actual_fit': actual_fit})
    row = client.get('/api/admin/fit-insights', headers=admin).json()['rows'][0]
    assert row['total'] == 3 and row['needs_review'] and row['enough_data']
    assert client.get('/api/products/linen-shirt').json()['size_chart'] == old_chart


def test_checkout_request_key_prevents_double_stock_deduction(client):
    customer = {**login(client), 'X-Idempotency-Key': 'checkout-network-retry-key'}
    first = client.post('/api/orders', headers=customer, json=checkout_body())
    second = client.post('/api/orders', headers=customer, json=checkout_body())
    assert first.status_code == second.status_code == 201
    assert first.json()['id'] == second.json()['id'] and stock(client) == 11
    assert client.post('/api/orders', headers=customer, json=checkout_body(2)).status_code == 409


def test_tryon_request_reuse_never_rechecks_or_generates_new_images(client):
    customer = login(client)
    client.patch('/api/body-profile', headers=customer, json=PROFILE)
    headers = {**customer, 'X-Idempotency-Key': 'tryon-network-retry-key'}
    def post(size='M'):
        return client.post('/api/tryons', headers=headers, data={'product_id': 'linen-shirt', 'color': 'Trắng', 'size': size}, files={'photo': ('photo.jpg', photo_bytes(), 'image/jpeg')})
    first = post()
    assert first.status_code == 202
    job = wait_job(client, customer, first.json()['id'])
    client.app.state.photo_analyzer.check = lambda *a: (_ for _ in ()).throw(AssertionError('must reuse'))
    assert post().json()['id'] == job['id']
    assert post('L').status_code == 409
    with client.app.state.db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM tryons").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM ai_calls WHERE kind='image'").fetchone()[0] == 4
    assert client.delete(f"/api/tryons/{job['id']}", headers=customer).status_code == 204
    assert post().status_code == 410


def test_concurrent_identical_tryon_requests_create_one_durable_job(client, monkeypatch):
    service = client.app.state.tryon
    monkeypatch.setattr(service, '_dispatch', lambda: None)
    product = client.get('/api/products/linen-shirt').json()
    def start(_):
        return service.start('demo-customer', product, 'Trắng', photo_bytes(), 'M', PROFILE, {'accepted': True}, 'concurrent-durable-key')
    with ThreadPoolExecutor(2) as pool:
        ids = list(pool.map(start, range(2)))
    assert ids[0] == ids[1]
    with service.db.connect() as conn:
        assert conn.execute('SELECT count(*) FROM tryons').fetchone()[0] == 1


def test_retry_request_key_only_counts_one_retry(client):
    customer = login(client)
    client.app.state.photo_analyzer.validate_view = lambda *a: {'accepted': False, 'checks': {}}
    job = wait_job(client, customer, create_tryon(client, customer).json()['id'])
    headers = {**customer, 'X-Idempotency-Key': 'retry-network-retry-key'}
    path = f"/api/tryons/{job['id']}/retry"
    assert client.post(path, headers=headers).status_code == 202
    wait_job(client, customer, job['id'])
    assert client.post(path, headers=headers).json()['retry_count'] == 1


def test_validation_failure_keeps_candidate_and_retry_does_not_regenerate(client):
    customer = login(client)
    original = client.app.state.photo_analyzer.validate_view
    def validate(front, candidate, angle):
        if angle == 'left':
            raise RuntimeError('temporary validation error')
        return original(front, candidate, angle)
    client.app.state.photo_analyzer.validate_view = validate
    job = wait_job(client, customer, create_tryon(client, customer).json()['id'])
    assert job['status'] == 'partial' and next(v for v in job['views'] if v['angle'] == 'left')['url'] is None
    client.app.state.photo_analyzer.validate_view = original
    assert client.post(f"/api/tryons/{job['id']}/retry", headers=customer).status_code == 202
    assert wait_job(client, customer, job['id'])['status'] == 'completed'
    with client.app.state.db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM ai_calls WHERE kind='image'").fetchone()[0] == 4


def test_budget_reservations_atomic_and_failed_attempt_is_not_refunded(tmp_path):
    settings = Settings(data_dir=tmp_path, budget_usd=.15, image_estimate_usd=.1)
    db = Database(settings); db.initialize()
    usage = AIUsage(db, settings)
    def reserve(_):
        try: return usage.reserve('image')
        except HTTPException as e: return e.status_code
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(reserve, range(2)))
    assert sum(isinstance(r, str) for r in results) == 1 and 429 in results
    usage.finish(next(r for r in results if isinstance(r, str)), 'failed')
    with pytest.raises(HTTPException): usage.reserve('image')
    assert usage.summary()['estimated_usd'] == .1


def test_rejected_front_does_not_start_three_dependent_image_calls(client):
    customer = login(client)
    client.app.state.photo_analyzer.validate_front = lambda *a: {'accepted': False, 'checks': {'full_body_visible': False}}
    job = wait_job(client, customer, create_tryon(client, customer).json()['id'])
    assert job['status'] == 'failed'
    assert all(v['url'] is None for v in job['views'])
    with client.app.state.db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM ai_calls WHERE kind='image'").fetchone()[0] == 1


@pytest.mark.parametrize('phase', ['queued', 'processing', 'validating'])
def test_restart_recovers_safe_work_and_does_not_repeat_uncertain_generation(tmp_path, phase):
    settings = Settings(data_dir=tmp_path, gemini_api_key='')
    app = create_app(settings, engine=TestEngine(), analyzer=TestAnalyzer())
    with TestClient(app) as first:
        app.state.tryon._dispatch = lambda: None
        customer = login(first)
        created = create_tryon(first, customer).json()
        job_id = created['id']
        views = {a: {'status': 'pending'} for a in ('front', 'left', 'back', 'right')}
        with app.state.db.connect() as conn:
            if phase == 'processing':
                views['front'] = {'status': 'processing'}
                conn.execute("INSERT INTO ai_calls VALUES ('uncertain',?,'image','front','started',0.1,?,NULL)", (job_id, now()))
            elif phase == 'validating':
                for angle in views:
                    path = tmp_path / 'private' / f'{job_id}-{angle}.jpg'
                    path.write_bytes(photo_bytes())
                    views[angle] = {'status': 'completed', 'path': str(path)}
                views['left'] = {'status': 'validating', 'candidate_path': str(tmp_path / 'private' / f'{job_id}-left.jpg')}
            conn.execute('UPDATE tryons SET status=?,views=? WHERE id=?', ('queued' if phase == 'queued' else 'processing', json.dumps(views), job_id))
    engine = TestEngine()
    if phase != 'queued':
        engine.generate = lambda *a: (_ for _ in ()).throw(AssertionError('no repeated paid request'))
        engine.generate_view = engine.generate
    recovered = create_app(settings, engine=engine, analyzer=TestAnalyzer())
    with TestClient(recovered) as second:
        customer = login(second)
        job = wait_job(second, customer, job_id)
        assert job['status'] == ('failed' if phase == 'processing' else 'completed')
        with recovered.state.db.connect() as conn:
            if phase == 'processing':
                assert conn.execute("SELECT status FROM ai_calls WHERE id='uncertain'").fetchone()[0] == 'unknown'
            if phase == 'validating':
                assert conn.execute("SELECT count(*) FROM ai_calls WHERE kind='image'").fetchone()[0] == 0
