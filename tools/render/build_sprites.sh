#!/usr/bin/env bash
# Render helm's 191 robot layers into dashboard/sprites/ on this machine.
# Needs Python 3.13 (bpy 5.2 wheels) — uses uv if present, else a venv.
# Resumable: re-run after an interruption and it skips finished layers.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/dashboard/sprites"
mkdir -p "$OUT"
if command -v uv >/dev/null 2>&1; then
  RUN=(uv run --python 3.13 --with "bpy>=5.2,<5.3" --with pillow --with numpy python)
else
  PY=$(command -v python3.13 || true)
  [ -z "$PY" ] && { echo "Need uv or python3.13 (brew install uv)"; exit 1; }
  [ -d "$HERE/.venv" ] || "$PY" -m venv "$HERE/.venv"
  "$HERE/.venv/bin/pip" install -q "bpy>=5.2,<5.3" pillow numpy
  RUN=("$HERE/.venv/bin/python")
fi
"${RUN[@]}" "$HERE/build_all.py" "$OUT"
"${RUN[@]}" "$HERE/shrink.py" "$OUT"
echo "sprites: $(ls "$OUT"/*.png | wc -l | tr -d ' ') png in $OUT"
