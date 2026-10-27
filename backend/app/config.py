import os
import math
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", str(ROOT / "data"))))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    image_model: str = field(default_factory=lambda: os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"))
    vision_model: str = field(default_factory=lambda: os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash"))
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

    def __post_init__(self):
        if any(not math.isfinite(v) or v <= 0 for v in (self.budget_usd, self.image_estimate_usd, self.vision_estimate_usd)):
            raise ValueError("AI budget and estimates must be finite positive amounts")
        if min(self.daily_limit, self.image_daily_limit, self.vision_daily_limit) < 0:
            raise ValueError("AI limits cannot be negative")
