import hmac
import hashlib
import json
import re
import secrets
import time
import urllib.parse
import uuid
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .db import Database, INTEGRITY_ERRORS, now
from .security import hash_password, token_hash, verify_password
from .tryon import MAX_UPLOAD, TryOnService, normalize_image
from .photo_checks import PhotoAnalyzer
from .fitting_routes import fitting_routes
from .sizing import required_fields
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
    items: list[CartItem] = Field(min_length=1, max_length=30)


class Color(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    hex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class ProductWrite(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    category: Literal["Áo", "Quần", "Váy", "Áo khoác"]
    tryon_category: Literal["tops", "bottoms", "one-pieces"]
    price: int = Field(gt=0, le=100_000_000)
    original_price: int | None = Field(default=None, gt=0, le=100_000_000)
    image_url: str = Field(max_length=500)
    tag: str = Field(default="MỚI", max_length=30)
    material: str = Field(default="Cotton", max_length=100)
    description: str = Field(min_length=10, max_length=2000)
    colors: list[Color] = Field(min_length=1, max_length=10)
    sizes: list[str] = Field(min_length=1, max_length=10)
    stock_per_variant: int = Field(default=10, ge=0, le=10000)
    featured: bool = False

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


class VariantStock(BaseModel):
    size: str
    color: str
    stock: int = Field(ge=0, le=10000)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    price: int | None = Field(default=None, gt=0, le=100_000_000)
    active: bool | None = None
    variants: list[VariantStock] | None = None


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


def complete_payment_transaction(conn, trans_row, settings: Settings):
    if trans_row["status"] == "completed":
        return {"status": "completed", "tryons": trans_row["tryons"]}

    trans_id = trans_row["id"]
    user_id = trans_row["user_id"]
    tryons = trans_row["tryons"]
    amount = trans_row["amount"]
    package_id = trans_row["package_id"]

    conn.execute("UPDATE payment_transactions SET status='completed', completed_at=? WHERE id=?", (now(), trans_id))
    conn.execute(
        "UPDATE users SET starter_tryons_left = COALESCE(starter_tryons_left, 0) + ?, total_spent = COALESCE(total_spent, 0) + ? WHERE id=?",
        (tryons, amount, user_id)
    )

    u_row = conn.execute("SELECT total_spent, push_token FROM users WHERE id=?", (user_id,)).fetchone()
    if u_row:
        new_spent = u_row["total_spent"] or 0
        new_tier = calculate_tier(new_spent)
        conn.execute("UPDATE users SET vip_tier=? WHERE id=?", (new_tier, user_id))

        if u_row["push_token"]:
            send_push_notification(
                u_row["push_token"],
                "Nạp lượt thử thành công! 🎉",
                f"Tài khoản của bạn đã được cộng thêm {tryons} lượt thử đồ AI ShopFit. Bắt đầu phối đồ ngay nhé!",
                {"type": "payment_completed", "transaction_id": trans_id}
            )

    pkg = conn.execute("SELECT voucher_value FROM token_packages WHERE id=?", (package_id,)).fetchone()
    if pkg and pkg["voucher_value"] > 0:
        v_code = f"FIT{secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}{secrets.randbelow(9000)+1000}"
        conn.execute(
            """INSERT INTO user_vouchers (id, user_id, code, discount_amount, min_order, used, created_at, expires_at)
               VALUES (?, ?, ?, ?, 100000, 0, ?, ?)""",
            (uuid.uuid4().hex, user_id, v_code, pkg["voucher_value"], now(), "2099-12-31T23:59:59")
        )

    return {"status": "completed", "tryons": tryons}


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

    app = FastAPI(title="ShopFit API", version="0.1.0", lifespan=lifespan)
    app.state.db = db
    app.state.storage = storage
    app.state.tryon = service
    app.state.photo_analyzer = analyzer
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "X-Idempotency-Key"])

    @app.get("/media/{filename}")
    def get_media(filename: str):
        path = settings.data_dir / "catalog" / filename
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
                "ai_ready": service.engine.enabled, "engine": "openvto", "model": settings.image_model, "demo_accounts": settings.seed_demo}

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
    def login(body: Login):
        with db.connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE email=? OR email=? OR name=?", (body.email, f"{body.email}@shopfit.vn", body.email)).fetchone()
            if not user or not verify_password(body.password, user["password_hash"]):
                raise HTTPException(401, "Tài khoản hoặc mật khẩu chưa đúng.")
            return issue_session(conn, user)

    @app.get("/api/auth/me")
    def me(user=Depends(current_user)):
        return user

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
                "SELECT count(*) FROM tryons WHERE user_id=? AND created_at LIKE ? AND deleted=0 AND status != 'failed'",
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

            code_chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            payment_code = "FIT" + "".join(secrets.choice(code_chars) for _ in range(6))
            trans_id = uuid.uuid4().hex

            encoded_name = urllib.parse.quote(settings.bank_account_name)
            qr_url = f"https://img.vietqr.io/image/{settings.bank_id}-{settings.bank_account}-compact2.png?amount={pkg['price']}&addInfo={payment_code}&accountName={encoded_name}"

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
            row = conn.execute("SELECT * FROM payment_transactions WHERE id=? AND user_id=?", (transaction_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy giao dịch.")
            result = complete_payment_transaction(conn, row, settings)
            return result

    @app.post("/api/payment/webhook")
    def payment_webhook(body: dict):
        text = f"{body.get('content', '')} {body.get('description', '')} {body.get('code', '')}"
        match = re.search(r"FIT[A-Z0-9]{6}", text.upper())
        if not match:
            return {"status": "ignored", "reason": "No matching payment code"}
        code = match.group(0)
        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT * FROM payment_transactions WHERE payment_code=? AND status='pending'", (code,)).fetchone()
            if not row:
                return {"status": "ignored", "reason": "Transaction not found or already completed"}
            result = complete_payment_transaction(conn, row, settings)
            return result

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
            rows = conn.execute("SELECT id, views FROM tryons WHERE user_id=?", (uid,)).fetchall()
            for r in rows:
                job_id = r["id"]
                files_to_delete.append(f"{job_id}-photo.jpg")
                files_to_delete.append(f"{job_id}-result.jpg")
                files_to_delete.append(f"{job_id}-actual.jpg")
                for a in ("front", "left", "back", "right"):
                    files_to_delete.append(f"{job_id}-{a}.jpg")
            conn.execute("DELETE FROM tryon_evaluations WHERE job_id IN (SELECT id FROM tryons WHERE user_id=?)", (uid,))
            conn.execute("DELETE FROM retry_requests WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM tryons WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM photo_checks WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM body_profiles WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM reports WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM wardrobe WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM fit_reviews WHERE user_id=?", (uid,))
            conn.execute("UPDATE orders SET customer_name='Người dùng đã xóa', phone='', address='', note='' WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM users WHERE id=?", (uid,))

        for fname in files_to_delete:
            try:
                storage.delete_private(fname)
            except Exception:
                pass
        return {"message": "Tài khoản và toàn bộ dữ liệu cá nhân của bạn đã được xóa vĩnh viễn."}

    @app.post("/api/auth/forgot-password")
    def forgot_password(body: ForgotPasswordRequest):
        with db.connect() as conn:
            user = conn.execute("SELECT id, email FROM users WHERE email=?", (body.email,)).fetchone()
            if not user:
                return {"message": "Nếu email tồn tại trong hệ thống, mã xác nhận OTP đã được gửi đến bạn."}
            otp = f"{secrets.randbelow(900000) + 100000}"
            otp_h = token_hash(otp)
            expires_at = int(time.time()) + 900
            conn.execute("""INSERT INTO password_resets (email, otp_hash, expires_at, attempts, created_at)
                VALUES (?, ?, ?, 0, ?)
                ON CONFLICT(email) DO UPDATE SET otp_hash=excluded.otp_hash, expires_at=excluded.expires_at, attempts=0, created_at=excluded.created_at""",
                (body.email, otp_h, expires_at, now()))

        # Send real OTP email
        sent = send_otp_email(body.email, otp, settings)
        if not sent and settings.smtp_host:
            raise HTTPException(500, "Không thể gửi email lúc này. Vui lòng kiểm tra lại cấu hình email hoặc thử lại sau.")

        return {"message": "Mã xác thực OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư đến (hoặc hòm thư rác/spam)."}

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
            if not hmac.compare_digest(reset_row["otp_hash"], token_hash(body.otp.strip())):
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
            if not hmac.compare_digest(reset_row["otp_hash"], token_hash(body.otp.strip())):
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
            return [db.product(conn, row) for row in conn.execute("SELECT * FROM products WHERE active=1 ORDER BY featured DESC, created_at, id")]

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
            return [db.product(conn, row) for row in conn.execute("SELECT * FROM products ORDER BY created_at DESC, id DESC")]

    @app.post("/api/admin/upload", status_code=201)
    async def upload(file: Annotated[UploadFile, File()], user=Depends(admin)):
        content = normalize_image(await file.read(MAX_UPLOAD + 1))
        filename = f"{uuid.uuid4().hex}.jpg"
        storage.put_catalog(filename, content)
        return {"url": f"/media/{filename}"}

    @app.post("/api/admin/products", status_code=201)
    def add_product(body: ProductWrite, user=Depends(admin)):
        fname = body.image_url.rsplit("/", 1)[-1]
        if not (settings.data_dir / "catalog" / fname).is_file():
            storage.get_catalog(fname)
        if not (settings.data_dir / "catalog" / fname).is_file():
            raise HTTPException(400, "Ảnh sản phẩm không tồn tại.")
            raise HTTPException(400, "Ảnh sản phẩm không tồn tại.")
        pid = uuid.uuid4().hex
        with db.connect() as conn:
            conn.execute("""INSERT INTO products (id,name,category,tryon_category,price,original_price,image_url,tag,material,description,colors,sizes,featured,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (pid, body.name, body.category, body.tryon_category, body.price, body.original_price,
                    body.image_url, body.tag, body.material, body.description, json.dumps([c.model_dump() for c in body.colors]), json.dumps(body.sizes), body.featured, now()))
            for size in body.sizes:
                for color in body.colors:
                    conn.execute("INSERT INTO variants VALUES (?,?,?,?)", (pid, size, color.name, body.stock_per_variant))
            return db.product(conn, conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone())

    @app.patch("/api/admin/products/{product_id}")
    def update_product(product_id: str, body: ProductPatch, user=Depends(admin)):
        with db.connect() as conn:
            if not conn.execute("SELECT 1 FROM products WHERE id=?", (product_id,)).fetchone():
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            for field in ("name", "price", "active"):
                value = getattr(body, field)
                if value is not None:
                    conn.execute(f"UPDATE products SET {field}=? WHERE id=?", (value, product_id))
            for v in body.variants or []:
                result = conn.execute("UPDATE variants SET stock=? WHERE product_id=? AND size=? AND color=?", (v.stock, product_id, v.size, v.color))
                if result.rowcount != 1:
                    raise HTTPException(400, "Biến thể màu/size không tồn tại.")
            return db.product(conn, conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone())

    def serialize_order(conn, row):
        items = []
        for item in conn.execute("SELECT * FROM order_items WHERE order_id=?", (row["id"],)):
            review = conn.execute("SELECT actual_fit,notes,updated_at FROM fit_reviews WHERE order_item_id=?", (item["id"],)).fetchone()
            items.append({**dict(item), "fit_review": dict(review) if review else None})
        data = dict(row)
        data.pop("request_key", None)
        data.pop("request_fingerprint", None)
        return {**data, "items": items}

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
            total = 0
            for item in body.items:
                p = conn.execute("SELECT * FROM products WHERE id=? AND active=1", (item.product_id,)).fetchone()
                if not p:
                    raise HTTPException(409, "Một sản phẩm đã ngừng bán. Vui lòng cập nhật giỏ hàng.")
                changed = conn.execute("UPDATE variants SET stock=stock-? WHERE product_id=? AND size=? AND color=? AND stock>=?", (item.quantity, item.product_id, item.size, item.color, item.quantity))
                if changed.rowcount != 1:
                    raise HTTPException(409, f"{p['name']} ({item.size}, {item.color}) không đủ hàng.")
                total += p["price"] * item.quantity
                lines.append((item, p))
            conn.execute("""INSERT INTO orders (id,user_id,customer_name,phone,address,note,total,created_at,request_key,request_fingerprint)
                VALUES (?,?,?,?,?,?,?,?,?,?)""", (oid, user["id"], body.customer_name.strip(), body.phone, body.address.strip(), body.note, total, now(), request_key, fingerprint))
            for item, p in lines:
                conn.execute("""INSERT INTO order_items (order_id,product_id,name,image_url,size,color,quantity,price)
                    VALUES (?,?,?,?,?,?,?,?)""", (oid, p["id"], p["name"], p["image_url"], item.size, item.color, item.quantity, p["price"]))
            conn.execute("UPDATE users SET total_spent = COALESCE(total_spent, 0) + ? WHERE id=?", (total, user["id"]))
            new_spent_row = conn.execute("SELECT total_spent FROM users WHERE id=?", (user["id"],)).fetchone()
            new_spent = new_spent_row[0] if new_spent_row and new_spent_row[0] else 0
            conn.execute("UPDATE users SET vip_tier=? WHERE id=?", (calculate_tier(new_spent), user["id"]))
            return serialize_order(conn, conn.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())

    @app.get("/api/orders")
    def orders(user=Depends(current_user)):
        with db.connect() as conn:
            rows = conn.execute("SELECT * FROM orders ORDER BY created_at DESC") if user["role"] == "admin" else conn.execute("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC", (user["id"],))
            return [serialize_order(conn, row) for row in rows]

    @app.patch("/api/orders/{order_id}")
    def order_status(order_id: str, body: StatusPatch, user=Depends(current_user)):
        transitions = {"pending": {"confirmed", "cancelled"}, "confirmed": {"shipping", "cancelled"}, "shipping": {"completed"}, "completed": set(), "cancelled": set()}
        with db.connect() as conn:
            db.begin_write(conn)
            order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
            if not order or (user["role"] != "admin" and order["user_id"] != user["id"]):
                raise HTTPException(404, "Không tìm thấy đơn hàng.")
            if user["role"] != "admin" and (body.status != "cancelled" or order["status"] != "pending"):
                raise HTTPException(403, "Bạn chỉ có thể hủy đơn đang chờ xác nhận.")
            if body.status not in transitions[order["status"]]:
                raise HTTPException(409, "Không thể chuyển đơn sang trạng thái này.")
            if body.status == "cancelled":
                for item in conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)):
                    conn.execute("UPDATE variants SET stock=stock+? WHERE product_id=? AND size=? AND color=?", (item["quantity"], item["product_id"], item["size"], item["color"]))
            conn.execute("UPDATE orders SET status=? WHERE id=?", (body.status, order_id))
            return serialize_order(conn, conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())

    @app.get("/api/admin/summary")
    def summary(user=Depends(admin)):
        with db.connect() as conn:
            return {"products": conn.execute("SELECT count(*) FROM products WHERE active=1").fetchone()[0],
                "pending_orders": conn.execute("SELECT count(*) FROM orders WHERE status='pending'").fetchone()[0],
                "revenue": conn.execute("SELECT coalesce(sum(total),0) FROM orders WHERE status='completed'").fetchone()[0],
                "tryons": conn.execute("SELECT count(*) FROM tryons WHERE status='completed'").fetchone()[0]}

    @app.post("/api/tryons", status_code=202)
    async def start_tryon(product_id: Annotated[str, Form()], color: Annotated[str, Form()], photo: Annotated[UploadFile, File()], size: Annotated[str, Form()] = "M", request_key: Annotated[str | None, Header(alias="X-Idempotency-Key", min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")] = None, user=Depends(current_user)):
        if not service.engine.enabled:
            raise HTTPException(503, "Phòng thử AI chưa được cấu hình.")
        photo_bytes = normalize_image(await photo.read(MAX_UPLOAD + 1))
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
        if color not in [c["name"] for c in p["colors"]]:
            raise HTTPException(400, "Màu sản phẩm không hợp lệ.")
        if not any(v["size"] == size and v["color"] == color and v["stock"] > 0 for v in p["variants"]):
            raise HTTPException(400, "Size/màu đã chọn không hợp lệ hoặc đã hết hàng.")
        profile = json.loads(profile_row[0]) if profile_row else {}
        # Fallback to standard Asian sizing presets if body measurements are missing or incomplete
        default_size_profiles = {
            "XS": {"height_cm": 160, "weight_kg": 48, "chest_cm": 82, "waist_cm": 66, "hip_cm": 84, "shoulder_cm": 40, "inseam_cm": 72, "fit_preference": "regular"},
            "S": {"height_cm": 165, "weight_kg": 54, "chest_cm": 88, "waist_cm": 72, "hip_cm": 88, "shoulder_cm": 42, "inseam_cm": 74, "fit_preference": "regular"},
            "M": {"height_cm": 170, "weight_kg": 62, "chest_cm": 94, "waist_cm": 78, "hip_cm": 94, "shoulder_cm": 44, "inseam_cm": 76, "fit_preference": "regular"},
            "L": {"height_cm": 175, "weight_kg": 70, "chest_cm": 100, "waist_cm": 84, "hip_cm": 100, "shoulder_cm": 46, "inseam_cm": 78, "fit_preference": "regular"},
            "XL": {"height_cm": 180, "weight_kg": 78, "chest_cm": 106, "waist_cm": 90, "hip_cm": 106, "shoulder_cm": 48, "inseam_cm": 80, "fit_preference": "regular"},
            "2XL": {"height_cm": 185, "weight_kg": 86, "chest_cm": 112, "waist_cm": 96, "hip_cm": 112, "shoulder_cm": 50, "inseam_cm": 82, "fit_preference": "regular"},
        }
        fallback = default_size_profiles.get(size.upper(), default_size_profiles["M"])
        for k, v in fallback.items():
            if profile.get(k) is None:
                profile[k] = v

        # Check quota & VIP tiers
        with db.connect() as conn:
            u_row = conn.execute("SELECT vip_tier, starter_tryons_left, total_spent FROM users WHERE id=?", (user["id"],)).fetchone()
            tier = u_row["vip_tier"] if u_row and u_row["vip_tier"] else "bronze"
            starter_left = u_row["starter_tryons_left"] if u_row and u_row["starter_tryons_left"] is not None else 3
            tier_info = VIP_TIERS.get(tier, VIP_TIERS["bronze"])

            today_prefix = now()[:10]
            used_today = conn.execute(
                "SELECT count(*) FROM tryons WHERE user_id=? AND created_at LIKE ? AND deleted=0 AND status != 'failed'",
                (user["id"], f"{today_prefix}%")
            ).fetchone()[0]

            use_starter = False
            if starter_left > 0:
                use_starter = True
            elif used_today >= tier_info["daily_limit"]:
                next_tier_msg = f"Tích lũy mua sắm để lên {VIP_TIERS[tier_info['next_tier']]['name']} nhận thêm lượt hoặc quay lại vào ngày mai nhé!" if tier_info["next_tier"] else "Vui lòng quay lại vào ngày mai nhé!"
                raise HTTPException(
                    429,
                    f"Bạn đã sử dụng hết hạn mức thử đồ hôm nay ({used_today}/{tier_info['daily_limit']} lượt). {next_tier_msg}"
                )

        check = await run_in_threadpool(analyzer.check, user["id"], photo_bytes)
        if not check["accepted"]:
            raise HTTPException(400, "Ảnh chưa đạt: " + " ".join(check["messages"]))
        job_id = service.start(user["id"], p, color, photo_bytes, size, profile, check, request_key)
        if use_starter:
            with db.connect() as conn:
                conn.execute("UPDATE users SET starter_tryons_left = CASE WHEN starter_tryons_left > 0 THEN starter_tryons_left - 1 ELSE 0 END WHERE id=?", (user["id"],))
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
        with db.connect() as conn:
            db.begin_write(conn)
            row = conn.execute("SELECT * FROM tryons WHERE id=? AND user_id=? AND deleted=0", (job_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy lượt thử đồ.")
            if row["status"] in ("queued", "processing"):
                raise HTTPException(409, "Vui lòng chờ lượt thử kết thúc trước khi xóa ảnh.")
            # Retain a minimal quota tombstone, remove customer image files and secrets.
            for field in ("photo_path", "result_path"):
                if row[field]:
                    from pathlib import Path
                    Path(row[field]).unlink(missing_ok=True)
            for view in json.loads(row["views"]).values():
                for stored_path in (view.get("path"), view.get("candidate_path")):
                    if not stored_path:
                        continue
                    from pathlib import Path
                    Path(stored_path).unlink(missing_ok=True)
            evaluation = conn.execute("SELECT actual_path FROM tryon_evaluations WHERE job_id=?", (job_id,)).fetchone()
            if evaluation:
                from pathlib import Path
                Path(evaluation[0]).unlink(missing_ok=True)
            conn.execute("DELETE FROM tryon_evaluations WHERE job_id=?", (job_id,))
            conn.execute("UPDATE tryons SET deleted=1,photo_path='',result_path=NULL,image_secret='',usage=NULL,views='{}',body_snapshot=NULL,fit_snapshot=NULL,photo_check=NULL WHERE id=?", (job_id,))

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
