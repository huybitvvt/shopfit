import json
import sqlite3
import shutil
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import Settings
from .security import hash_password
from .seed import PRODUCTS
from .sizing import SizeChart, demo_chart


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, settings: Settings):
        self.path = settings.data_dir / "shopfit.sqlite3"
        self.settings = settings

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self):
        self.settings.data_dir.mkdir(parents=True, exist_ok=True)
        (self.settings.data_dir / "catalog").mkdir(exist_ok=True)
        (self.settings.data_dir / "private").mkdir(exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, tryon_category TEXT NOT NULL,
                    price INTEGER NOT NULL CHECK(price > 0), original_price INTEGER, image_url TEXT NOT NULL,
                    tag TEXT NOT NULL, material TEXT NOT NULL, description TEXT NOT NULL, colors TEXT NOT NULL,
                    sizes TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS variants (
                    product_id TEXT NOT NULL REFERENCES products(id), size TEXT NOT NULL, color TEXT NOT NULL,
                    stock INTEGER NOT NULL CHECK(stock >= 0), PRIMARY KEY (product_id, size, color)
                );
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), customer_name TEXT NOT NULL,
                    phone TEXT NOT NULL, address TEXT NOT NULL, note TEXT NOT NULL, total INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS order_items (
                    id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
                    product_id TEXT NOT NULL REFERENCES products(id), name TEXT NOT NULL, image_url TEXT NOT NULL,
                    size TEXT NOT NULL, color TEXT NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tryons (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL REFERENCES products(id),
                    status TEXT NOT NULL, photo_path TEXT NOT NULL, result_path TEXT, error TEXT, color TEXT NOT NULL,
                    image_secret TEXT NOT NULL, model TEXT NOT NULL, duration_ms INTEGER,
                    usage TEXT, created_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_tryons_user ON tryons(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
            """)
            # Additive migrations keep existing accounts, orders and generated photographs.
            product_columns = {r[1] for r in conn.execute("PRAGMA table_info(products)")}
            seed_charts = "size_chart" not in product_columns
            if seed_charts:
                conn.execute("ALTER TABLE products ADD COLUMN size_chart TEXT NOT NULL DEFAULT '{}'")
            order_columns = {r[1] for r in conn.execute("PRAGMA table_info(orders)")}
            for name in ("request_key", "request_fingerprint"):
                if name not in order_columns:
                    conn.execute(f"ALTER TABLE orders ADD COLUMN {name} TEXT")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_order_request ON orders(user_id,request_key) WHERE request_key IS NOT NULL")
            columns = {r[1] for r in conn.execute("PRAGMA table_info(tryons)")}
            for name, declaration in {
                "size": "TEXT", "body_snapshot": "TEXT", "fit_snapshot": "TEXT", "photo_check": "TEXT",
                "views": "TEXT NOT NULL DEFAULT '{}'", "retry_count": "INTEGER NOT NULL DEFAULT 0",
                "request_key": "TEXT", "request_fingerprint": "TEXT", "updated_at": "TEXT",
            }.items():
                if name not in columns:
                    conn.execute(f"ALTER TABLE tryons ADD COLUMN {name} {declaration}")
            conn.executescript("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_tryon_request ON tryons(user_id,request_key) WHERE request_key IS NOT NULL;
                CREATE TABLE IF NOT EXISTS body_profiles (
                    user_id TEXT PRIMARY KEY REFERENCES users(id), profile TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS photo_checks (
                    user_id TEXT NOT NULL REFERENCES users(id), digest TEXT NOT NULL, report TEXT NOT NULL,
                    expires_at INTEGER NOT NULL, PRIMARY KEY(user_id,digest)
                );
                CREATE TABLE IF NOT EXISTS tryon_evaluations (
                    job_id TEXT PRIMARY KEY REFERENCES tryons(id), actual_path TEXT NOT NULL,
                    identity_score INTEGER NOT NULL, garment_score INTEGER NOT NULL, fit_score INTEGER NOT NULL,
                    actual_fit TEXT NOT NULL, notes TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wardrobe (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
                    category TEXT NOT NULL, material TEXT NOT NULL, measurements TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS fit_reviews (
                    order_item_id INTEGER PRIMARY KEY REFERENCES order_items(id), user_id TEXT NOT NULL REFERENCES users(id),
                    actual_fit TEXT NOT NULL, notes TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS ai_calls (
                    id TEXT PRIMARY KEY, job_id TEXT, kind TEXT NOT NULL, angle TEXT, status TEXT NOT NULL,
                    estimated_usd REAL NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_ai_calls_date ON ai_calls(created_at);
                CREATE TABLE IF NOT EXISTS retry_requests (
                    user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
                    job_id TEXT NOT NULL REFERENCES tryons(id), PRIMARY KEY(user_id,request_key)
                );
            """)
            for p in PRODUCTS:
                bundled = Path(__file__).resolve().parents[1] / "assets" / f"{p['id']}.jpg"
                image_url = p["image_url"]
                if bundled.is_file():
                    destination = self.settings.data_dir / "catalog" / bundled.name
                    if not destination.exists():
                        shutil.copyfile(bundled, destination)
                    image_url = f"/media/{bundled.name}"
                conn.execute("""INSERT OR IGNORE INTO products
                    (id,name,category,tryon_category,price,original_price,image_url,tag,material,description,colors,sizes,featured,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                    p["id"], p["name"], p["category"], p["tryon_category"], p["price"], p["original_price"],
                    image_url, p["tag"], p["material"], p["description"], json.dumps(p["colors"]),
                    json.dumps(p["sizes"]), p["featured"], now(),
                ))
                # Upgrade only the untouched seed URL; keep shop-uploaded product images.
                if image_url != p["image_url"]:
                    conn.execute("UPDATE products SET image_url=? WHERE id=? AND image_url LIKE 'https://images.unsplash.com/%'", (image_url, p["id"]))
                if p["id"] == "tailored-blazer":
                    conn.execute("UPDATE products SET name=? WHERE id=? AND name='Blazer Modern Muse'", (p["name"], p["id"]))
                for size in p["sizes"]:
                    for color in p["colors"]:
                        conn.execute("INSERT OR IGNORE INTO variants VALUES (?,?,?,?)", (p["id"], size, color["name"], 12))
                if seed_charts:
                    conn.execute("UPDATE products SET size_chart=? WHERE id=?", (json.dumps(demo_chart(p)), p["id"]))
            if self.settings.seed_demo:
                for uid, name, email, password, role in [
                    ("demo-customer", "Minh Anh", "khach@shopfit.local", self.settings.customer_password, "customer"),
                    ("demo-admin", "ShopFit Studio", "shop@shopfit.local", self.settings.admin_password, "admin"),
                ]:
                    if not conn.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                        conn.execute("INSERT INTO users VALUES (?,?,?,?,?,?)", (uid, name, email, hash_password(password), role, now()))
            # The service recovers durable queued jobs and pauses uncertain paid calls after startup.

    def product(self, conn, row):
        p = dict(row)
        p["colors"] = json.loads(p["colors"])
        p["sizes"] = json.loads(p["sizes"])
        p["featured"] = bool(p["featured"])
        p["active"] = bool(p["active"])
        p["variants"] = [dict(v) for v in conn.execute("SELECT size,color,stock FROM variants WHERE product_id=?", (p["id"],))]
        p["stock"] = sum(v["stock"] for v in p["variants"])
        chart = json.loads(p["size_chart"])
        p["size_chart"] = SizeChart(rows=[]).model_dump() if not chart else chart
        return p
