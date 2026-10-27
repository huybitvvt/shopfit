"""Explicit paid integration check using OpenVTO's synthetic, bundled avatar.

Run from backend: .venv/Scripts/python scripts/verify_four_views.py --live
Makes one vision check and up to four image generations. Never retries paid calls.
"""
import argparse
import json
import sys
import time
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", required=True, help="Explicitly allow paid Gemini calls")
    parser.add_argument("--api", default="http://localhost:8000")
    args = parser.parse_args()
    settings = Settings()
    artifacts = Path(__file__).resolve().parents[2] / "artifacts"
    artifacts.mkdir(exist_ok=True)
    avatar = Path(__file__).resolve().parents[1] / "vendor/openvto/openvto/assets/avatars/1.png"
    with httpx.Client(base_url=args.api, timeout=70) as client:
        session = client.post("/api/auth/login", json={"email": "khach@shopfit.local", "password": settings.customer_password})
        session.raise_for_status()
        client.headers["Authorization"] = "Bearer " + session.json()["token"]
        previous = client.get("/api/body-profile").json()["profile"]
        try:
            # Illustrative test context, not measured dimensions of the synthetic avatar.
            client.patch("/api/body-profile", json={"height_cm": 178, "weight_kg": 78, "chest_cm": 100,
                         "waist_cm": 86, "hip_cm": 102, "fit_preference": "regular"}).raise_for_status()
            photo = avatar.read_bytes()
            checked = client.post("/api/photo-check", files={"photo": ("avatar.png", photo, "image/png")})
            checked.raise_for_status()
            report = {"synthetic_avatar": True, "illustrative_measurements": True, "photo_check": checked.json()}
            if not checked.json()["accepted"]:
                (artifacts / "four-view-live-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                raise RuntimeError("Input rejected; no image generation started")
            product = client.get("/api/products/everyday-tee").json()
            color = product["colors"][0]["name"]
            started = client.post("/api/tryons", data={"product_id": product["id"], "color": color, "size": "L"},
                                  headers={"X-Idempotency-Key": uuid.uuid4().hex},
                                  files={"photo": ("avatar.png", photo, "image/png")})
            started.raise_for_status()
            job_id = started.json()["id"]
            print("Started four-view integration check:", job_id, flush=True)
            deadline, last = time.monotonic() + 600, None
            while time.monotonic() < deadline:
                response = client.get(f"/api/tryons/{job_id}")
                response.raise_for_status()
                job = response.json()
                state = (job["status"], [v["status"] for v in job["views"]])
                if state != last:
                    print(state, flush=True)
                    last = state
                if job["status"] not in ("queued", "processing"):
                    break
                time.sleep(2)
            paths = []
            for view in job["views"]:
                if view["url"]:
                    image = client.get(view["url"])
                    image.raise_for_status()
                    path = artifacts / f"four-view-{view['angle']}.jpg"
                    path.write_bytes(image.content)
                    paths.append(path.name)
            report.update({"job_id": job_id, "status": job["status"], "duration_ms": job["duration_ms"],
                           "views": [{"angle": v["angle"], "status": v["status"]} for v in job["views"]],
                           "model": job["model"], "files": paths})
            (artifacts / "four-view-live-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps({"status": job["status"], "images_saved": len(paths), "duration_ms": job["duration_ms"]}), flush=True)
            if job["status"] != "completed":
                raise RuntimeError("Four-view check incomplete; no automatic retry performed")
        finally:
            if previous:
                client.patch("/api/body-profile", json=previous).raise_for_status()
            else:
                client.delete("/api/body-profile").raise_for_status()


if __name__ == "__main__":
    main()
