"""Checks for dashboard/pet_sheet.py: atlas geometry, frames per row, margins, determinism.

    python3 tests/pet_sheet_check.py            # three representative looks
    python3 tests/pet_sheet_check.py --all-colors
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("helm_pet_sheet", ROOT / "dashboard" / "pet_sheet.py")
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

LOOKS = [
    {"color": "blue", "topper": "antenna", "face": "idle", "chest": "planet", "tool": "wrench", "back": "jetpack"},
    {"color": "purple", "topper": "bunny", "face": "happy", "chest": "gear", "tool": "none", "back": "cape"},
    {"color": "gold", "topper": "dish", "face": "heart", "chest": "bolt", "tool": "claw", "back": "backpack"},
]
if "--all-colors" in sys.argv:
    LOOKS += [{**LOOKS[0], "color": c} for c in ps.PARTS["color"] if c != "blue"]
if "--all-parts" in sys.argv:
    LOOKS += [{**LOOKS[0], "topper": t, "tool": ps.PARTS["tool"][i % 7], "back": ps.PARTS["back"][i % 7]}
              for i, t in enumerate(ps.PARTS["topper"])]

MARGIN = 4


def check(look: dict) -> None:
    sheet = ps.render_sheet(look)
    assert sheet.size == (1536, 1872), sheet.size
    for r, (state, count) in enumerate(ps.ROWS):
        for c in range(8):
            cell = sheet.crop((c * 192, r * 208, (c + 1) * 192, (r + 1) * 208))
            box = cell.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
            if c >= count:
                assert box is None, f"{state} cell {c} should be empty"
                continue
            assert box is not None, f"{state} frame {c} is empty"
            left, top, right, bottom = box
            assert left >= MARGIN and top >= MARGIN and right <= 192 - MARGIN and bottom <= 208 - MARGIN, (state, c, box)
    print(f"ok  {ps.look_key(look)}")


def main() -> None:
    assert ps.look_key(None) == "blue-antenna-idle-planet-none-none"
    assert ps.normalize_look({"color": "rainbow", "tool": "laser"}) == ps.DEFAULT_LOOK
    for look in LOOKS:
        check(look)
    a = ps.render_sheet(LOOKS[0]).tobytes()
    b = ps.render_sheet(LOOKS[0]).tobytes()
    assert a == b, "rendering must be deterministic"
    print("pet_sheet: ok")


if __name__ == "__main__":
    main()
