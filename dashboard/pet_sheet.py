"""Animated robot sprite sheets in the petdex / Codex pet format.

A helm robot is six rendered layers (base, back, chest, face, topper, tool) on one
640x800 camera. This module animates them as cutouts (body squash and lean, a
swaying topper, a swinging tool, face swaps for blinks and moods, plus drawn
effects such as speed lines, sparks, smoke and a scan line) and packs the frames
into the atlas Hermes pets use: 192x208 cells, 8 columns by 9 rows (1536x1872),
transparent, one row per state:

    idle 6 · running-right 8 · running-left 8 · waving 4 · jumping 5 ·
    failed 8 · waiting 6 · running 6 · review 6

Rows shorter than 8 leave their tail cells empty, which renderers trim. The
sheet is deterministic: the same look always yields the same bytes.
"""
from __future__ import annotations

import io
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

SPRITES = Path(__file__).resolve().parent / "sprites"

CELL_W, CELL_H = 192, 208
COLS = 8
ROWS = [
    ("idle", 6),
    ("running-right", 8),
    ("running-left", 8),
    ("waving", 4),
    ("jumping", 5),
    ("failed", 8),
    ("waiting", 6),
    ("running", 6),
    ("review", 6),
]
SHEET_W, SHEET_H = COLS * CELL_W, len(ROWS) * CELL_H

# Geometry is authored in "design units": the layers' native 640x800 space on an
# 860x932 stage (~4.5x the cell). Frames render at K of that (~2.2x the cell):
# still supersampled for clean edges, about a quarter of the pixel work.
K = 0.5
DESIGN_W, DESIGN_H = 860, 932
CANVAS_W, CANVAS_H = round(DESIGN_W * K), round(DESIGN_H * K)
LAYER_W, LAYER_H = round(640 * K), round(800 * K)


def _k(*values):
    out = tuple(v * K for v in values)
    return out if len(out) > 1 else out[0]


OFFSET = _k(82, 181)  # layer (0,0) on the stage: wheels rest 60 units above the cell floor
BODY_PIVOT = _k(320, 691)  # bottom centre between the wheels
TOPPER_PIVOT = _k(320, 168)  # where a topper meets the head
TOOL_PIVOT = _k(540, 405)  # the right fist
SCREEN = _k(176, 214, 464, 368)  # the face screen

PARTS = {
    "topper": ["antenna", "cat", "sprout", "cap", "goggles", "dish", "bunny", "beanie", "crown", "headphones"],
    "face": ["idle", "happy", "focused", "question", "error", "sleep", "heart", "star", "wink", "tongue"],
    "chest": ["planet", "heart", "gear", "leaf", "bars", "paw", "recycle", "bolt"],
    "tool": ["none", "wrench", "claw", "drill", "flashlight", "magnet", "camera"],
    "back": ["none", "backpack", "jetpack", "cape", "satchel", "scarf", "bow"],
    "color": ["blue", "purple", "green", "gold", "pink", "graphite", "white"],
}
COLOR_FREE = {
    "topper": {"sprout", "goggles", "bunny", "beanie", "crown", "headphones"},
    "tool": set(PARTS["tool"]),
    "back": {"cape", "satchel", "scarf", "bow"},
}
GLOW = {
    "blue": (95, 184, 216), "purple": (180, 140, 230), "green": (108, 211, 165), "gold": (228, 181, 92),
    "pink": (240, 143, 184), "graphite": (201, 209, 218), "white": (159, 216, 232),
}
DEFAULT_LOOK = {"topper": "antenna", "face": "idle", "chest": "planet", "tool": "none", "back": "none", "color": "blue"}


def normalize_look(raw: dict | None) -> dict:
    """Only known part names survive; anything else falls back to the default part."""
    out = dict(DEFAULT_LOOK)
    if isinstance(raw, dict):
        for key, options in PARTS.items():
            if raw.get(key) in options:
                out[key] = raw[key]
    return out


def _sprite_name(kind: str, part: str, color: str) -> str | None:
    if not part or part == "none":
        return None
    if kind == "base":
        return f"base_{color}.png"
    free = part in COLOR_FREE.get(kind, ())
    return f"{kind}_{part}.png" if free else f"{kind}_{part}_{color}.png"


@lru_cache(maxsize=256)
def _layer(name: str | None) -> Image.Image | None:
    if not name:
        return None
    path = SPRITES / name
    if not path.is_file():
        return None
    return Image.open(path).convert("RGBA").resize((LAYER_W, LAYER_H), Image.LANCZOS)


def _rotated(img: Image.Image, degrees: float, pivot: tuple[float, float]) -> Image.Image:
    if not degrees:
        return img
    return img.rotate(degrees, resample=Image.BICUBIC, center=pivot)


def _compose_body(look: dict, face: str, *, topper_rot=0.0, tool_rot=0.0, chest_glow=1.0) -> Image.Image:
    """The robot in layer space, with the per-frame part motions applied."""
    color = look["color"]
    out = Image.new("RGBA", (LAYER_W, LAYER_H), (0, 0, 0, 0))
    base = _layer(_sprite_name("base", "base", color))
    if base is None:
        raise FileNotFoundError(f"base sprite for {color!r} is missing")
    out.alpha_composite(base)
    for kind, part in (("back", look["back"]), ("chest", look["chest"])):
        layer = _layer(_sprite_name(kind, part, color))
        if layer is None:
            continue
        if kind == "chest" and chest_glow != 1.0:
            alpha = layer.getchannel("A")
            layer = ImageEnhance.Brightness(layer).enhance(chest_glow)
            layer.putalpha(alpha)
        out.alpha_composite(layer)
    face_layer = _layer(_sprite_name("face", face, color)) or _layer(_sprite_name("face", look["face"], color))
    if face_layer is not None:
        out.alpha_composite(face_layer)
    topper = _layer(_sprite_name("topper", look["topper"], color))
    if topper is not None:
        out.alpha_composite(_rotated(topper, topper_rot, TOPPER_PIVOT))
    tool = _layer(_sprite_name("tool", look["tool"], color))
    if tool is not None:
        out.alpha_composite(_rotated(tool, tool_rot, TOOL_PIVOT))
    return out


def _place(body: Image.Image, *, dx=0.0, dy=0.0, rot=0.0, sx=1.0, sy=1.0) -> Image.Image:
    """Squash/stretch and lean the body about its base, then move it, on the working canvas."""
    px, py = BODY_PIVOT
    cx, cy = px + OFFSET[0] + dx * K, py + OFFSET[1] + dy * K  # where the pivot lands on the canvas
    a = math.radians(rot)
    cos_a, sin_a = math.cos(a), math.sin(a)
    # Forward map: canvas = T(c) . R(rot) . S(sx, sy) . T(-p) . layer. PIL wants the inverse.
    ia, ib = cos_a / sx, sin_a / sx
    id_, ie = -sin_a / sy, cos_a / sy
    ic = px - (ia * cx + ib * cy)
    if_ = py - (id_ * cx + ie * cy)
    return body.transform((CANVAS_W, CANVAS_H), Image.AFFINE, (ia, ib, ic, id_, ie, if_), resample=Image.BICUBIC)


def _shadow(canvas: Image.Image, *, dx=0.0, lift=0.0) -> None:
    """Soft contact shadow under the wheels; it shrinks and fades as the robot lifts."""
    f = max(0.45, 1 - lift / 140)
    w, h = 300 * f * K, 34 * f * K
    cx, cy = BODY_PIVOT[0] + OFFSET[0] + dx * K, BODY_PIVOT[1] + OFFSET[1] + 8 * K
    pad = 12
    box = (int(cx - w / 2 - pad), int(cy - h / 2 - pad), int(cx + w / 2 + pad), int(cy + h / 2 + pad))
    layer = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((pad, pad, pad + w, pad + h), fill=(0, 0, 0, int(70 * f)))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(8 * K)), (box[0], box[1]))


def _speed_lines(draw: ImageDraw.ImageDraw, phase: int, glow) -> None:
    for i, (y, length) in enumerate(((460, 130), (550, 170), (640, 120))):
        shift = ((phase * 23 + i * 37) % 60) - 30
        x1 = 70 + shift
        draw.rounded_rectangle(_k(x1, y, x1 + length, y + 14), radius=7 * K, fill=(*glow, 150))


def _sparks(draw: ImageDraw.ImageDraw, phase: int, origin: tuple[float, float]) -> None:
    ox, oy = origin
    for i in range(3):
        if (phase + i) % 2:
            continue
        ang = math.radians(-60 + i * 50 + phase * 17)
        r = (58 + (phase % 3) * 20) * K
        x, y = ox + math.cos(ang) * r, oy + math.sin(ang) * r
        s = (30 - (phase % 3) * 6) * K
        draw.polygon([(x, y - s), (x + s * 0.32, y - s * 0.32), (x + s, y), (x + s * 0.32, y + s * 0.32),
                      (x, y + s), (x - s * 0.32, y + s * 0.32), (x - s, y), (x - s * 0.32, y - s * 0.32)],
                     fill=(255, 214, 102, 235))


def _smoke(canvas: Image.Image, phase: int) -> None:
    top, left = int(40 * K), int(380 * K)
    layer = Image.new("RGBA", (int(220 * K), int(300 * K)), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(3):
        t = ((phase + i * 3) % 8) / 8
        x = (455 + i * 26 + math.sin(t * 6 + i) * 18) * K - left
        y = (250 - t * 170) * K - top
        r = (18 + t * 30) * K
        d.ellipse((x - r, y - r, x + r, y + r), fill=(150, 160, 170, int(150 * (1 - t))))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(3 * K)), (left, top))


def _scan_line(canvas: Image.Image, phase: int, frames: int, glow, place: dict) -> None:
    """A light bar sweeping down the face screen while the robot reads."""
    left, top, right, bottom = SCREEN
    y = top + (bottom - top) * ((phase + 0.5) / frames)
    band = Image.new("RGBA", (LAYER_W, LAYER_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    d.rectangle((left + 6 * K, y - 14 * K, right - 6 * K, y + 14 * K), fill=(*glow, 90))
    d.rectangle((left + 10 * K, y - 6 * K, right - 10 * K, y + 6 * K), fill=(*glow, 235))
    band = band.filter(ImageFilter.GaussianBlur(2.5 * K))
    canvas.alpha_composite(_place(band, **place))


def _frame(look: dict, *, face=None, topper_rot=0.0, tool_rot=0.0, chest_glow=1.0, flip=False,
           shadow=True, extras=None, under=None, **place) -> Image.Image:
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    if shadow:
        _shadow(canvas, dx=place.get("dx", 0.0), lift=max(0.0, -place.get("dy", 0.0)))
    if under:
        under(canvas, place)
    body = _compose_body(look, face or look["face"], topper_rot=topper_rot, tool_rot=tool_rot, chest_glow=chest_glow)
    canvas.alpha_composite(_place(body, **place))
    if extras:
        extras(canvas, place)
    if flip:
        canvas = canvas.transpose(Image.FLIP_LEFT_RIGHT)
    return canvas.resize((CELL_W, CELL_H), Image.LANCZOS)


def _rows(look: dict) -> dict[str, list[Image.Image]]:
    glow = GLOW[look["color"]]
    has_tool = look["tool"] != "none"
    tip = (TOOL_PIVOT[0] + OFFSET[0] + 70 * K, TOOL_PIVOT[1] + OFFSET[1] - 150 * K)
    rows: dict[str, list[Image.Image]] = {}

    # idle: a slow breath, the topper sways, one blink.
    bob = [0, -4, -7, -8, -6, -3]
    sway = [-2, 0, 2, 3, 1, -1]
    rows["idle"] = [
        _frame(look, face="sleep" if i == 4 else None, dy=bob[i], sy=1 + bob[i] / -900, topper_rot=sway[i])
        for i in range(6)
    ]

    # running-right: rolls along, leaning in, topper trailing, speed lines behind.
    def run_frames(flip: bool) -> list[Image.Image]:
        bounce = [0, -7, -11, -7, 0, -7, -11, -7]
        frames = []
        for i in range(8):
            def lines(canvas, place, i=i):
                _speed_lines(ImageDraw.Draw(canvas), i, glow)
            frames.append(_frame(look, face="happy", dy=bounce[i], rot=-6, topper_rot=7 + (i % 2) * 3,
                                 tool_rot=-6 + (i % 2) * 6, under=lines, flip=flip))
        return frames

    rows["running-right"] = run_frames(False)
    rows["running-left"] = run_frames(True)

    # waving: the tool arm swings; empty hands still wave the fist.
    swing = [-18, 4, 20, 4]
    rows["waving"] = [
        _frame(look, face="wink" if i == 2 else "happy", rot=[1.5, 0, -1.5, 0][i], tool_rot=swing[i] if has_tool else 0,
               topper_rot=[-3, 0, 3, 0][i],
               extras=None if has_tool else (lambda canvas, place, i=i: _wave_fist(canvas, place, swing[i], glow)))
        for i in range(4)
    ]

    # jumping: squash, launch, apex with star eyes, fall, land.
    jump = [(0, 1.07, 0.9, "happy"), (-34, 0.95, 1.08, "happy"), (-58, 1, 1, "star"), (-30, 0.97, 1.05, "star"),
            (0, 1.06, 0.92, "happy")]
    rows["jumping"] = [
        _frame(look, face=f, dy=dy, sx=sx, sy=sy, topper_rot=[0, -6, 4, 8, 0][i]) for i, (dy, sx, sy, f) in enumerate(jump)
    ]

    # failed: a jolt, then a slump with the topper drooping and smoke rising.
    shake = [-9, 9, -6, 0, 0, 0, 0, 0]
    slump = [0, 0, 2, 5, 7, 8, 8, 8]
    rows["failed"] = [
        _frame(look, face="error", dx=shake[i], dy=slump[i] * 1.6, rot=slump[i] * 0.9, sy=1 - slump[i] * 0.004,
               topper_rot=-slump[i] * 1.8, tool_rot=slump[i] * 3,
               extras=(lambda canvas, place, i=i: _smoke(canvas, i)) if i >= 2 else None)
        for i in range(8)
    ]

    # waiting: curious head tilts while it waits on you.
    tilt = [0, -5, -7, -4, 3, 5]
    rows["waiting"] = [
        _frame(look, face="question", rot=tilt[i], topper_rot=tilt[i] * 1.4, dy=-abs(tilt[i]) * 0.6) for i in range(6)
    ]

    # running (working in place): focused, busy hands, sparks, a humming chest.
    rows["running"] = [
        _frame(look, face="focused", dy=[0, -3, 0, -3, 0, -3][i], dx=[0, 1.5, 0, -1.5, 0, 1.5][i],
               tool_rot=[-16, 12, -16, 12, -16, 12][i] if has_tool else 0, topper_rot=[1, -1, 1, -1, 1, -1][i],
               chest_glow=[1.0, 1.15, 1.3, 1.15, 1.0, 1.15][i],
               extras=lambda canvas, place, i=i: _sparks(ImageDraw.Draw(canvas), i, tip if has_tool else _k(640, 420)))
        for i in range(6)
    ]

    # review: leans in to read, a scan line sweeping the screen.
    rows["review"] = [
        _frame(look, face="focused", rot=-3, sx=1.02, sy=1.02, dy=-2, chest_glow=1.1, topper_rot=-4 + (i % 2) * 2,
               extras=lambda canvas, place, i=i: _scan_line(canvas, i, 6, glow, place))
        for i in range(6)
    ]
    return rows


def _wave_fist(canvas: Image.Image, place: dict, angle: float, glow) -> None:
    """Empty hands: little motion arcs beside the raised fist stand in for the swing."""
    if abs(angle) < 10:
        return
    layer = Image.new("RGBA", (LAYER_W, LAYER_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = TOOL_PIVOT
    side = 1 if angle > 0 else -1
    for r in (60 * K, 84 * K):
        box = (x - r + 30 * K, y - r - 40 * K, x + r + 30 * K, y + r - 40 * K)
        start = -80 if side > 0 else -150
        d.arc(box, start=start, end=start + 50, fill=(*glow, 200), width=max(2, round(9 * K)))
    canvas.alpha_composite(_place(layer, **place))


def render_sheet(look: dict | None) -> Image.Image:
    """The full 1536x1872 RGBA atlas for *look*."""
    look = normalize_look(look)
    rows = _rows(look)
    sheet = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
    for r, (state, count) in enumerate(ROWS):
        frames = rows[state]
        assert len(frames) == count, (state, len(frames), count)
        for c, frame in enumerate(frames):
            sheet.alpha_composite(frame, (c * CELL_W, r * CELL_H))
    return sheet


def look_key(look: dict | None) -> str:
    look = normalize_look(look)
    return "-".join(look[k] for k in ("color", "topper", "face", "chest", "tool", "back"))


@lru_cache(maxsize=48)
def sheet_png(key: str) -> bytes:
    """PNG bytes of the sheet for a :func:`look_key` (cached; keys are canonical)."""
    color, topper, face, chest, tool, back = key.split("-")
    buf = io.BytesIO()
    render_sheet({"color": color, "topper": topper, "face": face, "chest": chest, "tool": tool, "back": back}).save(
        buf, format="PNG", optimize=True)
    return buf.getvalue()


def sheet_webp(key: str) -> bytes:
    """Lossless WebP of the sheet, the format Hermes stores pets in."""
    buf = io.BytesIO()
    Image.open(io.BytesIO(sheet_png(key))).save(buf, format="WEBP", lossless=True, quality=100, method=4, exact=True)
    return buf.getvalue()
