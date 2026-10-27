import json
import time
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .db import now
from .sizing import BodyProfile, SizeChart, advise, required_fields
from .tryon import MAX_UPLOAD, normalize_image
from .insights import wardrobe_data


class AdviceRequest(BaseModel):
    color: str = Field(max_length=40)
    reference_id: str | None = Field(default=None, max_length=40)


def fitting_routes(db, settings, current_user, admin, service, analyzer):
    api = APIRouter(prefix="/api")

    def owned_job(conn, job_id, user):
        row = conn.execute("SELECT * FROM tryons WHERE id=? AND user_id=? AND deleted=0", (job_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Không tìm thấy lượt thử.")
        return row

    @api.get("/body-profile")
    def body_profile(user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM body_profiles WHERE user_id=?", (user["id"],)).fetchone()
        return {"profile": json.loads(row["profile"]) if row else None, "updated_at": row["updated_at"] if row else None}

    @api.patch("/body-profile")
    def save_profile(body: BodyProfile, user=Depends(current_user)):
        updated = now()
        with db.connect() as conn:
            conn.execute("INSERT OR REPLACE INTO body_profiles VALUES (?,?,?)", (user["id"], body.model_dump_json(), updated))
        return {"profile": body.model_dump(), "updated_at": updated}

    @api.delete("/body-profile", status_code=204)
    def remove_profile(user=Depends(current_user)):
        with db.connect() as conn:
            conn.execute("DELETE FROM body_profiles WHERE user_id=?", (user["id"],))

    @api.post("/products/{product_id}/size-advice")
    def size_advice(product_id: str, body: AdviceRequest, user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM products WHERE id=? AND active=1", (product_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            product = db.product(conn, row)
            profile = conn.execute("SELECT profile FROM body_profiles WHERE user_id=?", (user["id"],)).fetchone()
            reference = None
            if body.reference_id:
                reference_row = conn.execute("SELECT * FROM wardrobe WHERE id=? AND user_id=?", (body.reference_id, user["id"])).fetchone()
                if not reference_row:
                    raise HTTPException(404, "Không tìm thấy đồ tham chiếu của bạn.")
                reference = wardrobe_data(reference_row)
        if body.color not in [c["name"] for c in product["colors"]]:
            raise HTTPException(400, "Màu không hợp lệ.")
        return advise(product, json.loads(profile[0]) if profile else None, body.color, reference)

    @api.patch("/admin/products/{product_id}/size-chart")
    def update_chart(product_id: str, chart: SizeChart, user=Depends(admin)):
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy sản phẩm.")
            sizes = json.loads(row["sizes"])
            if any(r.size not in sizes for r in chart.rows):
                raise HTTPException(400, "Bảng số đo có size không thuộc sản phẩm.")
            if chart.verified and (set(r.size for r in chart.rows) != set(sizes) or any(
                    getattr(r, key) is None for r in chart.rows for key in required_fields(row["tryon_category"]))):
                raise HTTPException(400, "Cần đủ size và số đo bắt buộc trước khi xác nhận bảng đã đo thực tế.")
            if chart.back_image_url and not (settings.data_dir / "catalog" / Path(chart.back_image_url).name).is_file():
                raise HTTPException(400, "Ảnh mặt sau sản phẩm chưa được tải lên.")
            conn.execute("UPDATE products SET size_chart=? WHERE id=?", (chart.model_dump_json(), product_id))
            return db.product(conn, conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone())

    @api.post("/photo-check")
    async def check_photo(photo: Annotated[UploadFile, File()], user=Depends(current_user)):
        image = normalize_image(await photo.read(MAX_UPLOAD + 1))
        return await run_in_threadpool(analyzer.check, user["id"], image)

    @api.post("/tryons/{job_id}/retry", status_code=202)
    def retry(job_id: str, request_key: Annotated[str | None, Header(alias="X-Idempotency-Key", min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")] = None, user=Depends(current_user)):
        service.retry(job_id, user["id"], request_key)
        with db.connect() as conn:
            return service.serialize(owned_job(conn, job_id, user))

    @api.get("/ai-quota")
    def quota(user=Depends(current_user)):
        with db.connect() as conn:
            used = conn.execute("SELECT coalesce(sum(1+retry_count),0) FROM tryons WHERE user_id=? AND substr(created_at,1,10)=?", (user["id"], now()[:10])).fetchone()[0]
        return {"date_utc": now()[:10], "used": used, "limit": settings.daily_limit, "remaining": max(0, settings.daily_limit - used)}

    @api.get("/admin/ai-usage")
    def ai_usage(user=Depends(admin)):
        return service.usage.summary()

    def evaluation_data(row, job):
        data = dict(row)
        data.pop("actual_path", None)
        expires = int(time.time()) + 3600
        sig = service.image_signature(job, "actual", expires)
        data["actual_url"] = f"/api/tryons/{job['id']}/image/actual?expires={expires}&signature={sig}"
        return data

    @api.get("/tryons/{job_id}/evaluation")
    def get_evaluation(job_id: str, user=Depends(current_user)):
        with db.connect() as conn:
            job = owned_job(conn, job_id, user)
            row = conn.execute("SELECT * FROM tryon_evaluations WHERE job_id=?", (job_id,)).fetchone()
        return evaluation_data(row, job) if row else None

    @api.post("/tryons/{job_id}/evaluation")
    async def save_evaluation(
        job_id: str, photo: Annotated[UploadFile, File()],
        identity_score: Annotated[int, Form(ge=1, le=5)], garment_score: Annotated[int, Form(ge=1, le=5)],
        fit_score: Annotated[int, Form(ge=1, le=5)], actual_fit: Annotated[Literal["tight", "fits", "loose"], Form()],
        notes: Annotated[str, Form(max_length=1000)] = "", user=Depends(current_user),
    ):
        image = normalize_image(await photo.read(MAX_UPLOAD + 1))
        with db.connect() as conn:
            # Serialize against deletion so a concurrent upload cannot resurrect deleted personal files.
            conn.execute("BEGIN IMMEDIATE")
            job = owned_job(conn, job_id, user)
            if not job["result_path"] or job["status"] in ("queued", "processing"):
                raise HTTPException(409, "Cần có ảnh AI hoàn tất trước khi đối chiếu.")
            path = settings.data_dir / "private" / f"{job_id}-actual.jpg"
            path.write_bytes(image)
            conn.execute("INSERT OR REPLACE INTO tryon_evaluations VALUES (?,?,?,?,?,?,?,?)",
                         (job_id, str(path), identity_score, garment_score, fit_score, actual_fit, notes, now()))
            row = conn.execute("SELECT * FROM tryon_evaluations WHERE job_id=?", (job_id,)).fetchone()
        return evaluation_data(row, job)

    return api
