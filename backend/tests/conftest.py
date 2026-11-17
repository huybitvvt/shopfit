import pytest


@pytest.fixture(autouse=True)
def isolate_database_environment(monkeypatch):
    # The developer's .env may point at a real Supabase project, S3 bucket, or
    # override angles/demo flags. Ordinary tests always run isolated on SQLite.
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("DATABASE_SCHEMA", "public")
    monkeypatch.setenv("TRYON_ANGLES", "front,left,back,right")
    monkeypatch.setenv("SEED_DEMO", "true")
    monkeypatch.setenv("CLOUDFLY_ENDPOINT_URL", "")
    monkeypatch.setenv("CLOUDFLY_ACCESS_KEY", "")
    monkeypatch.setenv("CLOUDFLY_SECRET_KEY", "")
    monkeypatch.setenv("RESEND_API_KEY", "")
    monkeypatch.setenv("BREVO_API_KEY", "")
    monkeypatch.setenv("SMTP_HOST", "")
