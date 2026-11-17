import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
from psycopg import sql
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.ai_usage import AIUsage
from app.config import Settings
from app.db import Database, TABLES
from app.main import create_app
from app.migrate import migrate_sqlite
from test_api import TestAnalyzer, TestEngine, checkout_body, client, login, stock


@pytest.fixture
def pg_db(tmp_path):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for isolated PostgreSQL integration tests")
    schema = "shopfit_test_" + uuid.uuid4().hex
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    db = Database(Settings(data_dir=tmp_path / "pg", database_url=url, database_schema=schema,
                           gemini_api_key="", seed_demo=True))
    try:
        yield db
    finally:
        db.close()
        # Only the randomly named schema created by this fixture is removed.
        assert schema.startswith("shopfit_test_") and len(schema) == 45
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def test_invalid_database_url_fails_instead_of_falling_back_to_sqlite():
    with pytest.raises(ValueError, match="DATABASE_URL"):
        Settings(database_url="https://example.com")


def test_migration_requires_postgres_and_preserves_missing_source(tmp_path):
    db = Database(Settings(data_dir=tmp_path, database_url=""))
    with pytest.raises(ValueError, match="DATABASE_URL"):
        migrate_sqlite(tmp_path / "absent.sqlite3", db, tmp_path / "backups")
    assert not (tmp_path / "absent.sqlite3").exists()


def test_postgres_binding_rollback_and_rls(pg_db):
    pg_db.initialize()
    with pg_db.connect() as conn:
        row = conn.execute("SELECT ? AS flag, ? AS name WHERE ? LIKE 'shop%'", (True, "áo % ' tiếng Việt", "shopfit")).fetchone()
        assert row[0] == row["flag"] == 1
        assert row[1] == "áo % ' tiếng Việt"
        assert dict(row)["name"] == row[1]
        rls = conn.execute("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relkind='r'").fetchall()
        assert {r["relname"] for r in rls if r["relrowsecurity"]} == set(TABLES)
    with pytest.raises(psycopg.IntegrityError):
        with pg_db.connect() as conn:
            conn.execute("UPDATE products SET name=? WHERE id=?", ("Must roll back", "linen-shirt"))
            conn.execute("UPDATE variants SET stock=-1 WHERE product_id=?", ("linen-shirt",))
    with pg_db.connect() as conn:
        assert conn.execute("SELECT name FROM products WHERE id=?", ("linen-shirt",)).fetchone()[0] != "Must roll back"
        conn.connection.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO anon").format(sql.Identifier(pg_db.settings.database_schema)))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with pg_db.connect() as conn:
            conn.connection.execute("SET LOCAL ROLE anon")
            conn.execute("SELECT * FROM users")


def test_postgres_checkout_idempotency_upserts_and_cancel(pg_db):
    app = create_app(pg_db.settings, engine=TestEngine(), analyzer=TestAnalyzer())
    with TestClient(app) as api:
        headers = login(api)
        initial = stock(api)
        request_headers = {**headers, "X-Idempotency-Key": "postgres-order-idempotency"}
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: api.post("/api/orders", headers=request_headers, json=checkout_body()), range(2)))
        assert [r.status_code for r in responses] == [201, 201]
        assert responses[0].json()["id"] == responses[1].json()["id"]
        assert stock(api) == initial - 1
        order = responses[0].json()
        assert order["items"][0]["id"] > 0
        for _ in range(2):
            profile = api.patch("/api/body-profile", headers=headers, json={"height_cm": 175, "weight_kg": 70, "chest_cm": 94, "waist_cm": 80, "hip_cm": 96})
            assert profile.status_code == 200
        cancelled = api.patch(f"/api/orders/{order['id']}", headers=headers, json={"status": "cancelled"})
        assert cancelled.status_code == 200
        assert api.patch(f"/api/orders/{order['id']}", headers=headers, json={"status": "cancelled"}).status_code == 403
        assert stock(api) == initial
        admin = login(api, True)
        delivered = api.post("/api/orders", headers=headers, json=checkout_body()).json()
        for status in ("confirmed", "shipping", "completed"):
            assert api.patch(f"/api/orders/{delivered['id']}", headers=admin, json={"status": status}).status_code == 200
        for fit in ("tight", "fits"):
            review = api.post(f"/api/orders/{delivered['id']}/items/{delivered['items'][0]['id']}/fit-review",
                              headers=headers, json={"actual_fit": fit, "notes": "PostgreSQL upsert"})
            assert review.status_code == 200
            assert review.json()["actual_fit"] == fit
        assert api.get("/api/admin/fit-insights", headers=admin).status_code == 200


def test_postgres_ai_budget_serializes_concurrent_reservations(pg_db):
    pg_db.initialize()
    pg_db.settings.budget_usd = .15
    pg_db.settings.image_estimate_usd = .1
    usage = AIUsage(pg_db, pg_db.settings)

    def reserve(_):
        try:
            return usage.reserve("image")
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, range(2)))
    assert results.count(429) == 1
    assert usage.summary()["estimated_usd"] == .1


def test_postgres_migration_verifies_rows_and_refuses_repeat(pg_db, client, tmp_path):
    headers = login(client)
    order = client.post("/api/orders", headers=headers, json=checkout_body()).json()
    source = client.app.state.db.path
    result = migrate_sqlite(source, pg_db, tmp_path / "backups")
    assert result["rows"]["orders"] == result["rows"]["order_items"] == 1
    assert result["rows"]["users"] == 3
    assert source.exists()
    with pg_db.connect() as conn:
        assert conn.execute("SELECT total FROM orders WHERE id=?", (order["id"],)).fetchone()[0] == order["total"]
        inserted = conn.execute("""INSERT INTO order_items (order_id,product_id,name,image_url,size,color,quantity,price)
            SELECT order_id,product_id,name,image_url,size,color,quantity,price FROM order_items LIMIT 1 RETURNING id""").fetchone()[0]
        assert inserted > order["items"][0]["id"]
    with pytest.raises(ValueError, match="Destination contains data"):
        migrate_sqlite(source, pg_db, tmp_path / "backups")


def test_postgres_migration_rolls_back_on_verification_failure(pg_db, client, tmp_path, monkeypatch):
    # A partial copy must never survive failure in a later table.
    from app import migrate
    original_counter = migrate.Counter
    calls = 0

    def broken_counter(rows):
        nonlocal calls
        calls += 1
        return original_counter([("mismatch",)]) if calls == 4 else original_counter(rows)

    monkeypatch.setattr(migrate, "Counter", broken_counter)
    with pytest.raises(ValueError, match="verification failed"):
        migrate_sqlite(client.app.state.db.path, pg_db, tmp_path / "backups")
    with pg_db.connect() as conn:
        assert all(conn.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0] == 0 for table in TABLES)
