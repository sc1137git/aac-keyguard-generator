from pathlib import Path
from typing import List

import cv2
import numpy as np
import trimesh
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from shapely.geometry import Point, box
from shapely.ops import unary_union

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="AAC Keyguard Generator", version="0.3.1")

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
    ear_height_mm: float = 18.0
    corner_radius_mm: float = Field(default=6.0, ge=0, le=20)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/presets")
def presets():
    return PRESETS


def _cluster(values: list[float], tolerance: float) -> list[float]:
    if not values:
        return []
    values = sorted(values)
    groups: list[list[float]] = []
    for value in values:
        if not groups or abs(value - float(np.mean(groups[-1]))) > tolerance:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [float(np.mean(group)) for group in groups]


def _dedupe_rects(rects: list[tuple[float, float, float, float]]) -> list[tuple[float, float, float, float]]:
    output: list[tuple[float, float, float, float]] = []
    for rect in sorted(rects, key=lambda r: r[2] * r[3], reverse=True):
        x, y, w, h = rect
        cx, cy = x + w / 2, y + h / 2
        duplicate = False
        for other in output:
            ox, oy, ow, oh = other
            ocx, ocy = ox + ow / 2, oy + oh / 2
            if abs(cx - ocx) < min(w, ow) * 0.12 and abs(cy - ocy) < min(h, oh) * 0.12:
                duplicate = True
                break
        if not duplicate:
            output.append(rect)
    return output


def _border_score(gray: np.ndarray, cx: float, cy: float, w: float, h: float) -> float:
    height, width = gray.shape
    x0 = max(0, int((cx - w / 2) * width))
    x1 = min(width - 1, int((cx + w / 2) * width))
    y0 = max(0, int((cy - h / 2) * height))
    y1 = min(height - 1, int((cy + h / 2) * height))
    band = max(2, int(min(width, height) * 0.004))
    strips = [
        gray[max(0, y0 - band):min(height, y0 + band + 1), x0:x1 + 1],
        gray[max(0, y1 - band):min(height, y1 + band + 1), x0:x1 + 1],
        gray[y0:y1 + 1, max(0, x0 - band):min(width, x0 + band + 1)],
        gray[y0:y1 + 1, max(0, x1 - band):min(width, x1 + band + 1)],
    ]
    pixels = np.concatenate([strip.ravel() for strip in strips if strip.size])
    return float(np.mean(pixels < 190)) if pixels.size else 0.0


def _inset_rect(x: float, y: float, w: float, h: float, factor: float = 0.025) -> dict:
    ix = min(w * factor, 0.006)
    iy = min(h * factor, 0.006)
    return {
        "x": max(0.0, x + ix),
        "y": max(0.0, y + iy),
        "w": max(0.001, w - 2 * ix),
        "h": max(0.001, h - 2 * iy),
    }


def detect_aac_holes(image: np.ndarray) -> tuple[list[dict], dict]:
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    _, dark = cv2.threshold(gray, 110, 255, cv2.THRESH_BINARY_INV)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(dark, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, float, float, float]] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        nw, nh = w / width, h / height
        if 0.075 < nw < 0.30 and 0.055 < nh < 0.18 and 1.1 < (w / max(h, 1)) < 4.5:
            candidates.append((x / width, y / height, nw, nh))
    candidates = _dedupe_rects(candidates)

    dominant: list[tuple[float, float, float, float]] = []
    if candidates:
        best_seed = max(
            candidates,
            key=lambda seed: sum(
                abs(rect[2] - seed[2]) / seed[2] < 0.13 and abs(rect[3] - seed[3]) / seed[3] < 0.13
                for rect in candidates
            ),
        )
        dominant = [
            rect for rect in candidates
            if abs(rect[2] - best_seed[2]) / best_seed[2] < 0.13
            and abs(rect[3] - best_seed[3]) / best_seed[3] < 0.13
        ]

    holes: list[dict] = []
    grid_count = 0
    dashed_included = False

    if len(dominant) >= 4:
        cell_w = float(np.median([rect[2] for rect in dominant]))
        cell_h = float(np.median([rect[3] for rect in dominant]))
        x_centers = _cluster([rect[0] + rect[2] / 2 for rect in dominant], max(0.018, cell_w * 0.20))
        y_centers = _cluster([rect[1] + rect[3] / 2 for rect in dominant], max(0.018, cell_h * 0.20))

        if 3 <= len(x_centers) <= 8 and len(y_centers) >= 2:
            y_diffs = np.diff(sorted(y_centers))
            row_gap = float(np.median(y_diffs)) if len(y_diffs) else cell_h * 1.15
            first_y = min(y_centers)
            row_centers: list[float] = []
            for index in range(10):
                cy = first_y + index * row_gap
                if cy + cell_h / 2 >= 0.845:
                    break
                scores = [_border_score(gray, cx, cy, cell_w, cell_h) for cx in x_centers]
                average_score = float(np.mean(scores)) if scores else 0.0
                near_known = any(abs(cy - known) < row_gap * 0.28 for known in y_centers)
                if near_known or average_score >= 0.12:
                    row_centers.append(cy)
                    if not near_known:
                        dashed_included = True
                elif index >= len(y_centers):
                    break

            for cy in row_centers:
                for cx in x_centers:
                    holes.append(_inset_rect(cx - cell_w / 2, cy - cell_h / 2, cell_w, cell_h))
            grid_count = len(row_centers) * len(x_centers)

    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    edge_contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    top_rects: list[tuple[float, float, float, float]] = []
    for contour in edge_contours:
        x, y, w, h = cv2.boundingRect(contour)
        nw, nh = w / width, h / height
        rectangularity = cv2.contourArea(contour) / max(w * h, 1)
        if y / height < 0.16 and 0.07 < nh < 0.19 and nw > 0.08 and rectangularity > 0.72:
            top_rects.append((x / width, y / height, nw, nh))
    top_rects = _dedupe_rects(top_rects)
    if top_rects:
        large = [rect for rect in top_rects if rect[2] > 0.45]
        right = [rect for rect in top_rects if rect[0] > 0.72 and rect[2] < 0.30]
        if large:
            holes.append(_inset_rect(*max(large, key=lambda r: r[2] * r[3]), factor=0.035))
        if right:
            holes.append(_inset_rect(*max(right, key=lambda r: r[2] * r[3]), factor=0.035))

    holes.sort(key=lambda item: (item["y"], item["x"]))
    return holes, {
        "grid_holes": grid_count,
        "total_holes": len(holes),
        "dashed_placeholders_included": dashed_included,
        "message": "已將實心按鈕與「點擊以添加按鈕」虛線格一起保留為孔位。",
    }


@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    raw = await file.read()
    array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="無法讀取圖片")
    holes, info = detect_aac_holes(image)
    return {"holes": holes, "info": info}


def rounded_plate(width: float, height: float, radius: float):
    radius = max(0.0, min(radius, width / 2, height / 2))
    base = box(0, 0, width, height)
    if radius <= 0:
        return base
    inner = base.buffer(-radius, join_style=1)
    if inner.is_empty:
        return base
    return inner.buffer(radius, join_style=1)


def rounded_side_ear(side: str, width: float, center_y: float, extension: float, ear_height: float, overlap: float = 0.8):
    """Create one side tab with a semicircular outer end and a flat attachment to the plate."""
    radius = ear_height / 2.0
    if side == "left":
        cap_center_x = -extension + radius
        cap = Point(cap_center_x, center_y).buffer(radius, resolution=24)
        neck = box(cap_center_x, center_y - radius, overlap, center_y + radius)
    else:
        cap_center_x = width + extension - radius
        cap = Point(cap_center_x, center_y).buffer(radius, resolution=24)
        neck = box(width - overlap, center_y - radius, cap_center_x, center_y + radius)
    return unary_union([cap, neck])


def build_plate(payload: ModelRequest) -> trimesh.Trimesh:
    if payload.preset not in PRESETS:
        raise ValueError(f"Unknown preset: {payload.preset}")

    preset = PRESETS[payload.preset]
    width = preset["width_mm"]
    height = preset["height_mm"]
    thickness = payload.body_thickness_mm or (5.0 if payload.ears else 3.0)

    plate = rounded_plate(width, height, payload.corner_radius_mm)
    cutouts = []
    for h in payload.holes:
        x = h.x * width
        y = h.y * height
        w = h.w * width
        hh = h.h * height
        if payload.ears:
            x = width - x - w
        cutouts.append(box(x, y, x + w, y + hh))

    if cutouts:
        plate = plate.difference(unary_union(cutouts))

    if not payload.ears:
        return trimesh.creation.extrude_polygon(plate, height=thickness)

    # 四耳版本：左 2、右 2；正中央完全留空，避開舊款 iPad 的前鏡頭與 Home 鍵。
    # 耳朵只存在最底下 0.8 mm，且一定在孔位鏡像完成後才加入。
    ear_t = max(0.1, min(payload.ear_thickness_mm, thickness))
    ear_h = max(10.0, min(payload.ear_height_mm, 24.0))
    ext = max(6.0, min(payload.ear_extension_mm, 20.0))

    # 約離上下邊 30 mm；中間約 90 mm 的區域不放耳朵。
    edge_center = max(26.0, min(30.0, height * 0.20))
    centers = [edge_center, height - edge_center]
    ears_2d = []
    for cy in centers:
        ears_2d.append(rounded_side_ear("left", width, cy, ext, ear_h))
        ears_2d.append(rounded_side_ear("right", width, cy, ext, ear_h))

    bottom_shape = unary_union([plate, *ears_2d])
    bottom_mesh = trimesh.creation.extrude_polygon(bottom_shape, height=ear_t)

    if thickness <= ear_t + 1e-6:
        return bottom_mesh

    upper_mesh = trimesh.creation.extrude_polygon(plate, height=thickness - ear_t)
    upper_mesh.apply_translation((0, 0, ear_t))
    return trimesh.util.concatenate([bottom_mesh, upper_mesh])


@app.post("/api/export/stl")
def export_stl(payload: ModelRequest):
    try:
        mesh = build_plate(payload)
        data = mesh.export(file_type="stl")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"STL 產生失敗：{exc}") from exc
    return Response(
        content=data,
        media_type="model/stl",
        headers={"Content-Disposition": 'attachment; filename="aac-keyguard.stl"'},
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")
