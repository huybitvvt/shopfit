"""Purchase-backed feedback; aggregate counts contain no customer images or body measurements."""
import json
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from .db import now
from .sizing import GarmentSize, required_fields


class WardrobeWrite(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    category: Literal["tops", "bottoms", "one-pieces"]
    material: str = Field(default="", max_length=120)
    measurements: GarmentSize

    @model_validator(mode="after")
    def enough_measurements(self):
        if any(getattr(self.measurements, key) is None for key in required_fields(self.category)):
            raise ValueError("Cần ngực cho áo, eo/mông cho quần, cả ba cho váy")
        return self


class FitReviewWrite(BaseModel):
    actual_fit: Literal["tight", "fits", "loose"]
    notes: str = Field(default="", max_length=1000)


def wardrobe_data(row):
    data = dict(row)
    data.pop("user_id", None)
    data["measurements"] = json.loads(data["measurements"])
    return data


def product_feedback(conn, product_id=None):
    where, params = ("AND i.product_id=?", (product_id,)) if product_id else ("", ())
    rows = conn.execute(f"""SELECT i.product_id,i.size,r.actual_fit,count(*) AS n
        FROM fit_reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id
        WHERE o.status='completed' {where} GROUP BY i.product_id,i.size,r.actual_fit""", params).fetchall()
    grouped = {}
    for row in rows:
        group = grouped.setdefault((row["product_id"], row["size"]), {"product_id": row["product_id"], "size": row["size"],
                                   "tight": 0, "fits": 0, "loose": 0, "total": 0})
        group[row["actual_fit"]] += row["n"]
        group["total"] += row["n"]
    return [{**g, "enough_data": g["total"] >= 3,
             "needs_review": g["total"] >= 3 and (g["tight"] + g["loose"]) / g["total"] >= .5} for g in grouped.values()]


def insight_routes(db, settings, current_user, admin):
    api = APIRouter(prefix="/api")

    @api.get("/wardrobe")
    def wardrobe(user=Depends(current_user)):
        with db.connect() as conn:
            return [wardrobe_data(r) for r in conn.execute("SELECT * FROM wardrobe WHERE user_id=? ORDER BY created_at DESC", (user["id"],))]

    @api.post("/wardrobe", status_code=201)
    def add_reference(body: WardrobeWrite, user=Depends(current_user)):
        rid = uuid.uuid4().hex
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT count(*) FROM wardrobe WHERE user_id=?", (user["id"],)).fetchone()[0] >= 30:
                raise HTTPException(400, "Tối đa 30 món đồ tham chiếu. Hãy xóa món không còn dùng.")
            conn.execute("INSERT INTO wardrobe VALUES (?,?,?,?,?,?,?)", (rid, user["id"], body.name.strip(), body.category,
                         body.material.strip(), body.measurements.model_dump_json(exclude={"size"}), now()))
            return wardrobe_data(conn.execute("SELECT * FROM wardrobe WHERE id=?", (rid,)).fetchone())

    @api.delete("/wardrobe/{reference_id}", status_code=204)
    def remove_reference(reference_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            if conn.execute("DELETE FROM wardrobe WHERE id=? AND user_id=?", (reference_id, user["id"])).rowcount != 1:
                raise HTTPException(404, "Không tìm thấy đồ tham chiếu.")

    @api.patch("/wardrobe/{reference_id}")
    def edit_reference(reference_id: str, body: WardrobeWrite, user=Depends(current_user)):
        with db.connect() as conn:
            if conn.execute("UPDATE wardrobe SET name=?,category=?,material=?,measurements=? WHERE id=? AND user_id=?",
                (body.name.strip(), body.category, body.material.strip(), body.measurements.model_dump_json(exclude={"size"}), reference_id, user["id"])).rowcount != 1:
                raise HTTPException(404, "Không tìm thấy đồ tham chiếu.")
            return wardrobe_data(conn.execute("SELECT * FROM wardrobe WHERE id=?", (reference_id,)).fetchone())

    @api.post("/orders/{order_id}/items/{item_id}/fit-review")
    def save_review(order_id: str, item_id: int, body: FitReviewWrite, user=Depends(current_user)):
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("""SELECT o.status FROM orders o JOIN order_items i ON i.order_id=o.id
                WHERE o.id=? AND i.id=? AND o.user_id=?""", (order_id, item_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy sản phẩm trong đơn của bạn.")
            if row["status"] != "completed":
                raise HTTPException(409, "Chỉ đánh giá độ vừa sau khi đơn đã giao hoàn tất.")
            conn.execute("INSERT OR REPLACE INTO fit_reviews VALUES (?,?,?,?,?)", (item_id, user["id"], body.actual_fit, body.notes.strip(), now()))
            return dict(conn.execute("SELECT actual_fit,notes,updated_at FROM fit_reviews WHERE order_item_id=?", (item_id,)).fetchone())

    @api.get("/products/{product_id}/fit-feedback")
    def feedback(product_id: str):
        with db.connect() as conn:
            if not conn.execute("SELECT 1 FROM products WHERE id=? AND active=1", (product_id,)).fetchone():
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            return {"rows": product_feedback(conn, product_id), "source": "completed_orders",
                    "notice": "Cảm nhận tự báo cáo từ đơn đã giao, không phải phép đo hoặc tỷ lệ chính xác của AI. Ít hơn 3 phản hồi/size chưa đủ để nhận định."}

    @api.delete("/orders/{order_id}/items/{item_id}/fit-review", status_code=204)
    def remove_review(order_id: str, item_id: int, user=Depends(current_user)):
        with db.connect() as conn:
            if not conn.execute("SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=? AND o.id=? AND o.user_id=?", (item_id, order_id, user["id"])).fetchone():
                raise HTTPException(404, "Không tìm thấy sản phẩm trong đơn của bạn.")
            conn.execute("DELETE FROM fit_reviews WHERE order_item_id=? AND user_id=?", (item_id, user["id"]))

    @api.get("/admin/fit-insights")
    def insights(user=Depends(admin)):
        with db.connect() as conn:
            rows = product_feedback(conn)
            for row in rows:
                row["name"] = conn.execute("SELECT name FROM products WHERE id=?", (row["product_id"],)).fetchone()[0]
            counts = conn.execute("""SELECT count(*) AS total, sum(status='completed') AS completed,
                sum(status='partial') AS partial, sum(status='failed') AS failed,avg(duration_ms) AS average_ms FROM tryons WHERE deleted=0""").fetchone()
            return {"rows": rows, "review_count": sum(r["total"] for r in rows), "tryons": dict(counts),
                    "recent_reviews": [dict(r) for r in conn.execute("""SELECT i.product_id,i.name,i.size,i.color,r.actual_fit,r.notes,r.updated_at
                        FROM fit_reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id
                        WHERE o.status='completed' ORDER BY r.updated_at DESC LIMIT 20""")],
                    "catalog": {"total": conn.execute("SELECT count(*) FROM products WHERE active=1").fetchone()[0],
                                "measured": sum(bool(json.loads(r[0]).get("verified")) for r in conn.execute("SELECT size_chart FROM products WHERE active=1"))},
                    "notice": "Mỗi dòng sản phẩm trong đơn chỉ tính một phản hồi; sửa đánh giá không tăng mẫu. Cờ cần kiểm tra: tối thiểu 3 mẫu và ít nhất 50% chật/rộng. Không tự sửa bảng số đo."}

    return api
