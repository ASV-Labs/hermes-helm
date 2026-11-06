"""Frame a rendered helm surface for README screenshots.

`HELM_SCREEN=1 node tests/smoke.mjs` writes each surface's real HTML (demo data) to
tests/.tmp/<name>.html. This wraps one in the Helm Dark app variables, the Tailwind
utilities the app ships (pass the compiled CSS with --css) and a window frame, so a
headless browser can screenshot it.

    python3 tools/screens/frame.py tests/.tmp/desk.html out.html --title "Hermes · Desk" --width 1344
"""
import argparse
import pathlib

VARS = """
--ui-text-primary:#E6EBF0; --ui-text-secondary:#B9C3CD; --ui-text-tertiary:#8794A1; --ui-text-quaternary:#5D6875;
--ui-accent:#62C6D3; --ui-stroke-secondary:#2A3440; --ui-stroke-tertiary:#1F2730; --ui-bg-elevated:#141B23;
--ui-row-hover-background:#18212A; --ui-yellow:#E8A657; --ui-red:#E07080; --ui-green:#6CC08A; --ui-bg-chrome:#0B1015;
--chrome-action-hover:#18212A; --radius-scalar:1;
"""

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--title", default="Hermes")
ap.add_argument("--width", type=int, default=1344)
ap.add_argument("--css", default="")
ap.add_argument("--pad", default="8px 40px 40px")
a = ap.parse_args()

body = pathlib.Path(a.src).read_text(encoding="utf-8")
utilities = pathlib.Path(a.css).read_text(encoding="utf-8") if a.css else ""
page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
{utilities}
:root{{{VARS}}}
*,::before,::after{{box-sizing:border-box;border:0 solid}}
html,body{{margin:0;background:#06090D}}
body{{font-family:Inter,system-ui,sans-serif;color:var(--ui-text-primary);-webkit-font-smoothing:antialiased;padding:28px}}
.win{{width:{a.width}px;margin:0 auto;border:1px solid #1F2730;border-radius:14px;overflow:hidden;background:#0E1319;box-shadow:0 30px 80px rgba(0,0,0,.5)}}
.bar{{height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #1C242D;background:#0B1015}}
.bar i{{width:12px;height:12px;border-radius:50%;background:#2A3440;display:inline-block}}
.bar span{{margin-left:12px;font-size:12px;color:#8794A1}}
.main{{padding:{a.pad};overflow:hidden}}
button{{font:inherit;color:inherit;background:none;cursor:pointer}} input,textarea{{font:inherit;color:inherit;background:none}}
img{{max-width:none;display:block}} .codicon{{display:none}}
</style></head><body><div class="win"><div class="bar"><i></i><i></i><i></i><span>{a.title}</span></div>
<div class="main">{body}</div></div></body></html>"""
pathlib.Path(a.out).write_text(page, encoding="utf-8")
