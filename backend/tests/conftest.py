import pytest


@pytest.fixture(autouse=True)
def isolate_database_environment(monkeypatch):
    # The developer's .env may point at a real Supabase project. Ordinary tests
    # always use SQLite; PostgreSQL tests require TEST_DATABASE_URL explicitly.
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("DATABASE_SCHEMA", "public")
