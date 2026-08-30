from io import BytesIO
from pathlib import Path
from typing import List

import trimesh
from fastapi import FastAPI
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from shapely.geometry import box
from shapely.ops import unary_union

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="AAC Keyguard Generator", version="0.1.0")

PRESETS = {
    "ipad-7": {"label": "iPad 7", "width_mm": 207.82, "height_mm": 155.86, "pixels": [2160, 1620]},
    "ipad-8": {"label": "iPad 8", "width_mm": 207.82, "height_mm": 155.86, "pixels": [2160, 1620]},
    "ipad-9": {"label": "iPad 9", "width_mm": 207.82, "height_mm": 155.86, "pixels": [2160, 1620]},
    "ipad-10": {"label": "iPad 10", "width_mm": 227.06, "height_mm": 157.79, "pixels": [2360, 1640]},
}


class Hole(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class ModelRequest(BaseModel):
    preset: str = "ipad-9"
    holes: List[Hole] = []
    ears: bool = False
    body_thickness_mm: float | None = None
    ear_thickness_mm: float = 0.8
    ear_extension_mm: float = 16.0
    ear_height_mm: float = 22.0


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/presets")
def presets():
    return PRESETS


def build_plate(payload: ModelRequest) -> trimesh.Trimesh:
    preset = PRESETS[payload.preset]
    width = preset["width_mm"]
    height = preset["height_mm"]
    thickness = payload.body_thickness_mm or (5.0 if payload.ears else 3.0)

    plate = box(0, 0, width, height)
    holes = []
    for h in payload.holes:
        x = h.x * width
        y = h.y * height
        w = h.w * width
        hh = h.h * height
        # 有耳朵時，成品會反向蓋上去：先鏡像孔位，再建立耳朵。
        if payload.ears:
            x = width - x - w
        holes.append(box(x, y, x + w, y + hh))

    if holes:
        plate = plate.difference(unary_union(holes))

    body = trimesh.creation.extrude_polygon(plate, height=thickness)

    if not payload.ears:
        return body

    # 第一版耳朵：左右各一片薄耳，之後會依既有成功 STL 再精修輪廓與孔位。
    cy = height / 2
    ear_h = payload.ear_height_mm
    ext = payload.ear_extension_mm
    left = box(-ext, cy - ear_h / 2, 0, cy + ear_h / 2)
    right = box(width, cy - ear_h / 2, width + ext, cy + ear_h / 2)
    ears_2d = unary_union([left, right])
    ears = trimesh.creation.extrude_polygon(ears_2d, height=payload.ear_thickness_mm)
    return trimesh.util.concatenate([body, ears])


@app.post("/api/export/stl")
def export_stl(payload: ModelRequest):
    mesh = build_plate(payload)
    data = mesh.export(file_type="stl")
    return Response(
        content=data,
        media_type="model/stl",
        headers={"Content-Disposition": 'attachment; filename="aac-keyguard.stl"'},
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")
