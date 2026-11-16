import os
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", str(ROOT / "data"))))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "").strip())
    database_schema: str = field(default_factory=lambda: os.getenv("DATABASE_SCHEMA", "public"))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    image_model: str = field(default_factory=lambda: os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-lite-image"))
    vision_model: str = field(default_factory=lambda: os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash"))
    image_size: str = field(default_factory=lambda: os.getenv("GEMINI_IMAGE_SIZE", "1K"))
    view_concurrency: int = field(default_factory=lambda: int(os.getenv("TRYON_VIEW_CONCURRENCY", "3")))
    tryon_angles: tuple[str, ...] = field(default_factory=lambda: tuple(x.strip() for x in os.getenv("TRYON_ANGLES", "front").split(",") if x.strip()))
    vision_thinking_budget: int = field(default_factory=lambda: int(os.getenv("GEMINI_VISION_THINKING_BUDGET", "0")))
    seed_demo: bool = field(default_factory=lambda: os.getenv("SEED_DEMO", "true").lower() == "true")
    customer_password: str = field(default_factory=lambda: os.getenv("DEMO_CUSTOMER_PASSWORD", "Shopfit123!"))
    admin_password: str = field(default_factory=lambda: os.getenv("DEMO_ADMIN_PASSWORD", "ShopfitAdmin123!"))
    daily_limit: int = field(default_factory=lambda: int(os.getenv("TRYON_DAILY_LIMIT", "30")))
    image_daily_limit: int = field(default_factory=lambda: int(os.getenv("AI_IMAGE_DAILY_LIMIT", "120")))
    vision_daily_limit: int = field(default_factory=lambda: int(os.getenv("AI_VISION_DAILY_LIMIT", "300")))
    budget_usd: float = field(default_factory=lambda: float(os.getenv("AI_DAILY_BUDGET_USD", "15")))
    image_estimate_usd: float = field(default_factory=lambda: float(os.getenv("AI_IMAGE_ESTIMATE_USD", "0.10")))
    vision_estimate_usd: float = field(default_factory=lambda: float(os.getenv("AI_VISION_ESTIMATE_USD", "0.002")))
    cors_origins: list[str] = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "http://localhost:8081,http://localhost:8082").split(","))
    cloudfly_endpoint_url: str = field(default_factory=lambda: os.getenv("CLOUDFLY_ENDPOINT_URL", "").strip())
    cloudfly_access_key: str = field(default_factory=lambda: os.getenv("CLOUDFLY_ACCESS_KEY", "").strip())
    cloudfly_secret_key: str = field(default_factory=lambda: os.getenv("CLOUDFLY_SECRET_KEY", "").strip())
    cloudfly_bucket: str = field(default_factory=lambda: os.getenv("CLOUDFLY_BUCKET_NAME", "shopfit").strip())
    cloudfly_region: str = field(default_factory=lambda: os.getenv("CLOUDFLY_REGION", "us-east-1").strip())
    cloudfly_public_url: str = field(default_factory=lambda: os.getenv("CLOUDFLY_PUBLIC_URL", "").strip())

    def __post_init__(self):
        if self.image_size not in {"512", "1K"}:
            raise ValueError("GEMINI_IMAGE_SIZE must be 512 or 1K")
        if self.image_size == "512" and not self.image_model.startswith("gemini-3.1-flash-image"):
            raise ValueError("512 output requires Gemini 3.1 Flash Image")
        if not 1 <= self.view_concurrency <= 3:
            raise ValueError("TRYON_VIEW_CONCURRENCY must be between 1 and 3")
        valid_angles = {"front", "left", "back", "right"}
        if not self.tryon_angles or not set(self.tryon_angles).issubset(valid_angles) or "front" not in self.tryon_angles:
            raise ValueError("TRYON_ANGLES must contain 'front' and be a subset of front,left,back,right")
        if not -1 <= self.vision_thinking_budget <= 24576:
            raise ValueError("GEMINI_VISION_THINKING_BUDGET must be -1 to 24576")
        if self.database_url and not self.database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", self.database_schema):
            raise ValueError("DATABASE_SCHEMA must be a lowercase SQL identifier")
        if any(not math.isfinite(v) or v <= 0 for v in (self.budget_usd, self.image_estimate_usd, self.vision_estimate_usd)):
            raise ValueError("AI budget and estimates must be finite positive amounts")
        if min(self.daily_limit, self.image_daily_limit, self.vision_daily_limit) < 0:
            raise ValueError("AI limits cannot be negative")
