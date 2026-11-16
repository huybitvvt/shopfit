import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.photo_checks import Inspection, PhotoAnalyzer
from test_api import TestAnalyzer, TestEngine, create_tryon, login, photo_bytes, wait_job
from test_fitting import CLEAR_INSPECTION


def test_three_views_start_together_only_after_front_is_approved(tmp_path):
    engine, analyzer = TestEngine(), TestAnalyzer()
    approved = threading.Event()
    barrier = threading.Barrier(3)
    seen = []
    approved_front = []

    def validate_front(*args):
        approved_front.append(args[1])
        approved.set()
        return {"accepted": True, "checks": {}}

    def generate_view(photo, garment, front, angle, *args):
        assert approved.is_set()
        assert front == approved_front[0]
        seen.append(angle)
        barrier.wait(timeout=3)  # Sequential rendering cannot pass this barrier.
        return photo_bytes(), {}

    analyzer.validate_front = validate_front
    engine.generate_view = generate_view
    app = create_app(Settings(data_dir=tmp_path, database_url="", view_concurrency=3), engine=engine, analyzer=analyzer)
    with TestClient(app) as api:
        headers = login(api)
        job = wait_job(api, headers, create_tryon(api, headers).json()["id"])
        assert job["status"] == "completed"
        assert sorted(seen) == ["back", "left", "right"]
        assert [v["angle"] for v in job["views"]] == ["front", "left", "back", "right"]
        assert all(v["status"] == "completed" and v["url"] for v in job["views"])
        with app.state.db.connect() as conn:
            assert conn.execute("SELECT count(*) FROM ai_calls WHERE kind='image'").fetchone()[0] == 4


def test_parallel_jobs_respect_the_global_image_concurrency_limit(tmp_path):
    engine = TestEngine()
    lock = threading.Lock()
    active = peak = 0

    def generate(*args):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        try:
            time.sleep(.05)
            return photo_bytes(), {}
        finally:
            with lock:
                active -= 1

    engine.generate = engine.generate_view = generate
    app = create_app(Settings(data_dir=tmp_path, database_url="", view_concurrency=3), engine=engine, analyzer=TestAnalyzer())
    with TestClient(app) as api:
        headers = login(api)
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: create_tryon(api, headers), range(2)))
        assert all(r.status_code == 202 for r in responses)
        assert all(wait_job(api, headers, r.json()["id"])["status"] == "completed" for r in responses)
        assert 2 <= peak <= 3
        with app.state.db.connect() as conn:
            assert conn.execute("SELECT count(*) FROM ai_calls WHERE kind='image'").fetchone()[0] == 8


def test_vision_reuses_connection_and_disables_thinking_for_each_check(monkeypatch, tmp_path):
    from google import genai

    configs, clients, closed = [], [], []

    def generate_content(**kwargs):
        config = kwargs["config"]
        configs.append(config)
        data = CLEAR_INSPECTION if config.response_schema is Inspection else {
            field: True for field in config.response_schema.model_fields
        }
        return SimpleNamespace(text=json.dumps(data))

    def create_client(**kwargs):
        client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content), close=lambda: closed.append(True))
        clients.append(client)
        assert kwargs["http_options"].retry_options.attempts == 1
        return client

    monkeypatch.setattr(genai, "Client", create_client)
    analyzer = PhotoAnalyzer(None, Settings(data_dir=tmp_path, gemini_api_key="test-only", vision_thinking_budget=0))
    try:
        analyzer.inspect(photo_bytes())
        analyzer.inspect(photo_bytes())
        assert analyzer.validate_front(photo_bytes(), photo_bytes(), photo_bytes(), "tops", "Trắng")["accepted"]
        assert analyzer.validate_view(photo_bytes(), photo_bytes(), "left")["accepted"]
        assert len(clients) == 1
        assert all(config.thinking_config.thinking_budget == 0 for config in configs)
    finally:
        analyzer.close()
    assert len(closed) == 1
