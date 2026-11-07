"""Helm sprite server — mounted by the Hermes dashboard/gateway at
``/api/plugins/helm``.

- ``/sprites/*`` serves the pre-rendered robot layers (PNG, alpha) as data URLs,
  so the desktop plugin can compose a bot's look without file access of its own.
- ``/pets/sheet`` serves a look's animated sprite sheet (see ``pet_sheet.py``) for
  helm's own screens. Read-only.
- ``/pets/install`` is the one write: it saves a bot's robot as a Hermes pet,
  ``<profile home>/pets/helm-<bot>/`` (``pet.json`` + ``spritesheet.webp``, the
  standard petdex layout Hermes reads). It writes nothing else; the desktop then
  adopts it with Hermes's own ``pet.select``.
"""
from __future__ import annotations

import base64
import json
import re
from functools import lru_cache
from pathlib import Path

import importlib.util
import os
import tempfile

from fastapi import APIRouter, Body, HTTPException, Query

router = APIRouter()


def _load_pet_sheet():
    spec = importlib.util.spec_from_file_location("helm_pet_sheet", Path(__file__).resolve().parent / "pet_sheet.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pet_sheet = _load_pet_sheet()

SPRITES = Path(__file__).resolve().parent / "sprites"
NAME_RE = re.compile(r"^(base|face|topper|chest|tool|back)_[a-z]+(_[a-z]+)?\.png$")
BATCH_MAX = 16


@lru_cache(maxsize=1)
def _manifest() -> dict:
    path = SPRITES / "manifest.json"
    if not path.is_file():
        return {"colors": [], "faces": [], "toppers": [], "chests": [], "tools": [], "backs": [], "size": [640, 800]}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=512)
def _data_url(name: str) -> str | None:
    if not NAME_RE.match(name):
        return None
    path = SPRITES / name
    if not path.is_file():
        return None
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


@router.get("/sprites/manifest")
def sprites_manifest():
    m = dict(_manifest())
    m["available"] = sorted(p.name for p in SPRITES.glob("*.png")) if SPRITES.is_dir() else []
    return m


@router.get("/sprites/batch")
def sprites_batch(names: str = Query("", description="comma-separated sprite file names")):
    wanted = [n.strip() for n in names.split(",") if n.strip()][:BATCH_MAX]
    out: dict[str, str | None] = {}
    for n in wanted:
        out[n] = _data_url(n)
    return {"sprites": out}


@router.get("/sprites/{name}")
def sprite(name: str):
    url = _data_url(name)
    if url is None:
        raise HTTPException(status_code=404, detail="unknown sprite")
    return {"name": name, "url": url}


# ─── animated robots ────────────────────────────────────────────────────────

PROFILE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
KEY_RE = re.compile(r"^[a-z]+(-[a-z]+){5}$")


def _canonical_key(key: str) -> str:
    """Accept only a key that round-trips through the look normalizer (no free-form input reaches the renderer)."""
    if not KEY_RE.match(key or ""):
        raise HTTPException(status_code=400, detail="bad look key")
    color, topper, face, chest, tool, back = key.split("-")
    look = {"color": color, "topper": topper, "face": face, "chest": chest, "tool": tool, "back": back}
    canonical = pet_sheet.look_key(look)
    if canonical != key:
        raise HTTPException(status_code=400, detail="unknown look part")
    return canonical


@lru_cache(maxsize=48)
def _ui_sheet_url(key: str) -> str:
    """Half-resolution lossy WebP (96x104 cells) — plenty for helm's screens, ~1/6 the bytes."""
    import io

    from PIL import Image

    sheet = Image.open(io.BytesIO(pet_sheet.sheet_png(key)))
    half = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    buf = io.BytesIO()
    half.save(buf, format="WEBP", quality=88, method=4)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


@router.get("/pets/sheet")
def pets_sheet(look: str = Query(..., description="look key: color-topper-face-chest-tool-back")):
    key = _canonical_key(look)
    return {
        "key": key,
        "url": _ui_sheet_url(key),
        "cell": [pet_sheet.CELL_W // 2, pet_sheet.CELL_H // 2],
        "rows": [{"state": state, "frames": count} for state, count in pet_sheet.ROWS],
        "frameMs": 1100 // 6,
    }


def _profile_home(profile: str) -> Path:
    """The Hermes home of *profile*, via Hermes's public path helpers; it must already exist."""
    from hermes_constants import get_default_hermes_root, named_profile_is_deleted

    if not PROFILE_RE.match(profile or ""):
        raise HTTPException(status_code=400, detail="bad profile name")
    root = get_default_hermes_root()
    home = root if profile == "default" else root / "profiles" / profile
    if not home.is_dir() or (profile != "default" and named_profile_is_deleted(home)):
        raise HTTPException(status_code=404, detail="no such profile")
    return home


def _atomic_write(path: Path, data: bytes) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".helm-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


@router.post("/pets/install")
def pets_install(payload: dict = Body(...)):
    profile = str(payload.get("profile") or "")
    key = _canonical_key(str(payload.get("look") or ""))
    name = str(payload.get("name") or profile)[:60].strip() or profile
    home = _profile_home(profile)
    slug = "helm-" + profile
    directory = home / "pets" / slug
    directory.mkdir(parents=True, exist_ok=True)
    _atomic_write(directory / "spritesheet.webp", pet_sheet.sheet_webp(key))
    meta = {
        "id": slug,
        "displayName": f"{name} (helm robot)",
        "description": "An animated helm robot, made from this bot's look. https://github.com/ASV-Labs/hermes-helm",
        "spritesheetPath": "spritesheet.webp",
        "createdBy": "helm",
        "helmLook": key,
    }
    _atomic_write(directory / "pet.json", json.dumps(meta, indent=2).encode("utf-8"))
    thumb = home / "pets" / ".thumbs" / f"{slug}.png"
    if thumb.is_file():
        thumb.unlink()
    return {"ok": True, "slug": slug, "key": key}
