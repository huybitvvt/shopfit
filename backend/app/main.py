import hmac
import hashlib
import json
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .db import Database, now
from .security import hash_password, token_hash, verify_password
from .tryon import MAX_UPLOAD, TryOnService, normalize_image
from .photo_checks import PhotoAnalyzer
from .fitting_routes import fitting_routes
from .sizing import required_fields
from .insights import insight_routes
from .ai_usage import AIUsage


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email không hợp lệ")
        return value


class Register(Login):
    name: str = Field(min_length=2, max_length=80)


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


def create_app(settings: Settings | None = None, engine=None, analyzer=None):
    settings = settings or Settings()
    db = Database(settings)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "catalog").mkdir(exist_ok=True)
    usage = AIUsage(db, settings)
    analyzer = analyzer or PhotoAnalyzer(db, settings, usage)
    service = TryOnService(db, settings, engine, analyzer, usage)

    @asynccontextmanager
    async def lifespan(app):
        db.initialize()
        service.recover()
        yield
        service.close()

    app = FastAPI(title="ShopFit API", version="0.1.0", lifespan=lifespan)
    app.state.db = db
    app.state.tryon = service
    app.state.photo_analyzer = analyzer
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "X-Idempotency-Key"])
    app.mount("/media", StaticFiles(directory=settings.data_dir / "catalog"), name="catalog")

    def current_user(authorization: Annotated[str | None, Header()] = None):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Vui lòng đăng nhập để tiếp tục.")
        with db.connect() as conn:
            row = conn.execute("""SELECT u.id,u.name,u.email,u.role FROM users u JOIN sessions s ON s.user_id=u.id
                WHERE s.token_hash=? AND s.expires_at>?""", (token_hash(authorization[7:]), int(time.time()))).fetchone()
        if not row:
            raise HTTPException(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
        return dict(row)

    def admin(user=Depends(current_user)):
        if user["role"] != "admin":
            raise HTTPException(403, "Chỉ chủ shop được thực hiện thao tác này.")
        return user

    def issue_session(conn, user):
        token = secrets.token_urlsafe(48)
        conn.execute("INSERT INTO sessions VALUES (?,?,?)", (token_hash(token), user["id"], int(time.time()) + 7 * 86400))
        return {"token": token, "user": {k: user[k] for k in ("id", "name", "email", "role")}}

    @app.get("/api/health")
    def health():
        return {"status": "ok", "ai_ready": service.engine.enabled, "engine": "openvto", "model": settings.image_model, "demo_accounts": settings.seed_demo}

    @app.post("/api/auth/register", status_code=201)
    def register(body: Register):
        with db.connect() as conn:
            if conn.execute("SELECT 1 FROM users WHERE email=?", (body.email,)).fetchone():
                raise HTTPException(409, "Email này đã được đăng ký.")
            user = {"id": uuid.uuid4().hex, "name": body.name.strip(), "email": body.email, "role": "customer"}
            try:
                conn.execute("INSERT INTO users VALUES (?,?,?,?,?,?)", (user["id"], user["name"], user["email"], hash_password(body.password), "customer", now()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "Email này đã được đăng ký.")
            return issue_session(conn, user)

    @app.post("/api/auth/login")
    def login(body: Login):
        with db.connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE email=?", (body.email,)).fetchone()
            if not user or not verify_password(body.password, user["password_hash"]):
                raise HTTPException(401, "Email hoặc mật khẩu chưa đúng.")
            return issue_session(conn, user)

    @app.get("/api/auth/me")
    def me(user=Depends(current_user)):
        return user

    @app.post("/api/auth/logout", status_code=204)
    def logout(user=Depends(current_user), authorization: Annotated[str, Header()] = ""):
        with db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(authorization[7:]),))

    @app.get("/api/products")
    def products():
        with db.connect() as conn:
            return [db.product(conn, row) for row in conn.execute("SELECT * FROM products WHERE active=1 ORDER BY featured DESC, rowid")]

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
            return [db.product(conn, row) for row in conn.execute("SELECT * FROM products ORDER BY rowid DESC")]

    @app.post("/api/admin/upload", status_code=201)
    async def upload(file: Annotated[UploadFile, File()], user=Depends(admin)):
        content = normalize_image(await file.read(MAX_UPLOAD + 1))
        filename = f"{uuid.uuid4().hex}.jpg"
        (settings.data_dir / "catalog" / filename).write_bytes(content)
        return {"url": f"/media/{filename}"}

    @app.post("/api/admin/products", status_code=201)
    def add_product(body: ProductWrite, user=Depends(admin)):
        if not (settings.data_dir / "catalog" / body.image_url.rsplit("/", 1)[-1]).is_file():
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
            conn.execute("BEGIN IMMEDIATE")
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
            conn.execute("BEGIN IMMEDIATE")
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
        profile = json.loads(profile_row[0]) if profile_row else None
        if not profile or any(profile.get(k) is None for k in required_fields(p["tryon_category"])):
            raise HTTPException(400, "Hãy lưu hồ sơ cơ thể và bổ sung số đo ngực/eo/mông cần thiết trước khi tạo ảnh.")
        check = await run_in_threadpool(analyzer.check, user["id"], photo_bytes)
        if not check["accepted"]:
            raise HTTPException(400, "Ảnh chưa đạt: " + " ".join(check["messages"]))
        job_id = service.start(user["id"], p, color, photo_bytes, size, profile, check, request_key)
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
            conn.execute("BEGIN IMMEDIATE")
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
        if not path:
            raise HTTPException(404, "Ảnh chưa sẵn sàng.")
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"})

    app.include_router(fitting_routes(db, settings, current_user, admin, service, analyzer))
    app.include_router(insight_routes(db, settings, current_user, admin))
    return app


app = create_app()
