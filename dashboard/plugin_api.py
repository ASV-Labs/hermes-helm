"""Helm sprite server — mounted by the Hermes dashboard/gateway at
``/api/plugins/helm``. Serves the pre-rendered robot layers (PNG, alpha) as
data URLs so the desktop plugin can compose a bot's look without any file
access of its own. Read-only; nothing here touches Hermes state.
"""
from __future__ import annotations

import base64
import json
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

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
