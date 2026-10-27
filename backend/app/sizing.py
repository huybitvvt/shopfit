"""Deterministic size advice: body circumferences versus finished garment measurements."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

LABELS = {"chest_cm": "Vòng ngực", "waist_cm": "Vòng eo", "hip_cm": "Vòng mông"}


class BodyProfile(BaseModel):
    model_config = {"allow_inf_nan": False}
    height_cm: float = Field(ge=120, le=220)
    weight_kg: float = Field(ge=30, le=250)
    chest_cm: float | None = Field(default=None, ge=40, le=200)
    waist_cm: float | None = Field(default=None, ge=40, le=200)
    hip_cm: float | None = Field(default=None, ge=40, le=220)
    shoulder_cm: float | None = Field(default=None, ge=20, le=80)
    inseam_cm: float | None = Field(default=None, ge=30, le=120)
    fit_preference: Literal["slim", "regular", "relaxed"] = "regular"


class GarmentSize(BaseModel):
    model_config = {"allow_inf_nan": False}
    size: str = Field(min_length=1, max_length=10)
    chest_cm: float | None = Field(default=None, ge=40, le=240)
    waist_cm: float | None = Field(default=None, ge=40, le=240)
    hip_cm: float | None = Field(default=None, ge=40, le=240)
    length_cm: float | None = Field(default=None, ge=10, le=180)
    shoulder_cm: float | None = Field(default=None, ge=20, le=100)
    inseam_cm: float | None = Field(default=None, ge=10, le=120)


class Ease(BaseModel):
    model_config = {"allow_inf_nan": False}
    chest_cm: float = Field(default=8, ge=0, le=40)
    waist_cm: float = Field(default=4, ge=0, le=40)
    hip_cm: float = Field(default=6, ge=0, le=40)


class SizeChart(BaseModel):
    rows: list[GarmentSize] = Field(max_length=10)
    verified: bool = False
    ease: Ease = Field(default_factory=Ease)
    back_image_url: str | None = Field(default=None, pattern=r"^/media/[a-f0-9]{32}\.jpg$")

    @model_validator(mode="after")
    def unique(self):
        if len({r.size for r in self.rows}) != len(self.rows):
            raise ValueError("Size không được trùng")
        return self


def required_fields(category):
    return {"tops": ["chest_cm"], "bottoms": ["waist_cm", "hip_cm"],
            "one-pieces": ["chest_cm", "waist_cm", "hip_cm"]}[category]


def fit_region(gap, target):
    if gap < target:
        return "below_target"
    return "above_target" if gap > target + 4 else "target"


def compare_garment(product, reference):
    if not reference:
        return None
    if reference["category"] != product["tryon_category"]:
        return {"status": "different_category", "name": reference["name"], "rows": []}
    measurements = reference["measurements"]
    keys = required_fields(product["tryon_category"]) + ["length_cm", "shoulder_cm", "inseam_cm"]
    rows = []
    for row in product["size_chart"]["rows"]:
        checks = [{"key": key, "label": {**LABELS, "length_cm": "Dài sản phẩm", "shoulder_cm": "Ngang vai", "inseam_cm": "Dài chân trong"}[key],
                   "reference_cm": measurements[key], "garment_cm": row[key], "difference_cm": round(row[key] - measurements[key], 1)}
                  for key in keys if row.get(key) is not None and measurements.get(key) is not None]
        rows.append({"size": row["size"], "checks": checks})
    return {"status": "available", "id": reference["id"], "name": reference["name"], "material": reference["material"], "rows": rows,
            "warning": "So sánh số đo với đồ bạn mặc vừa; cần cùng cách đo, phom và chất liệu tương đương. Không kết luận chỉ từ nhãn size."}


def advise(product, profile, color, reference=None):
    required = required_fields(product["tryon_category"])
    chart = product["size_chart"]
    result = {"status": "available", "recommended_size": None, "candidates": [], "missing": [], "warnings": [],
              "comparison": compare_garment(product, reference), "regions": {}}
    if not chart["verified"]:
        result["warnings"].append("Bảng số đo minh họa/chưa được shop xác nhận. Chưa dùng để kết luận độ vừa thực tế.")
    result["warnings"].append("Không mô phỏng độ co giãn, độ rủ vải hay áp lực lên cơ thể; cần thử mặc để đối chiếu.")
    if not profile:
        return {**result, "status": "needs_profile", "missing": required}
    missing = [key for key in required if profile.get(key) is None]
    if missing:
        return {**result, "status": "needs_measurements", "missing": missing}
    if not chart["rows"]:
        return {**result, "status": "needs_chart"}
    adjustment = {"slim": -2, "regular": 0, "relaxed": 4}[profile["fit_preference"]]
    for row in chart["rows"]:
        # Show measured regions even for an unavailable size, but never recommend out-of-stock variants.
        region_checks = []
        for key in required:
            if row.get(key) is None:
                continue
            gap = round(row[key] - profile[key], 1)
            target = max(0, chart["ease"][key] + adjustment)
            region_checks.append({"key": key, "label": LABELS[key], "body_cm": profile[key], "garment_cm": row[key],
                                  "ease_cm": gap, "target_cm": target, "too_tight": gap < 0, "region": fit_region(gap, target)})
        result["regions"][row["size"]] = region_checks
        if any(row.get(k) is None for k in required):
            continue
        if not any(v["size"] == row["size"] and v["color"] == color and v["stock"] > 0 for v in product["variants"]):
            continue
        checks = region_checks
        eligible = all(c["ease_cm"] >= c["target_cm"] for c in checks)
        score = sum(abs(c["ease_cm"] - c["target_cm"]) for c in checks)
        result["candidates"].append({"size": row["size"], "eligible": eligible, "score": round(score, 2), "checks": checks})
    eligible = [c for c in result["candidates"] if c["eligible"]]
    if eligible:
        result["recommended_size"] = min(eligible, key=lambda c: c["score"])["size"]
    else:
        result["status"] = "no_fit" if result["candidates"] else "needs_chart_or_stock"
    return result


def demo_chart(product):
    """Explicitly unverified seed data, never passed off as measurements of stock photos."""
    rows = []
    for i, size in enumerate(product["sizes"]):
        row = {"size": size, "chest_cm": 96 + i * 4, "waist_cm": 76 + i * 4,
               "hip_cm": 96 + i * 4, "length_cm": 66 + i * 2}
        if product["tryon_category"] == "bottoms":
            row["length_cm"] = 98 + i * 2
            row["inseam_cm"] = 72 + i * 2
        rows.append(row)
    return SizeChart(rows=rows).model_dump()
