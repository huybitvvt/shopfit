"""Persist reservations before paid requests; failed/uncertain calls still consume the local budget."""
import uuid

from fastapi import HTTPException

from .db import now


class AIUsage:
    def __init__(self, db, settings):
        self.db, self.settings = db, settings

    def reserve(self, kind, job_id=None, angle=None):
        estimate = self.settings.image_estimate_usd if kind == "image" else self.settings.vision_estimate_usd
        limit = self.settings.image_daily_limit if kind == "image" else self.settings.vision_daily_limit
        if estimate <= 0 or self.settings.budget_usd <= 0:
            raise HTTPException(503, "Ngân sách AI chưa được shop cấu hình hợp lệ.")
        with self.db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            count = conn.execute("SELECT count(*) FROM ai_calls WHERE substr(created_at,1,10)=? AND kind=?", (now()[:10], kind)).fetchone()[0]
            total = conn.execute("SELECT coalesce(sum(estimated_usd),0) FROM ai_calls WHERE substr(created_at,1,10)=?", (now()[:10],)).fetchone()[0]
            if count >= limit or total + estimate > self.settings.budget_usd + 1e-9:
                raise HTTPException(429, "Shop đã chạm hạn mức/ngân sách dự trù AI hôm nay. Ảnh đã có được giữ lại.")
            call_id = uuid.uuid4().hex
            conn.execute("INSERT INTO ai_calls VALUES (?,?,?,?,?,?,?,NULL)", (call_id, job_id, kind, angle, "started", estimate, now()))
        return call_id

    def finish(self, call_id, status):
        with self.db.connect() as conn:
            conn.execute("UPDATE ai_calls SET status=?,completed_at=? WHERE id=?", (status, now(), call_id))

    def call(self, kind, function, *args, job_id=None, angle=None):
        call_id = self.reserve(kind, job_id, angle)
        try:
            result = function(*args)
            self.finish(call_id, "completed")
            return result
        except Exception:
            self.finish(call_id, "failed")
            raise

    def summary(self):
        with self.db.connect() as conn:
            rows = conn.execute("SELECT kind,status,count(*) AS count,sum(estimated_usd) AS estimate FROM ai_calls WHERE substr(created_at,1,10)=? GROUP BY kind,status", (now()[:10],)).fetchall()
        return {"date_utc": now()[:10], "calls": [dict(r) for r in rows],
                "estimated_usd": round(sum(r["estimate"] for r in rows), 4), "budget_usd": self.settings.budget_usd,
                "image_limit": self.settings.image_daily_limit, "vision_limit": self.settings.vision_daily_limit,
                "notice": "Dự trù theo giá cấu hình, không phải hóa đơn Google. Lời gọi lỗi/gián đoạn vẫn giữ dự trù; đối chiếu billing nhà cung cấp để biết phí thực."}
