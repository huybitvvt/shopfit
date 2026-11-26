import hmac
import hashlib
import json
import re
import secrets
import threading
import time
import urllib.parse
import uuid
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .db import Database, INTEGRITY_ERRORS, now
from .security import hash_password, otp_digest, token_hash, verify_password
from .tryon import MAX_UPLOAD, TryOnService, normalize_image
from .photo_checks import PhotoAnalyzer
from .fitting_routes import fitting_routes
from .sizing import demo_chart
from .insights import insight_routes
from .ai_usage import AIUsage
from .storage import StorageManager
from .legal import render_privacy_page, render_terms_page, render_delete_page
from .mailer import send_otp_email
from .notifier import send_push_notification


class Login(BaseModel):
    email: str = Field(min_length=2, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value) and not re.fullmatch(r"[a-z0-9_.-]{2,50}", value):
            raise ValueError("Email hoặc tên tài khoản không hợp lệ")
        return value


class Register(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email không hợp lệ")
        return value


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email không hợp lệ")
        return value


class VerifyOtpRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    otp: str = Field(min_length=4, max_length=10)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email không hợp lệ")
        return value


class ResetPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    otp: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email không hợp lệ")
        return value


class ReportRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=150)
    details: str = Field(default="", max_length=1000)


class PushTokenRequest(BaseModel):
    push_token: str = Field(min_length=10, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class ProfilePatchRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class CreatePaymentOrder(BaseModel):
    package_id: str = Field(min_length=2, max_length=50)


class CartItem(BaseModel):
    product_id: str
    size: str
    color: str
    quantity: int = Field(ge=1, le=20)


class Checkout(BaseModel):
    customer_name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=r"^\+?[0-9\s.-]{9,16}$")
    address: str = Field(min_length=10, max_length=400)
    note: str = Field(default="", max_length=500)
    voucher_code: str | None = Field(default=None, max_length=40)
    payment_method: Literal["cod", "vietqr"] = "cod"
    items: list[CartItem] = Field(min_length=1, max_length=30)

    @field_validator("phone")
    @classmethod
    def valid_digits(cls, value: str):
        digits = "".join(ch for ch in value if ch.isdigit())
        if not 9 <= len(digits) <= 13:
            raise ValueError("Số điện thoại không hợp lệ")
        return value.strip()


class Color(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    hex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class VariantStock(BaseModel):
    size: str
    color: str
    stock: int = Field(ge=0, le=10000)


class ProductWrite(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    category: str = Field(min_length=1, max_length=50)
    tryon_category: Literal["tops", "bottoms", "one-pieces"] = "tops"
    price: int = Field(gt=0, le=100_000_000)
    original_price: int | None = Field(default=None, gt=0, le=100_000_000)
    image_url: str = Field(max_length=500)
    tag: str = Field(default="MỚI", max_length=30)
    material: str = Field(default="Cotton", max_length=100)
    description: str = Field(min_length=10, max_length=2000)
    colors: list[Color] = Field(min_length=1, max_length=10)
    sizes: list[str] = Field(min_length=1, max_length=10)
    stock_per_variant: int = Field(default=10, ge=0, le=10000)
    variant_stocks: list[VariantStock] | None = None
    back_image_url: str | None = None
    detail_image_url: str | None = None
    featured: bool = False

    @field_validator("back_image_url", "detail_image_url")
    @classmethod
    def extra_image(cls, value):
        if value is not None and not re.fullmatch(r"/media/[a-f0-9]{32}\.jpg", value):
            raise ValueError("Ảnh phụ không hợp lệ")
        return value

    @field_validator("image_url")
    @classmethod
    def uploaded_image(cls, value):
        if not re.fullmatch(r"/media/[a-f0-9]{32}\.jpg", value):
            raise ValueError("Vui lòng tải ảnh sản phẩm lên ShopFit")
        return value

    @field_validator("sizes")
    @classmethod
    def unique_sizes(cls, sizes):
        if len(set(sizes)) != len(sizes) or any(not s.strip() or len(s) > 10 for s in sizes):
            raise ValueError("Size không hợp lệ")
        return sizes

    @field_validator("colors")
    @classmethod
    def unique_colors(cls, colors):
        if len({c.name for c in colors}) != len(colors):
            raise ValueError("Màu không được trùng")
        return colors


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    price: int | None = Field(default=None, gt=0, le=100_000_000)
    original_price: int | None = Field(default=None, ge=0, le=100_000_000)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    tryon_category: Literal["tops", "bottoms", "one-pieces"] | None = None
    material: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, min_length=10, max_length=2000)
    tag: str | None = Field(default=None, max_length=30)
    image_url: str | None = Field(default=None, max_length=500)
    colors: list[Color] | None = Field(default=None, min_length=1, max_length=10)
    sizes: list[str] | None = Field(default=None, min_length=1, max_length=10)
    active: bool | None = None
    featured: bool | None = None
    variants: list[VariantStock] | None = None
    back_image_url: str | None = None
    detail_image_url: str | None = None

    @field_validator("image_url")
    @classmethod
    def check_main_image(cls, value):
        if value is not None and not re.fullmatch(r"/media/[a-zA-Z0-9_-]+\.jpg", value):
            raise ValueError("Ảnh đại diện sản phẩm không hợp lệ")
        return value

    @field_validator("back_image_url", "detail_image_url")
    @classmethod
    def check_extra_image(cls, value):
        if value is not None and value != "" and not re.fullmatch(r"/media/[a-zA-Z0-9_-]+\.jpg", value):
            raise ValueError("Ảnh phụ không hợp lệ")
        return value

    @field_validator("sizes")
    @classmethod
    def check_unique_sizes(cls, sizes):
        if sizes is not None and (len(set(sizes)) != len(sizes) or any(not s.strip() or len(s) > 10 for s in sizes)):
            raise ValueError("Size không hợp lệ")
        return sizes

    @field_validator("colors")
    @classmethod
    def check_unique_colors(cls, colors):
        if colors is not None and len({c.name for c in colors}) != len(colors):
            raise ValueError("Màu không được trùng")
        return colors


class StatusPatch(BaseModel):
    status: Literal["confirmed", "shipping", "completed", "cancelled"]


VIP_TIERS = {
    "bronze": {
        "name": "Hạng Đồng",
        "daily_limit": 1,
        "discount_percent": 0,
        "min_spent": 0,
        "next_tier": "silver",
        "next_spent": 1_000_000,
    },
    "silver": {
        "name": "Hạng Bạc",
        "daily_limit": 3,
        "discount_percent": 5,
        "min_spent": 1_000_000,
        "next_tier": "gold",
        "next_spent": 3_000_000,
    },
    "gold": {
        "name": "Hạng Vàng",
        "daily_limit": 6,
        "discount_percent": 10,
        "min_spent": 3_000_000,
        "next_tier": "diamond",
        "next_spent": 5_000_000,
    },
    "diamond": {
        "name": "Hạng Kim Cương",
        "daily_limit": 20,
        "discount_percent": 15,
        "min_spent": 5_000_000,
        "next_tier": None,
        "next_spent": None,
    },
}


def calculate_tier(total_spent: int) -> str:
    if total_spent >= 5_000_000:
        return "diamond"
    if total_spent >= 3_000_000:
        return "gold"
    if total_spent >= 1_000_000:
        return "silver"
    return "bronze"


PAYMENT_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_payment_code(prefix: str) -> str:
    return prefix + "".join(secrets.choice(PAYMENT_CODE_CHARS) for _ in range(6))


def build_sepay_qr_url(settings: Settings, amount: int, description: str) -> str:
    params = urllib.parse.urlencode({
        "acc": settings.bank_account,
        "bank": settings.bank_id,
        "amount": int(amount),
        "des": description,
        "template": settings.sepay_qr_template or "compact",
    })
    return f"https://qr.sepay.vn/img?{params}"


def normalize_account_number(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def complete_payment_transaction(
    conn,
    trans_row,
    settings: Settings,
    *,
    sepay_tx_id: str | None = None,
    reference_code: str | None = None,
    gateway: str | None = None,
    paid_amount: int | None = None,
):
    if trans_row["status"] == "completed":
        return {"status": "completed", "tryons": trans_row["tryons"]}

    trans_id = trans_row["id"]
    user_id = trans_row["user_id"]
    tryons = trans_row["tryons"]
    amount = trans_row["amount"]
    package_id = trans_row["package_id"]

    conn.execute(
        """UPDATE payment_transactions
           SET status='completed',
               completed_at=?,
               sepay_tx_id=COALESCE(?, sepay_tx_id),
               reference_code=COALESCE(?, reference_code),
               gateway=COALESCE(?, gateway),
               paid_amount=COALESCE(?, paid_amount)
           WHERE id=?""",
        (now(), sepay_tx_id, reference_code, gateway, paid_amount if paid_amount is not None else amount, trans_id),
    )
    if user_id:
        conn.execute(
            "UPDATE users SET starter_tryons_left = COALESCE(starter_tryons_left, 0) + ?, total_spent = COALESCE(total_spent, 0) + ? WHERE id=?",
            (tryons, amount, user_id),
        )

        u_row = conn.execute("SELECT total_spent, push_token FROM users WHERE id=?", (user_id,)).fetchone()
        if u_row:
            new_spent = u_row["total_spent"] or 0
            new_tier = calculate_tier(new_spent)
            conn.execute("UPDATE users SET vip_tier=? WHERE id=?", (new_tier, user_id))

            if u_row["push_token"]:
                try:
                    send_push_notification(
                        u_row["push_token"],
                        "Nạp lượt thử thành công! 🎉",
                        f"Tài khoản của bạn đã được cộng thêm {tryons} lượt thử đồ AI ShopFit. Bắt đầu phối đồ ngay nhé!",
                        {"type": "payment_completed", "transaction_id": trans_id},
                    )
                except Exception:
                    pass

        pkg = conn.execute("SELECT voucher_value FROM token_packages WHERE id=?", (package_id,)).fetchone()
        if pkg and pkg["voucher_value"] > 0:
            v_code = f"FIT{secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}{secrets.randbelow(9000)+1000}"
            conn.execute(
                """INSERT INTO user_vouchers (id, user_id, code, discount_amount, min_order, used, created_at, expires_at)
                   VALUES (?, ?, ?, ?, 100000, 0, ?, ?)""",
                (uuid.uuid4().hex, user_id, v_code, pkg["voucher_value"], now(), "2099-12-31T23:59:59"),
            )

    return {"status": "completed", "tryons": tryons}


def mark_order_paid(conn, order_row, *, sepay_tx_id: str | None = None) -> str | None:
    order_dict = dict(order_row)
    if order_dict.get("payment_status") == "paid":
        return None
    next_status = "confirmed" if order_dict["status"] == "pending" else order_dict["status"]
    conn.execute(
        """UPDATE orders
           SET payment_status='paid',
               paid_at=?,
               sepay_tx_id=COALESCE(?, sepay_tx_id),
               status=?
           WHERE id=?""",
        (now(), sepay_tx_id, next_status, order_dict["id"]),
    )
    if order_dict.get("user_id"):
        u_push = conn.execute("SELECT push_token FROM users WHERE id=?", (order_dict["user_id"],)).fetchone()
        if u_push and u_push["push_token"]:
            return u_push["push_token"]
    return None


def create_app(settings: Settings | None = None, engine=None, analyzer=None):
    settings = settings or Settings()
    db = Database(settings)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "catalog").mkdir(exist_ok=True)
    storage = StorageManager(settings)
    usage = AIUsage(db, settings)
    analyzer = analyzer or PhotoAnalyzer(db, settings, usage)
    service = TryOnService(db, settings, engine, analyzer, usage, storage=storage)

    @asynccontextmanager
    async def lifespan(app):
        try:
            db.initialize()
            assets_dir = Path(__file__).resolve().parents[1] / "assets"
            if assets_dir.is_dir():
                for asset in assets_dir.glob("*.jpg"):
                    storage.put_catalog(asset.name, asset.read_bytes())
            service.recover()
            yield
        finally:
            service.close()
            db.close()

    app = FastAPI(title="ShopFit API", version="0.2.0", lifespan=lifespan)
    app.state.db = db
    app.state.storage = storage
    app.state.tryon = service
    app.state.photo_analyzer = analyzer
    rate_buckets: dict[str, list[float]] = {}
    rate_lock = threading.Lock()
    app.state.rate_buckets = rate_buckets
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Idempotency-Key", "X-Webhook-Secret"],
    )

    def check_rate_limit(key: str, limit: int, window_sec: int, message: str = "Thao tác quá nhanh. Vui lòng thử lại sau ít phút."):
        now_ts = time.time()
        with rate_lock:
            hits = [t for t in rate_buckets.get(key, []) if now_ts - t < window_sec]
            if len(hits) >= limit:
                rate_buckets[key] = hits
                raise HTTPException(429, message)
            hits.append(now_ts)
            rate_buckets[key] = hits

    @app.get("/media/{filename}")
    def get_media(filename: str):
        if not re.fullmatch(r"[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)", filename):
            raise HTTPException(404, "Không tìm thấy file ảnh.")
        catalog_root = (settings.data_dir / "catalog").resolve()
        path = (catalog_root / filename).resolve()
        if path.parent != catalog_root:
            raise HTTPException(404, "Không tìm thấy file ảnh.")
        if not path.is_file():
            storage.get_catalog(filename)
        if not path.is_file():
            raise HTTPException(404, "Không tìm thấy file ảnh.")
        return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})

    def current_user(authorization: Annotated[str | None, Header()] = None):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Vui lòng đăng nhập để tiếp tục.")
        with db.connect() as conn:
            row = conn.execute("""SELECT u.id,u.name,u.email,u.role,
                                         COALESCE(u.vip_tier, 'bronze') as vip_tier,
                                         COALESCE(u.starter_tryons_left, 3) as starter_tryons_left,
                                         COALESCE(u.total_spent, 0) as total_spent,
                                         u.push_token
                                  FROM users u JOIN sessions s ON s.user_id=u.id
                                  WHERE s.token_hash=? AND s.expires_at>?""", (token_hash(authorization[7:]), int(time.time()))).fetchone()
        if not row:
            raise HTTPException(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
        return dict(row)

    def admin(user=Depends(current_user)):
        if user["role"] != "admin":
            raise HTTPException(403, "Chỉ chủ shop được thực hiện thao tác này.")
        return user

    def issue_session(conn, user):
        u_dict = dict(user)
        token = secrets.token_urlsafe(48)
        conn.execute("INSERT INTO sessions VALUES (?,?,?)", (token_hash(token), user["id"], int(time.time()) + 7 * 86400))
        return {
            "token": token,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
                "vip_tier": u_dict.get("vip_tier", "bronze") or "bronze",
                "starter_tryons_left": u_dict.get("starter_tryons_left", 3) if u_dict.get("starter_tryons_left") is not None else 3,
                "total_spent": u_dict.get("total_spent", 0) or 0,
            }
        }

    @app.api_route("/", methods=["GET", "HEAD"])
    def root():
        return {"name": "ShopFit API", "status": "running"}

    @app.get("/privacy", response_class=HTMLResponse)
    def privacy_policy():
        return render_privacy_page()

    @app.get("/terms", response_class=HTMLResponse)
    def terms_of_service():
        return render_terms_page()

    @app.get("/delete-account", response_class=HTMLResponse)
    def delete_account_info():
        return render_delete_page()

    @app.api_route("/api/health", methods=["GET", "HEAD"])
    def health():
        with db.connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ok", "database": "postgresql" if db.postgres else "sqlite",
                "ai_ready": service.engine.enabled, "engine": "openvto", "model": settings.image_model,
                "tryon_angles": list(settings.tryon_angles), "demo_accounts": settings.seed_demo}

    @app.post("/api/auth/register", status_code=201)
    def register(body: Register):
        with db.connect() as conn:
            if conn.execute("SELECT 1 FROM users WHERE email=?", (body.email,)).fetchone():
                raise HTTPException(409, "Email này đã được đăng ký.")
            user = {
                "id": uuid.uuid4().hex,
                "name": body.name.strip(),
                "email": body.email,
                "role": "customer",
                "vip_tier": "bronze",
                "starter_tryons_left": 3,
                "total_spent": 0,
            }
            try:
                conn.execute(
                    "INSERT INTO users (id, name, email, password_hash, role, vip_tier, starter_tryons_left, total_spent, push_token, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (user["id"], user["name"], user["email"], hash_password(body.password), "customer", "bronze", 3, 0, None, now())
                )
            except INTEGRITY_ERRORS:
                raise HTTPException(409, "Email này đã được đăng ký.")
            return issue_session(conn, user)

    @app.post("/api/auth/login")
    def login(body: Login, request: Request):
        client_ip = request.client.host if request.client else "local"
        bucket_key = f"login:{body.email}:{client_ip}"
        with rate_lock:
            recent = [t for t in rate_buckets.get(bucket_key, []) if time.time() - t < 300]
            if len(recent) >= 10:
                raise HTTPException(429, "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.")
        with db.connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE email=? OR email=?", (body.email, f"{body.email}@shopfit.vn")).fetchone()
            if not user or not verify_password(body.password, user["password_hash"]):
                check_rate_limit(bucket_key, 10, 300, "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.")
                raise HTTPException(401, "Tài khoản hoặc mật khẩu chưa đúng.")
            with rate_lock:
                rate_buckets.pop(bucket_key, None)
            return issue_session(conn, user)

    @app.get("/api/auth/me")
    def me(user=Depends(current_user)):
        return user

    @app.patch("/api/auth/me")
    def update_me(body: ProfilePatchRequest, user=Depends(current_user)):
        new_name = body.name.strip()
        with db.connect() as conn:
            conn.execute("UPDATE users SET name=? WHERE id=?", (new_name, user["id"]))
        return {**user, "name": new_name}

    @app.post("/api/auth/change-password")
    def change_password(body: ChangePasswordRequest, user=Depends(current_user), authorization: Annotated[str, Header()] = ""):
        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
            if not row or not verify_password(body.current_password, row["password_hash"]):
                raise HTTPException(400, "Mật khẩu hiện tại chưa đúng.")
            conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(body.new_password), user["id"]))
            # Revoke other sessions while keeping the current session active
            if authorization.startswith("Bearer "):
                conn.execute("DELETE FROM sessions WHERE user_id=? AND token_hash!=?", (user["id"], token_hash(authorization[7:])))
        return {"message": "Đã đổi mật khẩu thành công."}

    @app.put("/api/auth/push-token")
    def update_push_token(body: PushTokenRequest, user=Depends(current_user)):
        with db.connect() as conn:
            conn.execute("UPDATE users SET push_token=? WHERE id=?", (body.push_token.strip(), user["id"]))
        return {"status": "ok"}

    @app.get("/api/user/quota")
    def user_quota(user=Depends(current_user)):
        with db.connect() as conn:
            user_row = conn.execute("SELECT vip_tier, starter_tryons_left, total_spent FROM users WHERE id=?", (user["id"],)).fetchone()
            tier = user_row["vip_tier"] if user_row and user_row["vip_tier"] else "bronze"
            starter_left = user_row["starter_tryons_left"] if user_row and user_row["starter_tryons_left"] is not None else 3
            total_spent = user_row["total_spent"] or 0
            tier_info = VIP_TIERS.get(tier, VIP_TIERS["bronze"])

            today_prefix = now()[:10]
            used_today = conn.execute(
                "SELECT count(*) FROM tryons WHERE user_id=? AND created_at LIKE ? AND quota_source='daily' AND status != 'failed'",
                (user["id"], f"{today_prefix}%")
            ).fetchone()[0]

            daily_remaining = max(0, tier_info["daily_limit"] - used_today)
            total_available = starter_left + daily_remaining

            return {
                "vip_tier": tier,
                "vip_name": tier_info["name"],
                "starter_tryons_left": starter_left,
                "daily_limit": tier_info["daily_limit"],
                "daily_used": used_today,
                "daily_remaining": daily_remaining,
                "total_available": total_available,
                "total_spent": total_spent,
                "discount_percent": tier_info["discount_percent"],
                "next_tier": tier_info["next_tier"],
                "next_tier_name": VIP_TIERS[tier_info["next_tier"]]["name"] if tier_info["next_tier"] else None,
                "next_spent_needed": max(0, tier_info["next_spent"] - total_spent) if tier_info["next_spent"] else 0,
            }

    @app.get("/api/payment/packages")
    def list_payment_packages():
        with db.connect() as conn:
            rows = conn.execute("SELECT id, name, price, tryons, tag, voucher_value FROM token_packages WHERE active=1 ORDER BY price ASC").fetchall()
            return [dict(r) for r in rows]

    @app.post("/api/payment/create-order")
    def create_payment_order(body: CreatePaymentOrder, user=Depends(current_user)):
        with db.connect() as conn:
            pkg = conn.execute("SELECT * FROM token_packages WHERE id=? AND active=1", (body.package_id,)).fetchone()
            if not pkg:
                raise HTTPException(404, "Gói thử đồ không tồn tại hoặc đã ngừng hoạt động.")

            payment_code = generate_payment_code("FIT")
            trans_id = uuid.uuid4().hex
            qr_url = build_sepay_qr_url(settings, pkg["price"], payment_code)

            conn.execute("""
                INSERT INTO payment_transactions (id, user_id, package_id, amount, tryons, payment_code, status, qr_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            """, (trans_id, user["id"], pkg["id"], pkg["price"], pkg["tryons"], payment_code, qr_url, now()))

            return {
                "transaction_id": trans_id,
                "package_id": pkg["id"],
                "package_name": pkg["name"],
                "amount": pkg["price"],
                "tryons": pkg["tryons"],
                "voucher_value": pkg["voucher_value"],
                "payment_code": payment_code,
                "bank_id": settings.bank_id,
                "bank_account": settings.bank_account,
                "bank_account_name": settings.bank_account_name,
                "qr_url": qr_url,
                "status": "pending",
            }

    @app.get("/api/payment/status/{transaction_id}")
    def get_payment_status(transaction_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM payment_transactions WHERE id=? AND user_id=?", (transaction_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy giao dịch nạp lượt.")
            return {
                "transaction_id": row["id"],
                "status": row["status"],
                "tryons": row["tryons"],
                "amount": row["amount"],
                "completed_at": row["completed_at"],
            }

    @app.post("/api/payment/confirm/{transaction_id}")
    def confirm_payment(transaction_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            db.begin_write(conn)
            if user["role"] == "admin":
                row = conn.execute("SELECT * FROM payment_transactions WHERE id=?", (transaction_id,)).fetchone()
                if not row:
                    raise HTTPException(404, "Không tìm thấy giao dịch.")
                return complete_payment_transaction(conn, row, settings)
            row = conn.execute("SELECT * FROM payment_transactions WHERE id=? AND user_id=?", (transaction_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy giao dịch.")
            if row["status"] == "completed":
                return {"status": "completed", "tryons": row["tryons"]}
            if row["status"] == "rejected":
                raise HTTPException(400, "Giao dịch này đã bị từ chối đối soát. Vui lòng tạo giao dịch mới hoặc liên hệ shop.")
            conn.execute("UPDATE payment_transactions SET status='verifying' WHERE id=? AND status='pending'", (transaction_id,))
            return {
                "status": "verifying",
                "tryons": row["tryons"],
                "message": "Đã ghi nhận thông báo chuyển khoản. Chủ shop sẽ đối soát và cộng lượt ngay cho bạn!",
            }

    @app.get("/api/admin/payments")
    def admin_list_payments(user=Depends(admin)):
        with db.connect() as conn:
            rows = conn.execute("""
                SELECT pt.*, u.name as user_name, u.email as user_email, tp.name as package_name
                FROM payment_transactions pt
                LEFT JOIN users u ON pt.user_id = u.id
                LEFT JOIN token_packages tp ON pt.package_id = tp.id
                ORDER BY CASE WHEN pt.status='verifying' THEN 0 WHEN pt.status='pending' THEN 1 ELSE 2 END, pt.created_at DESC
                LIMIT 50
            """).fetchall()
            return [dict(r) for r in rows]

    @app.post("/api/admin/payments/{transaction_id}/approve")
    def admin_approve_payment(transaction_id: str, user=Depends(admin)):
        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT * FROM payment_transactions WHERE id=?", (transaction_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy giao dịch.")
            if row["status"] == "rejected":
                raise HTTPException(409, "Giao dịch đã từ chối không thể duyệt lại.")
            return complete_payment_transaction(conn, row, settings)

    @app.post("/api/admin/payments/{transaction_id}/reject")
    def admin_reject_payment(transaction_id: str, user=Depends(admin)):
        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT * FROM payment_transactions WHERE id=?", (transaction_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy giao dịch.")
            if row["status"] == "completed":
                raise HTTPException(409, "Giao dịch đã hoàn tất không thể từ chối.")
            conn.execute("UPDATE payment_transactions SET status='rejected' WHERE id=?", (transaction_id,))
            return {"status": "rejected"}

    @app.post("/api/payment/webhook")
    def payment_webhook(
        body: dict,
        authorization: Annotated[str | None, Header()] = None,
        x_webhook_secret: Annotated[str | None, Header(alias="X-Webhook-Secret")] = None,
    ):
        if not settings.payment_webhook_secret:
            raise HTTPException(503, "Webhook thanh toán chưa được cấu hình khóa bảo mật.")
        supplied = (x_webhook_secret or "").strip()
        if not supplied and authorization:
            auth_trimmed = authorization.strip()
            auth_lower = auth_trimmed.lower()
            for prefix in ("apikey ", "bearer "):
                if auth_lower.startswith(prefix):
                    supplied = auth_trimmed[len(prefix):].strip()
                    break
        if not supplied or not hmac.compare_digest(supplied, settings.payment_webhook_secret):
            raise HTTPException(401, "Chữ ký hoặc khóa Webhook không hợp lệ.")

        transfer_type = str(body.get("transferType") or "in").strip().lower()
        if transfer_type != "in":
            return {"success": True, "status": "ignored", "reason": "Outgoing transfer ignored"}

        incoming_account = normalize_account_number(body.get("accountNumber"))
        expected_account = normalize_account_number(settings.bank_account)
        if incoming_account and expected_account and incoming_account != expected_account:
            return {"success": True, "status": "ignored", "reason": "Account number mismatch"}

        raw_amount = body.get("transferAmount") if body.get("transferAmount") is not None else body.get("amount")
        try:
            paid_amount = int(round(float(raw_amount))) if raw_amount is not None else 0
        except (TypeError, ValueError):
            paid_amount = 0

        sepay_id = str(body.get("id")).strip() if body.get("id") is not None and str(body.get("id")).strip() else None
        reference_code = str(body.get("referenceCode") or "").strip() or None
        gateway = str(body.get("gateway") or "").strip() or None
        raw_content = f"{body.get('code') or ''} {body.get('content') or ''} {body.get('description') or ''}".strip()
        text_upper = raw_content.upper()

        fit_codes = list(dict.fromkeys(re.findall(r"FIT[A-Z0-9]{6}", text_upper)))
        order_codes = list(dict.fromkeys(re.findall(r"SF[A-Z0-9]{6}", text_upper)))

        push_order_target: tuple[str, str] | None = None
        matched_order_id: str | None = None

        def record_webhook(conn, matched_kind: str, matched_id: str | None = None):
            if not sepay_id:
                return
            conn.execute(
                """INSERT INTO sepay_webhooks (sepay_id, reference_code, gateway, account_number, transfer_type, transfer_amount, content, matched_kind, matched_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (sepay_id) DO NOTHING""",
                (sepay_id, reference_code, gateway, incoming_account or None, transfer_type, paid_amount, raw_content[:500], matched_kind, matched_id, now()),
            )

        with db.connect() as conn:
            db.begin_write(conn)
            if sepay_id and conn.execute("SELECT 1 FROM sepay_webhooks WHERE sepay_id=?", (sepay_id,)).fetchone():
                return {"success": True, "status": "duplicate", "reason": "Transaction already processed"}

            # 1. Try matching AI Try-On Top-Up transactions (FITxxxxxx)
            for code in fit_codes:
                row = conn.execute(
                    "SELECT * FROM payment_transactions WHERE payment_code=? AND status IN ('pending', 'verifying')",
                    (code,),
                ).fetchone()
                if not row:
                    continue
                if paid_amount < row["amount"]:
                    record_webhook(conn, "ignored", row["id"])
                    return {"success": True, "status": "ignored", "reason": "Insufficient transfer amount"}
                result = complete_payment_transaction(
                    conn,
                    row,
                    settings,
                    sepay_tx_id=sepay_id,
                    reference_code=reference_code,
                    gateway=gateway,
                    paid_amount=paid_amount,
                )
                record_webhook(conn, "topup", row["id"])
                return {"success": True, "kind": "topup", **result}

            # 2. Try matching E-Commerce Orders (SFxxxxxx)
            for code in order_codes:
                order = conn.execute(
                    "SELECT * FROM orders WHERE payment_code=? AND payment_method='vietqr' AND payment_status IN ('unpaid', 'verifying') AND status != 'cancelled'",
                    (code,),
                ).fetchone()
                if not order:
                    continue
                if paid_amount < order["total"]:
                    record_webhook(conn, "ignored", order["id"])
                    return {"success": True, "status": "ignored", "reason": "Insufficient transfer amount"}
                push_token = mark_order_paid(conn, order, sepay_tx_id=sepay_id)
                record_webhook(conn, "order", order["id"])
                matched_order_id = order["id"]
                if push_token:
                    push_order_target = (push_token, order["id"])
                break

            if not matched_order_id:
                record_webhook(conn, "ignored", None)
                return {"success": True, "status": "ignored", "reason": "No matching pending payment"}

        if push_order_target:
            token, oid = push_order_target
            try:
                send_push_notification(
                    token,
                    "Thanh toán VietQR thành công ✨",
                    f"ShopFit đã nhận chuyển khoản cho đơn SF · {oid[:8].upper()}. Đơn hàng đã được tự động xác nhận!",
                    {"screen": "/orders", "orderId": oid},
                )
            except Exception:
                pass
        return {"success": True, "kind": "order", "status": "paid", "order_id": matched_order_id}

    @app.get("/api/user/vouchers")
    def get_user_vouchers(user=Depends(current_user)):
        with db.connect() as conn:
            rows = conn.execute("SELECT id, code, discount_amount, min_order, used, expires_at FROM user_vouchers WHERE user_id=? AND used=0 ORDER BY created_at DESC", (user["id"],)).fetchall()
            return [dict(r) for r in rows]

    @app.post("/api/auth/logout", status_code=204)
    def logout(user=Depends(current_user), authorization: Annotated[str, Header()] = ""):
        with db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(authorization[7:]),))

    @app.delete("/api/auth/me")
    def delete_account(user=Depends(current_user)):
        uid = user["id"]
        files_to_delete = []
        with db.connect() as conn:
            db.begin_write(conn)
            running = conn.execute("SELECT count(*) FROM tryons WHERE user_id=? AND status IN ('queued', 'processing')", (uid,)).fetchone()[0]
            if running > 0:
                raise HTTPException(409, "Vui lòng chờ lượt thử đồ đang xử lý hoàn tất trước khi xóa tài khoản.")
            rows = conn.execute("SELECT id, views FROM tryons WHERE user_id=?", (uid,)).fetchall()
            for r in rows:
                job_id = r["id"]
                files_to_delete.append(f"{job_id}-photo.jpg")
                files_to_delete.append(f"{job_id}-result.jpg")
                files_to_delete.append(f"{job_id}-actual.jpg")
                for a in ("front", "left", "back", "right"):
                    files_to_delete.append(f"{job_id}-{a}.jpg")
                for view in json.loads(r["views"] or "{}").values():
                    for p_str in (view.get("path"), view.get("candidate_path")):
                        if p_str:
                            Path(p_str).unlink(missing_ok=True)
            conn.execute("DELETE FROM tryon_evaluations WHERE job_id IN (SELECT id FROM tryons WHERE user_id=?)", (uid,))
            conn.execute("DELETE FROM retry_requests WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM tryons WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM photo_checks WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM body_profiles WHERE user_id=?", (uid,))
            conn.execute("UPDATE reports SET user_id=NULL WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM wardrobe WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM fit_reviews WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM user_vouchers WHERE user_id=?", (uid,))
            conn.execute("UPDATE payment_transactions SET user_id=NULL WHERE user_id=?", (uid,))
            conn.execute("UPDATE orders SET user_id=NULL, customer_name='Người dùng đã xóa', phone='', address='', note='' WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM users WHERE id=?", (uid,))

        for fname in files_to_delete:
            try:
                storage.delete_private(fname)
            except Exception:
                pass
        return {"message": "Tài khoản và toàn bộ dữ liệu cá nhân của bạn đã được xóa vĩnh viễn."}

    @app.post("/api/auth/forgot-password")
    def forgot_password(body: ForgotPasswordRequest, request: Request):
        client_ip = request.client.host if request.client else "local"
        check_rate_limit(f"forgot-ip:{client_ip}", 8, 900, "Bạn đã yêu cầu gửi mã OTP quá nhiều lần. Vui lòng thử lại sau 15 phút.")
        check_rate_limit(f"forgot-email:{body.email}", 1, 55, "Vui lòng đợi khoảng 60 giây trước khi yêu cầu gửi lại mã OTP.")
        otp = None
        with db.connect() as conn:
            db.begin_write(conn)
            user = conn.execute("SELECT id, email FROM users WHERE email=?", (body.email,)).fetchone()
            if user:
                otp = f"{secrets.randbelow(900000) + 100000}"
                otp_h = otp_digest(body.email, otp, settings.otp_secret)
                expires_at = int(time.time()) + 900
                conn.execute("""INSERT INTO password_resets (email, otp_hash, expires_at, attempts, created_at)
                    VALUES (?, ?, ?, 0, ?)
                    ON CONFLICT(email) DO UPDATE SET otp_hash=excluded.otp_hash, expires_at=excluded.expires_at, attempts=0, created_at=excluded.created_at""",
                    (body.email, otp_h, expires_at, now()))

        if otp is not None:
            sent = send_otp_email(body.email, otp, settings)
            if not sent:
                raise HTTPException(503, "Không thể gửi email xác thực lúc này. Vui lòng kiểm tra cấu hình dịch vụ email hoặc thử lại sau.")

        return {"message": "Nếu email đã đăng ký trên hệ thống, mã xác thực OTP 6 chữ số đã được gửi tới hộp thư của bạn."}

    @app.post("/api/auth/verify-otp")
    def verify_otp(body: VerifyOtpRequest):
        with db.connect() as conn:
            db.begin_write(conn)
            reset_row = conn.execute("SELECT * FROM password_resets WHERE email=?", (body.email,)).fetchone()
            if not reset_row:
                raise HTTPException(400, "Không tìm thấy yêu cầu hoặc mã OTP đã hết hạn.")
            if int(time.time()) > reset_row["expires_at"]:
                conn.execute("DELETE FROM password_resets WHERE email=?", (body.email,))
                raise HTTPException(400, "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.")
            if reset_row["attempts"] >= 5:
                conn.execute("DELETE FROM password_resets WHERE email=?", (body.email,))
                raise HTTPException(429, "Bạn đã nhập sai mã quá 5 lần. Vui lòng yêu cầu mã mới.")
            expected = otp_digest(body.email, body.otp, settings.otp_secret)
            if not hmac.compare_digest(reset_row["otp_hash"], expected):
                conn.execute("UPDATE password_resets SET attempts = attempts + 1 WHERE email=?", (body.email,))
                raise HTTPException(400, "Mã OTP không chính xác. Vui lòng kiểm tra lại.")
            return {"status": "ok", "message": "Mã xác thực OTP chính xác."}

    @app.post("/api/auth/reset-password")
    def reset_password(body: ResetPasswordRequest):
        with db.connect() as conn:
            db.begin_write(conn)
            reset_row = conn.execute("SELECT * FROM password_resets WHERE email=?", (body.email,)).fetchone()
            if not reset_row:
                raise HTTPException(400, "Không tìm thấy yêu cầu đặt lại mật khẩu hoặc mã đã hết hạn.")
            if int(time.time()) > reset_row["expires_at"]:
                conn.execute("DELETE FROM password_resets WHERE email=?", (body.email,))
                raise HTTPException(400, "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.")
            if reset_row["attempts"] >= 5:
                conn.execute("DELETE FROM password_resets WHERE email=?", (body.email,))
                raise HTTPException(429, "Bạn đã nhập sai mã quá 5 lần. Vui lòng yêu cầu mã mới.")
            expected = otp_digest(body.email, body.otp, settings.otp_secret)
            if not hmac.compare_digest(reset_row["otp_hash"], expected):
                conn.execute("UPDATE password_resets SET attempts = attempts + 1 WHERE email=?", (body.email,))
                raise HTTPException(400, "Mã OTP không chính xác. Vui lòng kiểm tra lại.")
            conn.execute("UPDATE users SET password_hash=? WHERE email=?", (hash_password(body.new_password), body.email))
            conn.execute("DELETE FROM password_resets WHERE email=?", (body.email,))
            user = conn.execute("SELECT id FROM users WHERE email=?", (body.email,)).fetchone()
            if user:
                conn.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        return {"message": "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại bằng mật khẩu mới."}

    @app.get("/api/products")
    def products():
        with db.connect() as conn:
            rows = conn.execute("SELECT * FROM products WHERE active=1 ORDER BY featured DESC, created_at, id").fetchall()
            return db.products_bulk(conn, rows)

    @app.get("/api/products/{product_id}")
    def product(product_id: str):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM products WHERE id=? AND active=1", (product_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            return db.product(conn, row)

    @app.get("/api/admin/products")
    def admin_products(user=Depends(admin)):
        with db.connect() as conn:
            rows = conn.execute("SELECT * FROM products ORDER BY created_at DESC, id DESC").fetchall()
            return db.products_bulk(conn, rows)

    @app.post("/api/admin/upload", status_code=201)
    async def upload(file: Annotated[UploadFile, File()], user=Depends(admin)):
        raw = await file.read(MAX_UPLOAD + 1)
        content = await run_in_threadpool(normalize_image, raw)
        filename = f"{uuid.uuid4().hex}.jpg"
        storage.put_catalog(filename, content)
        return {"url": f"/media/{filename}"}

    def ensure_catalog_file(url: str, err_msg: str):
        fname = url.rsplit("/", 1)[-1]
        if not (settings.data_dir / "catalog" / fname).is_file():
            storage.get_catalog(fname)
        if not (settings.data_dir / "catalog" / fname).is_file():
            raise HTTPException(400, err_msg)

    @app.post("/api/admin/products", status_code=201)
    def add_product(body: ProductWrite, user=Depends(admin)):
        ensure_catalog_file(body.image_url, "Ảnh sản phẩm không tồn tại.")
        if body.back_image_url:
            ensure_catalog_file(body.back_image_url, "Ảnh mặt sau sản phẩm không tồn tại.")
        if body.detail_image_url:
            ensure_catalog_file(body.detail_image_url, "Ảnh cận chất vải sản phẩm không tồn tại.")
        pid = uuid.uuid4().hex
        stock_map = {f"{vs.size}:{vs.color}": vs.stock for vs in (body.variant_stocks or [])}
        chart_data = demo_chart({
            "sizes": body.sizes,
            "tryon_category": body.tryon_category,
            "category": body.category,
        })
        if body.back_image_url:
            chart_data["back_image_url"] = body.back_image_url
        if body.detail_image_url:
            chart_data["detail_image_url"] = body.detail_image_url

        with db.connect() as conn:
            db.begin_write(conn)
            conn.execute("""INSERT INTO products (id,name,category,tryon_category,price,original_price,image_url,tag,material,description,colors,sizes,featured,size_chart,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (pid, body.name, body.category, body.tryon_category, body.price, body.original_price,
                    body.image_url, body.tag, body.material, body.description, json.dumps([c.model_dump() for c in body.colors]), json.dumps(body.sizes), body.featured, json.dumps(chart_data), now()))
            for size in body.sizes:
                for color in body.colors:
                    item_stock = stock_map.get(f"{size}:{color.name}", body.stock_per_variant)
                    conn.execute("INSERT INTO variants VALUES (?,?,?,?)", (pid, size, color.name, item_stock))
            return db.product(conn, conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone())

    @app.patch("/api/admin/products/{product_id}")
    def update_product(product_id: str, body: ProductPatch, user=Depends(admin)):
        if body.image_url is not None:
            ensure_catalog_file(body.image_url, "Ảnh đại diện sản phẩm không tồn tại.")
        if body.back_image_url:
            ensure_catalog_file(body.back_image_url, "Ảnh mặt sau sản phẩm không tồn tại.")
        if body.detail_image_url:
            ensure_catalog_file(body.detail_image_url, "Ảnh cận chất vải sản phẩm không tồn tại.")

        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            for field in ("name", "price", "category", "tryon_category", "material", "description", "tag", "image_url", "active", "featured"):
                value = getattr(body, field)
                if value is not None:
                    conn.execute(f"UPDATE products SET {field}=? WHERE id=?", (value, product_id))
            if body.original_price is not None:
                conn.execute("UPDATE products SET original_price=? WHERE id=?", (body.original_price if body.original_price > 0 else None, product_id))

            current_colors = json.loads(row["colors"])
            current_sizes = json.loads(row["sizes"])
            target_colors = [c.model_dump() for c in body.colors] if body.colors is not None else current_colors
            target_sizes = body.sizes if body.sizes is not None else current_sizes
            colors_or_sizes_changed = (body.colors is not None or body.sizes is not None)

            if body.colors is not None:
                conn.execute("UPDATE products SET colors=? WHERE id=?", (json.dumps(target_colors), product_id))
            if body.sizes is not None:
                conn.execute("UPDATE products SET sizes=? WHERE id=?", (json.dumps(target_sizes), product_id))

            chart = json.loads(row["size_chart"] or "{}")
            chart_dirty = False
            if body.back_image_url is not None:
                chart["back_image_url"] = body.back_image_url if body.back_image_url != "" else None
                chart_dirty = True
            if body.detail_image_url is not None:
                chart["detail_image_url"] = body.detail_image_url if body.detail_image_url != "" else None
                chart_dirty = True
            if body.sizes is not None:
                existing_rows = {r["size"]: r for r in chart.get("rows", [])}
                template = demo_chart({
                    "sizes": target_sizes,
                    "tryon_category": body.tryon_category or row["tryon_category"],
                    "category": body.category or row["category"],
                })["rows"]
                tmpl_map = {r["size"]: r for r in template}
                chart["rows"] = [existing_rows.get(sz, tmpl_map[sz]) for sz in target_sizes]
                if set(target_sizes) != set(current_sizes):
                    chart["verified"] = False
                chart_dirty = True
            if chart_dirty:
                conn.execute("UPDATE products SET size_chart=? WHERE id=?", (json.dumps(chart), product_id))

            if colors_or_sizes_changed:
                valid_color_names = [c["name"] for c in target_colors]
                existing_stocks = {
                    (v["size"], v["color"]): v["stock"]
                    for v in conn.execute("SELECT size, color, stock FROM variants WHERE product_id=?", (product_id,))
                }
                supplied_stocks = {(v.size, v.color): v.stock for v in (body.variants or [])}
                conn.execute("DELETE FROM variants WHERE product_id=?", (product_id,))
                for sz in target_sizes:
                    for cname in valid_color_names:
                        st = supplied_stocks.get((sz, cname), existing_stocks.get((sz, cname), 10))
                        conn.execute("INSERT INTO variants VALUES (?,?,?,?)", (product_id, sz, cname, st))
            else:
                for v in body.variants or []:
                    result = conn.execute("UPDATE variants SET stock=? WHERE product_id=? AND size=? AND color=?", (v.stock, product_id, v.size, v.color))
                    if result.rowcount != 1:
                        raise HTTPException(400, "Biến thể màu/size không tồn tại.")

            return db.product(conn, conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone())

    def _enrich_order_dict(data: dict) -> dict:
        data.pop("request_key", None)
        data.pop("request_fingerprint", None)
        data["payment_method"] = data.get("payment_method") or "cod"
        data["payment_status"] = data.get("payment_status") or "unpaid"
        if data["payment_method"] == "vietqr":
            data["bank_id"] = settings.bank_id
            data["bank_account"] = settings.bank_account
            data["bank_account_name"] = settings.bank_account_name
        return data

    def serialize_order(conn, row):
        items = []
        for item in conn.execute("SELECT * FROM order_items WHERE order_id=?", (row["id"],)):
            review = conn.execute("SELECT actual_fit,notes,share_public,updated_at FROM fit_reviews WHERE order_item_id=?", (item["id"],)).fetchone()
            rev_dict = {"actual_fit": review["actual_fit"], "notes": review["notes"], "share_public": bool(review["share_public"]), "updated_at": review["updated_at"]} if review else None
            items.append({**dict(item), "fit_review": rev_dict})
        data = _enrich_order_dict(dict(row))
        return {**data, "items": items}

    def serialize_orders_bulk(conn, rows):
        rows = list(rows)
        if not rows:
            return []
        oids = [r["id"] for r in rows]
        ph = ",".join("?" for _ in oids)
        all_items = [dict(i) for i in conn.execute(f"SELECT * FROM order_items WHERE order_id IN ({ph}) ORDER BY id", tuple(oids))]
        reviews_by_item: dict[int, dict] = {}
        if all_items:
            iids = [i["id"] for i in all_items]
            iph = ",".join("?" for _ in iids)
            for rev in conn.execute(f"SELECT order_item_id,actual_fit,notes,share_public,updated_at FROM fit_reviews WHERE order_item_id IN ({iph})", tuple(iids)):
                reviews_by_item[rev["order_item_id"]] = {"actual_fit": rev["actual_fit"], "notes": rev["notes"], "share_public": bool(rev["share_public"]), "updated_at": rev["updated_at"]}
        items_by_order: dict[str, list[dict]] = {oid: [] for oid in oids}
        for item in all_items:
            items_by_order[item["order_id"]].append({**item, "fit_review": reviews_by_item.get(item["id"])})
        result = []
        for r in rows:
            data = _enrich_order_dict(dict(r))
            result.append({**data, "items": items_by_order[r["id"]]})
        return result

    @app.post("/api/orders", status_code=201)
    def checkout(body: Checkout, request_key: Annotated[str | None, Header(alias="X-Idempotency-Key", min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")] = None, user=Depends(current_user)):
        oid = uuid.uuid4().hex
        with db.connect() as conn:
            db.begin_write(conn)
            fingerprint = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
            if request_key:
                existing = conn.execute("SELECT * FROM orders WHERE user_id=? AND request_key=?", (user["id"], request_key)).fetchone()
                if existing:
                    if existing["request_fingerprint"] != fingerprint:
                        raise HTTPException(409, "Mã đặt hàng đã dùng cho nội dung khác.")
                    return serialize_order(conn, existing)
            lines = []
            subtotal = 0
            for item in body.items:
                p = conn.execute("SELECT * FROM products WHERE id=? AND active=1", (item.product_id,)).fetchone()
                if not p:
                    raise HTTPException(409, "Một sản phẩm đã ngừng bán. Vui lòng cập nhật giỏ hàng.")
                changed = conn.execute("UPDATE variants SET stock=stock-? WHERE product_id=? AND size=? AND color=? AND stock>=?", (item.quantity, item.product_id, item.size, item.color, item.quantity))
                if changed.rowcount != 1:
                    raise HTTPException(409, f"{p['name']} ({item.size}, {item.color}) không đủ hàng.")
                subtotal += p["price"] * item.quantity
                lines.append((item, p))

            u_row = conn.execute("SELECT vip_tier FROM users WHERE id=?", (user["id"],)).fetchone()
            tier_key = (u_row["vip_tier"] if u_row and u_row["vip_tier"] else "bronze")
            vip_pct = VIP_TIERS.get(tier_key, VIP_TIERS["bronze"])["discount_percent"]
            vip_discount = round(subtotal * vip_pct / 100)

            voucher_discount = 0
            applied_voucher_code = None
            if body.voucher_code and body.voucher_code.strip():
                vcode = body.voucher_code.strip().upper()
                v_row = conn.execute(
                    "SELECT * FROM user_vouchers WHERE user_id=? AND UPPER(code)=? AND used=0",
                    (user["id"], vcode),
                ).fetchone()
                if not v_row:
                    raise HTTPException(400, "Mã giảm giá không hợp lệ hoặc đã được sử dụng.")
                if v_row["expires_at"] < now():
                    raise HTTPException(400, "Mã giảm giá đã hết hạn.")
                if subtotal < v_row["min_order"]:
                    raise HTTPException(400, f"Đơn hàng cần tối thiểu {v_row['min_order']:,}₫ để áp dụng mã này.")
                voucher_discount = v_row["discount_amount"]
                applied_voucher_code = v_row["code"]
                conn.execute("UPDATE user_vouchers SET used=1 WHERE id=?", (v_row["id"],))

            discount_amount = min(subtotal, vip_discount + voucher_discount)
            total = max(0, subtotal - discount_amount)

            order_status_init = "pending"
            payment_method = body.payment_method
            payment_status = "unpaid"
            order_payment_code = None
            order_qr_url = None
            paid_at = None
            created_ts = now()

            if payment_method == "vietqr":
                if total == 0:
                    payment_status = "paid"
                    order_status_init = "confirmed"
                    paid_at = created_ts
                else:
                    for _ in range(8):
                        candidate = generate_payment_code("SF")
                        if not conn.execute("SELECT 1 FROM orders WHERE payment_code=?", (candidate,)).fetchone():
                            order_payment_code = candidate
                            break
                    if not order_payment_code:
                        order_payment_code = f"SF{oid[:6].upper()}"
                    order_qr_url = build_sepay_qr_url(settings, total, order_payment_code)

            conn.execute(
                """INSERT INTO orders (id,user_id,customer_name,phone,address,note,total,subtotal,discount_amount,voucher_code,
                   payment_method,payment_status,payment_code,payment_qr_url,paid_at,status,created_at,request_key,request_fingerprint)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (oid, user["id"], body.customer_name.strip(), body.phone, body.address.strip(), body.note, total, subtotal,
                 discount_amount, applied_voucher_code, payment_method, payment_status, order_payment_code, order_qr_url,
                 paid_at, order_status_init, created_ts, request_key, fingerprint),
            )
            for item, p in lines:
                conn.execute("""INSERT INTO order_items (order_id,product_id,name,image_url,size,color,quantity,price)
                    VALUES (?,?,?,?,?,?,?,?)""", (oid, p["id"], p["name"], p["image_url"], item.size, item.color, item.quantity, p["price"]))
            return serialize_order(conn, conn.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())

    @app.get("/api/orders")
    def orders(user=Depends(current_user)):
        with db.connect() as conn:
            rows = conn.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200") if user["role"] == "admin" else conn.execute("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100", (user["id"],))
            return serialize_orders_bulk(conn, rows)

    @app.get("/api/orders/{order_id}")
    def get_order_detail(order_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
            if not row or (user["role"] != "admin" and row["user_id"] != user["id"]):
                raise HTTPException(404, "Không tìm thấy đơn hàng.")
            return serialize_order(conn, row)

    @app.post("/api/orders/{order_id}/report-paid")
    def report_order_paid(order_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            db.begin_write(conn)
            order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, user["id"])).fetchone()
            if not order:
                raise HTTPException(404, "Không tìm thấy đơn hàng.")
            order_dict = dict(order)
            if order_dict.get("payment_method") != "vietqr":
                raise HTTPException(400, "Đơn hàng này thanh toán khi nhận hàng (COD).")
            if order_dict["status"] == "cancelled":
                raise HTTPException(409, "Đơn hàng đã hủy không thể báo chuyển khoản.")
            if order_dict.get("payment_status") == "paid":
                return serialize_order(conn, order)
            conn.execute("UPDATE orders SET payment_status='verifying' WHERE id=? AND payment_status='unpaid'", (order_id,))
            return serialize_order(conn, conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())

    @app.post("/api/admin/orders/{order_id}/confirm-payment")
    def admin_confirm_order_payment(order_id: str, user=Depends(admin)):
        push_token = None
        with db.connect() as conn:
            db.begin_write(conn)
            order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
            if not order:
                raise HTTPException(404, "Không tìm thấy đơn hàng.")
            order_dict = dict(order)
            if order_dict.get("payment_method") != "vietqr":
                raise HTTPException(400, "Đơn hàng này không dùng phương thức VietQR.")
            if order_dict["status"] == "cancelled":
                raise HTTPException(409, "Đơn hàng đã hủy không thể xác nhận thanh toán.")
            push_token = mark_order_paid(conn, order)
            updated = serialize_order(conn, conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())
        if push_token:
            try:
                send_push_notification(
                    push_token,
                    "Thanh toán VietQR thành công ✨",
                    f"Chủ shop đã xác nhận chuyển khoản cho đơn SF · {order_id[:8].upper()}.",
                    {"screen": "/orders", "orderId": order_id},
                )
            except Exception:
                pass
        return updated

    @app.patch("/api/orders/{order_id}")
    def order_status(order_id: str, body: StatusPatch, user=Depends(current_user)):
        transitions = {"pending": {"confirmed", "cancelled"}, "confirmed": {"shipping", "cancelled"}, "shipping": {"completed", "cancelled"}, "completed": set(), "cancelled": set()}
        push_target = None
        with db.connect() as conn:
            db.begin_write(conn)
            order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
            if not order or (user["role"] != "admin" and order["user_id"] != user["id"]):
                raise HTTPException(404, "Không tìm thấy đơn hàng.")
            order_dict = dict(order)
            if user["role"] != "admin" and order_dict.get("payment_status") == "paid":
                raise HTTPException(409, "Đơn hàng đã thanh toán chuyển khoản. Vui lòng liên hệ shop để được hỗ trợ.")
            if user["role"] != "admin" and (body.status != "cancelled" or order["status"] != "pending"):
                raise HTTPException(403, "Bạn chỉ có thể hủy đơn đang chờ xác nhận.")
            if body.status not in transitions[order["status"]]:
                raise HTTPException(409, "Không thể chuyển đơn sang trạng thái này.")
            if body.status == "cancelled":
                for item in conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)):
                    conn.execute("UPDATE variants SET stock=stock+? WHERE product_id=? AND size=? AND color=?", (item["quantity"], item["product_id"], item["size"], item["color"]))
                if order_dict.get("voucher_code") and order_dict.get("user_id"):
                    conn.execute("UPDATE user_vouchers SET used=0 WHERE user_id=? AND code=?", (order_dict["user_id"], order_dict["voucher_code"]))
            elif body.status == "completed" and order_dict.get("user_id"):
                conn.execute("UPDATE users SET total_spent = COALESCE(total_spent, 0) + ? WHERE id=?", (order_dict["total"], order_dict["user_id"]))
                spent_row = conn.execute("SELECT total_spent FROM users WHERE id=?", (order_dict["user_id"],)).fetchone()
                new_spent = spent_row[0] if spent_row and spent_row[0] else 0
                conn.execute("UPDATE users SET vip_tier=? WHERE id=?", (calculate_tier(new_spent), order_dict["user_id"]))

            conn.execute("UPDATE orders SET status=? WHERE id=?", (body.status, order_id))
            if user["role"] == "admin" and order_dict.get("user_id"):
                u_push = conn.execute("SELECT push_token FROM users WHERE id=?", (order_dict["user_id"],)).fetchone()
                if u_push and u_push["push_token"]:
                    push_target = u_push["push_token"]
            updated_order = serialize_order(conn, conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())

        if push_target:
            status_msgs = {
                "confirmed": ("Đơn hàng đã được xác nhận ✨", f"Đơn SF · {order_id[:8].upper()} đang được ShopFit chuẩn bị đóng gói."),
                "shipping": ("Đơn hàng đang giao đến bạn 🚚", f"Đơn SF · {order_id[:8].upper()} đã bàn giao cho đơn vị vận chuyển."),
                "completed": ("Giao hàng thành công 🎉", f"Cảm ơn bạn đã mua sắm tại ShopFit! Đừng quên đánh giá độ vừa size nhé."),
                "cancelled": ("Đơn hàng đã hủy", f"Đơn SF · {order_id[:8].upper()} đã được hủy."),
            }
            if body.status in status_msgs:
                title, msg = status_msgs[body.status]
                try:
                    send_push_notification(push_target, title, msg, {"screen": "/orders", "orderId": order_id})
                except Exception:
                    pass
        return updated_order

    @app.get("/api/admin/summary")
    def summary(user=Depends(admin)):
        with db.connect() as conn:
            completed_tryons = conn.execute("SELECT count(*) FROM tryons WHERE status='completed'").fetchone()[0]
            tryon_users = conn.execute("SELECT count(DISTINCT user_id) FROM tryons WHERE status IN ('completed', 'partial')").fetchone()[0]
            converted_users = conn.execute("""
                SELECT count(DISTINCT o.user_id)
                FROM orders o
                WHERE o.user_id IS NOT NULL AND o.status != 'cancelled'
                  AND EXISTS (
                      SELECT 1 FROM order_items oi
                      JOIN tryons t ON t.product_id = oi.product_id AND t.user_id = o.user_id
                      WHERE oi.order_id = o.id AND t.status IN ('completed', 'partial') AND t.created_at <= o.created_at
                  )
            """).fetchone()[0]
            conversion_rate = min(100.0, round((converted_users / tryon_users * 100), 1)) if tryon_users > 0 else 0.0
            low_stock_count = conn.execute("SELECT count(DISTINCT product_id) FROM variants WHERE stock <= 3").fetchone()[0]
            pending_payments = conn.execute("SELECT count(*) FROM payment_transactions WHERE status='verifying'").fetchone()[0]
            pending_order_payments = conn.execute(
                "SELECT count(*) FROM orders WHERE payment_method='vietqr' AND payment_status='verifying' AND status != 'cancelled'"
            ).fetchone()[0]
            return {
                "products": conn.execute("SELECT count(*) FROM products WHERE active=1").fetchone()[0],
                "pending_orders": conn.execute("SELECT count(*) FROM orders WHERE status='pending'").fetchone()[0],
                "pending_payments": pending_payments,
                "pending_order_payments": pending_order_payments,
                "revenue": conn.execute("SELECT coalesce(sum(total),0) FROM orders WHERE status='completed'").fetchone()[0],
                "tryons": completed_tryons,
                "conversion_rate": conversion_rate,
                "low_stock_products": low_stock_count,
            }

    @app.get("/api/admin/tryon-analytics")
    def tryon_analytics(user=Depends(admin)):
        with db.connect() as conn:
            rows = conn.execute("""
                SELECT 
                    p.id, p.name, p.category, p.image_url, p.price,
                    (SELECT count(*) FROM tryons t WHERE t.product_id = p.id AND t.status IN ('completed', 'partial')) as tryon_count,
                    (SELECT count(DISTINCT t.user_id) FROM tryons t WHERE t.product_id = p.id AND t.status IN ('completed', 'partial')) as tryon_users,
                    (SELECT count(DISTINCT o.user_id) FROM order_items oi
                     JOIN orders o ON oi.order_id = o.id
                     WHERE oi.product_id = p.id AND o.user_id IS NOT NULL AND o.status != 'cancelled'
                       AND EXISTS (
                           SELECT 1 FROM tryons t
                           WHERE t.user_id = o.user_id AND t.product_id = p.id
                             AND t.status IN ('completed', 'partial') AND t.created_at <= o.created_at
                       )) as converted_users,
                    (SELECT COALESCE(sum(oi.quantity), 0) FROM order_items oi 
                     JOIN orders o ON oi.order_id = o.id 
                     WHERE oi.product_id = p.id AND o.status != 'cancelled') as order_count
                FROM products p
                WHERE p.active = 1
            """).fetchall()
            items = []
            total_tryon_users = 0
            total_converted_users = 0
            for r in rows:
                t_cnt = r["tryon_count"]
                t_users = r["tryon_users"]
                c_users = r["converted_users"]
                o_cnt = r["order_count"]
                total_tryon_users += t_users
                total_converted_users += c_users
                rate = min(100.0, round((c_users / t_users * 100), 1)) if t_users > 0 else 0.0
                items.append({
                    "product_id": r["id"],
                    "name": r["name"],
                    "category": r["category"],
                    "image_url": r["image_url"],
                    "price": r["price"],
                    "tryon_count": t_cnt,
                    "order_count": o_cnt,
                    "conversion_rate": rate,
                })
            by_tryon = sorted(items, key=lambda x: (x["tryon_count"], x["order_count"]), reverse=True)
            total_tryons = sum(x["tryon_count"] for x in items)
            total_orders = sum(x["order_count"] for x in items)
            avg_rate = min(100.0, round((total_converted_users / total_tryon_users * 100), 1)) if total_tryon_users > 0 else 0.0
            return {
                "total_tryons": total_tryons,
                "total_orders": total_orders,
                "avg_conversion_rate": avg_rate,
                "top_products": by_tryon[:5],
            }

    @app.post("/api/tryons", status_code=202)
    async def start_tryon(product_id: Annotated[str, Form()], color: Annotated[str, Form()], photo: Annotated[UploadFile, File()], size: Annotated[str, Form()] = "M", request_key: Annotated[str | None, Header(alias="X-Idempotency-Key", min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")] = None, user=Depends(current_user)):
        if not service.engine.enabled:
            raise HTTPException(503, "Phòng thử AI chưa được cấu hình.")
        raw_photo = await photo.read(MAX_UPLOAD + 1)
        photo_bytes = await run_in_threadpool(normalize_image, raw_photo)
        existing = service.find_request(user["id"], request_key, service.fingerprint(product_id, color, size, photo_bytes))
        if existing:
            with db.connect() as conn:
                return service.serialize(conn.execute("SELECT * FROM tryons WHERE id=?", (existing,)).fetchone())
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM products WHERE id=? AND active=1", (product_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            p = db.product(conn, row)
            profile_row = conn.execute("SELECT profile FROM body_profiles WHERE user_id=?", (user["id"],)).fetchone()
            u_row = conn.execute("SELECT vip_tier FROM users WHERE id=?", (user["id"],)).fetchone()
        if color not in [c["name"] for c in p["colors"]]:
            raise HTTPException(400, "Màu sản phẩm không hợp lệ.")
        if not any(v["size"] == size and v["color"] == color and v["stock"] > 0 for v in p["variants"]):
            raise HTTPException(400, "Size/màu đã chọn không hợp lệ hoặc đã hết hàng.")
        profile = json.loads(profile_row[0]) if profile_row else {}
        is_feminine = p["tryon_category"] == "one-pieces" or any(w in p["category"].lower() for w in ("váy", "đầm"))
        female_presets = {
            "XS": {"height_cm": 152, "weight_kg": 42, "chest_cm": 78, "waist_cm": 60, "hip_cm": 84, "shoulder_cm": 35, "inseam_cm": 67, "fit_preference": "regular"},
            "S": {"height_cm": 156, "weight_kg": 46, "chest_cm": 82, "waist_cm": 64, "hip_cm": 88, "shoulder_cm": 36, "inseam_cm": 68, "fit_preference": "regular"},
            "M": {"height_cm": 160, "weight_kg": 51, "chest_cm": 86, "waist_cm": 68, "hip_cm": 92, "shoulder_cm": 38, "inseam_cm": 70, "fit_preference": "regular"},
            "L": {"height_cm": 165, "weight_kg": 57, "chest_cm": 90, "waist_cm": 72, "hip_cm": 96, "shoulder_cm": 40, "inseam_cm": 72, "fit_preference": "regular"},
            "XL": {"height_cm": 170, "weight_kg": 64, "chest_cm": 96, "waist_cm": 78, "hip_cm": 102, "shoulder_cm": 42, "inseam_cm": 74, "fit_preference": "regular"},
            "2XL": {"height_cm": 173, "weight_kg": 70, "chest_cm": 102, "waist_cm": 84, "hip_cm": 108, "shoulder_cm": 44, "inseam_cm": 75, "fit_preference": "regular"},
        }
        unisex_presets = {
            "XS": {"height_cm": 160, "weight_kg": 48, "chest_cm": 82, "waist_cm": 66, "hip_cm": 84, "shoulder_cm": 40, "inseam_cm": 72, "fit_preference": "regular"},
            "S": {"height_cm": 165, "weight_kg": 54, "chest_cm": 88, "waist_cm": 72, "hip_cm": 88, "shoulder_cm": 42, "inseam_cm": 74, "fit_preference": "regular"},
            "M": {"height_cm": 170, "weight_kg": 62, "chest_cm": 94, "waist_cm": 78, "hip_cm": 94, "shoulder_cm": 44, "inseam_cm": 76, "fit_preference": "regular"},
            "L": {"height_cm": 175, "weight_kg": 70, "chest_cm": 100, "waist_cm": 84, "hip_cm": 100, "shoulder_cm": 46, "inseam_cm": 78, "fit_preference": "regular"},
            "XL": {"height_cm": 180, "weight_kg": 78, "chest_cm": 106, "waist_cm": 90, "hip_cm": 106, "shoulder_cm": 48, "inseam_cm": 80, "fit_preference": "regular"},
            "2XL": {"height_cm": 185, "weight_kg": 86, "chest_cm": 112, "waist_cm": 96, "hip_cm": 112, "shoulder_cm": 50, "inseam_cm": 82, "fit_preference": "regular"},
        }
        preset_map = female_presets if is_feminine else unisex_presets
        fallback = preset_map.get(size.upper(), preset_map["M"])
        for k, v in fallback.items():
            if profile.get(k) is None:
                profile[k] = v

        tier = u_row["vip_tier"] if u_row and u_row["vip_tier"] else "bronze"
        tier_info = VIP_TIERS.get(tier, VIP_TIERS["bronze"])

        check = await run_in_threadpool(analyzer.check, user["id"], photo_bytes)
        if not check["accepted"]:
            raise HTTPException(400, "Ảnh chưa đạt: " + " ".join(check["messages"]))
        job_id = service.start(user["id"], p, color, photo_bytes, size, profile, check, request_key, daily_tier_limit=tier_info["daily_limit"])
        with db.connect() as conn:
            return service.serialize(conn.execute("SELECT * FROM tryons WHERE id=?", (job_id,)).fetchone())

    @app.get("/api/tryons")
    def tryons(user=Depends(current_user)):
        with db.connect() as conn:
            rows = conn.execute("SELECT t.*,p.name as product_name FROM tryons t JOIN products p ON t.product_id=p.id WHERE t.user_id=? AND t.deleted=0 ORDER BY t.created_at DESC LIMIT 100", (user["id"],))
            return [service.serialize(row) for row in rows]

    @app.get("/api/tryons/{job_id}")
    def get_tryon(job_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute("SELECT t.*,p.name as product_name FROM tryons t JOIN products p ON t.product_id=p.id WHERE t.id=? AND t.user_id=? AND t.deleted=0", (job_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy lượt thử đồ.")
            return service.serialize(row)

    @app.delete("/api/tryons/{job_id}", status_code=204)
    def delete_tryon(job_id: str, user=Depends(current_user)):
        s3_files_to_remove = [f"{job_id}-photo.jpg", f"{job_id}-result.jpg", f"{job_id}-actual.jpg"] + [
            f"{job_id}-{a}.jpg" for a in ("front", "left", "back", "right")
        ]
        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT * FROM tryons WHERE id=? AND user_id=? AND deleted=0", (job_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy lượt thử đồ.")
            if row["status"] in ("queued", "processing"):
                raise HTTPException(409, "Vui lòng chờ lượt thử kết thúc trước khi xóa ảnh.")
            for field in ("photo_path", "result_path"):
                if row[field]:
                    Path(row[field]).unlink(missing_ok=True)
            for view in json.loads(row["views"]).values():
                for stored_path in (view.get("path"), view.get("candidate_path")):
                    if stored_path:
                        Path(stored_path).unlink(missing_ok=True)
            evaluation = conn.execute("SELECT actual_path FROM tryon_evaluations WHERE job_id=?", (job_id,)).fetchone()
            if evaluation and evaluation[0]:
                Path(evaluation[0]).unlink(missing_ok=True)
            conn.execute("DELETE FROM tryon_evaluations WHERE job_id=?", (job_id,))
            conn.execute("UPDATE tryons SET deleted=1,photo_path='',result_path=NULL,image_secret='',usage=NULL,views='{}',body_snapshot=NULL,fit_snapshot=NULL,photo_check=NULL WHERE id=?", (job_id,))
        for fname in s3_files_to_remove:
            try:
                storage.delete_private(fname)
            except Exception:
                pass

    @app.post("/api/tryons/{job_id}/report", status_code=201)
    def report_tryon(job_id: str, body: ReportRequest, user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute("SELECT id FROM tryons WHERE id=?", (job_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy lượt thử đồ cần báo cáo.")
            report_id = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO reports (id, user_id, tryon_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (report_id, user["id"], job_id, body.reason.strip(), body.details.strip(), now()),
            )
            return {
                "message": "Cảm ơn bạn đã phản hồi. Ban quản trị ShopFit đã ghi nhận và sẽ xử lý kiểm duyệt trong vòng 24 giờ.",
                "report_id": report_id,
            }

    @app.get("/api/tryons/{job_id}/image/{kind}")
    def private_image(job_id: str, kind: Literal["photo", "result", "front", "left", "back", "right", "actual"], expires: int, signature: str):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM tryons WHERE id=?", (job_id,)).fetchone()
            evaluation = conn.execute("SELECT actual_path FROM tryon_evaluations WHERE job_id=?", (job_id,)).fetchone() if kind == "actual" else None
        if not row or row["deleted"] or expires < int(time.time()) or not hmac.compare_digest(signature, service.image_signature(row, kind, expires)):
            raise HTTPException(403, "Liên kết ảnh không hợp lệ hoặc đã hết hạn.")
        if kind in ("photo", "result"):
            path = row[f"{kind}_path"]
        elif kind == "actual":
            path = evaluation[0] if evaluation else None
        else:
            path = json.loads(row["views"]).get(kind, {}).get("path")
            if kind == "front" and not path:
                path = row["result_path"]
        if not path or not Path(path).is_file():
            fname = Path(path).name if path else f"{job_id}-{kind}.jpg"
            storage.get_private(fname)
            path = str(settings.data_dir / "private" / fname)
        if not Path(path).is_file():
            raise HTTPException(404, "Ảnh chưa sẵn sàng.")
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"})

    app.include_router(fitting_routes(db, settings, current_user, admin, service, analyzer))
    app.include_router(insight_routes(db, settings, current_user, admin))
    return app


app = create_app()
