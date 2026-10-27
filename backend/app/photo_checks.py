import hashlib
import io
import json
import time

from fastapi import HTTPException
from PIL import Image
from pydantic import BaseModel, Field


class Inspection(BaseModel):
    person_count: int = Field(ge=0, le=20)
    full_body_visible: bool
    front_facing: bool
    standing_straight: bool
    clear_lighting: bool
    sharp: bool = Field(description="Person and clothing are clear enough for try-on. False only for severe blur or pixelation that makes body/clothing details unreadable; mild softness or compression is acceptable.")
    body_unobstructed: bool


class ViewInspection(BaseModel):
    outfit_consistent: bool = Field(description="Same garment type, color, sleeve length and visible design as the front reference")
    person_consistent: bool = Field(description="Consistent visible body shape, skin tone, head and hair; no need to identify anyone")
    angle_correct: bool = Field(description="Candidate matches the explicitly requested camera view")
    full_body_visible: bool
    other_clothing_consistent: bool = Field(description="Unchanged non-target clothing and footwear; same shoe type, color and sole, no barefoot substitution")


class FrontInspection(BaseModel):
    full_body_visible: bool = Field(description="Entire head and both feet including shoes fully visible, not cropped at knees or ankles")
    front_facing: bool
    body_consistent: bool = Field(description="Visible body proportions, skin tone, head and hair remain consistent")
    garment_matches: bool = Field(description="Target garment type, cut and requested color match the catalog")
    other_clothing_preserved: bool = Field(description="Non-target clothing and shoes retain their original type and color")


class PhotoAnalyzer:
    def __init__(self, db, settings, usage=None):
        self.db, self.settings, self.usage = db, settings, usage

    def inspect(self, photo):
        from google import genai
        from google.genai import types

        if not self.settings.gemini_api_key:
            raise HTTPException(503, "Chưa cấu hình dịch vụ kiểm tra ảnh.")
        try:
            call_id = self.usage.reserve("vision") if self.usage else None
            with genai.Client(api_key=self.settings.gemini_api_key, http_options=types.HttpOptions(timeout=45000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
                response = client.models.generate_content(
                    model=self.settings.vision_model,
                    contents=[types.Part.from_bytes(data=photo, mime_type="image/jpeg"),
                              "Inspect this photo for a full-body clothing try-on. Count visible people; check head and feet "
                              "are fully visible, front facing, standing upright, adequate lighting, "
                              "and no significant body occlusion. Judge practical usability rather than studio-photo quality: "
                              "set sharp=false only for severe blur or pixelation that makes the person or clothing unreadable. "
                              "Do not reject a clear image solely for small pixel dimensions, mild softness or JPEG compression. "
                              "A casual hand gesture, hat or headphones alone is not significant body occlusion. "
                              "Do not estimate body measurements or identify the person."],
                    config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=Inspection, temperature=0),
                )
                result = Inspection.model_validate_json(response.text).model_dump()
                if call_id:
                    self.usage.finish(call_id, "completed")
                return result
        except HTTPException:
            raise
        except Exception:
            if self.usage and 'call_id' in locals() and call_id:
                self.usage.finish(call_id, "failed")
            raise HTTPException(503, "Chưa kiểm tra được ảnh. Vui lòng thử lại sau, chưa có lượt tạo ảnh nào được chạy.")

    def validate_view(self, front, candidate, angle):
        from google import genai
        from google.genai import types

        direction = {"left": "left profile, nose pointing to the LEFT edge", "right": "right profile, nose pointing to the RIGHT edge",
                     "back": "back view, face turned fully away"}[angle]
        with genai.Client(api_key=self.settings.gemini_api_key, http_options=types.HttpOptions(timeout=45000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
            response = client.models.generate_content(
                model=self.settings.vision_model,
                contents=[types.Part.from_bytes(data=front, mime_type="image/jpeg"),
                          types.Part.from_bytes(data=candidate, mime_type="image/jpeg"),
                          "Compare reference FRONT try-on (image 1) to candidate angle (image 2). "
                          f"Requested candidate view: {direction}. Check outfit consistency particularly garment type, "
                          "color, sleeve length; reject a hoodie if the reference is a T-shirt. Check visible body "
                          "characteristics remain consistent, not personal identity. Do not infer unseen original details. "
                          "Compare footwear and all non-target clothing: reject removed shoes, barefoot substitution or different shoe type/color/sole. "
                          "Do not require pixel-identical folds or background. Evaluate image 2 only for the requested angle."],
                config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=ViewInspection, temperature=0),
            )
            report = ViewInspection.model_validate_json(response.text).model_dump()
        return {"accepted": all(report.values()), "checks": report}

    def validate_front(self, original, candidate, garment, category, color):
        from google import genai
        from google.genai import types
        with genai.Client(api_key=self.settings.gemini_api_key, http_options=types.HttpOptions(timeout=45000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
            response = client.models.generate_content(
                model=self.settings.vision_model,
                contents=[types.Part.from_bytes(data=original, mime_type="image/jpeg"),
                          types.Part.from_bytes(data=candidate, mime_type="image/jpeg"),
                          types.Part.from_bytes(data=garment, mime_type="image/jpeg"),
                          f"Image 1 original person; image 2 FRONT try-on candidate; image 3 catalog. Target: {category}, color {color}. "
                          "Inspect image 2: full head to toe with BOTH complete feet/shoes visible (reject any cropped legs/feet), "
                          "front facing, consistent visible body proportions, matching target garment type/cut/color. "
                          "All NON-target clothing and footwear must remain as in image 1, including shoe type, color and sole. "
                          "Do not identify the person or estimate physical size accuracy."],
                config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=FrontInspection, temperature=0),
            )
            report = FrontInspection.model_validate_json(response.text).model_dump()
        return {"accepted": all(report.values()), "checks": report}

    def check(self, user_id, photo):
        digest = hashlib.sha256(photo).hexdigest()
        with self.db.connect() as conn:
            cached = conn.execute("SELECT report FROM photo_checks WHERE user_id=? AND digest=? AND expires_at>?",
                                  (user_id, digest, int(time.time()))).fetchone()
        with Image.open(io.BytesIO(photo)) as image:
            width, height = image.size
        resolution_ok = width >= 512 and height >= 768
        # Reapply the current policy to cached observations, including reports made
        # before low resolution became advisory. Do not repeat a paid inspection.
        inspection = json.loads(cached[0])["checks"] if cached else self.inspect(photo)
        messages = []
        warnings = []
        if not resolution_ok:
            warnings.append(f"Ảnh {width} × {height} px hơi nhỏ; vẫn có thể thử đồ nếu đủ rõ. Ảnh gốc lớn hơn sẽ giúp giữ chi tiết tốt hơn.")
        rules = [(inspection["person_count"] == 1, "Ảnh chỉ có một người."),
                 (inspection["full_body_visible"], "Giữ trọn đầu và bàn chân trong khung ảnh."),
                 (inspection["front_facing"], "Đứng nhìn thẳng vào máy ảnh."),
                 (inspection["standing_straight"], "Đứng thẳng, hai tay cách nhẹ khỏi thân."),
                 (inspection["clear_lighting"], "Chụp nơi đủ sáng, tránh ngược sáng."),
                 (inspection["sharp"], "Ảnh quá mờ, không nhìn rõ người và trang phục. Chọn ảnh rõ hơn hoặc chụp lại."),
                 (inspection["body_unobstructed"], "Bỏ túi xách và vật che thân người.")]
        for valid, message in rules:
            if not valid:
                messages.append(message)
        report = {"accepted": not messages, "messages": messages, "warnings": warnings, "checks": inspection, "resolution_ok": resolution_ok}
        if not cached:
            with self.db.connect() as conn:
                conn.execute("DELETE FROM photo_checks WHERE expires_at<?", (int(time.time()),))
                conn.execute("INSERT OR REPLACE INTO photo_checks VALUES (?,?,?,?)",
                             (user_id, digest, json.dumps(report), int(time.time()) + 900))
        return report
