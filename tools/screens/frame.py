"""Wrap a rendered helm surface (tests/.tmp/*.html, from `HELM_SCREEN=1 node smoke.mjs`)
in the Helm Dark app variables and a window frame, for README screenshots.
Usage: python3 frame.py tests/.tmp/desk.html out.html"""
import sys

VARS = """
--ui-text-primary:#E6EBF0; --ui-text-secondary:#B9C3CD; --ui-text-tertiary:#8794A1; --ui-text-quaternary:#5D6875;
--ui-accent:#62C6D3; --ui-stroke-secondary:#2A3440; --ui-stroke-tertiary:#1F2730; --ui-bg-elevated:#141B23;
--ui-row-hover-background:#18212A; --ui-yellow:#E8A657; --ui-red:#E07080; --ui-green:#6CC08A; --radius-scalar:1;
"""
body = open(sys.argv[1], encoding="utf-8").read()
page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
:root{{{VARS}}}
*{{box-sizing:border-box}} html,body{{margin:0;background:#06090D}}
body{{font-family:Inter,system-ui,sans-serif;color:var(--ui-text-primary);-webkit-font-smoothing:antialiased;padding:28px}}
.win{{width:1344px;margin:0 auto;border:1px solid #1F2730;border-radius:14px;overflow:hidden;background:#0E1319;box-shadow:0 30px 80px rgba(0,0,0,.5)}}
.bar{{height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #1C242D;background:#0B1015}}
.bar i{{width:12px;height:12px;border-radius:50%;background:#2A3440;display:inline-block}}
.bar span{{margin-left:12px;font-size:12px;color:#8794A1}}
.main{{padding:8px 40px 40px;max-height:1000px;overflow:hidden}}
button{{font:inherit;color:inherit;background:none;border:0}} input,textarea{{font:inherit;color:inherit}}
img{{max-width:none}}
.absolute{{position:absolute}} .relative{{position:relative}} .top-0{{top:0}} .left-0{{left:0}} .w-full{{width:100%}} .h-full{{height:100%}}
.select-none{{user-select:none}} .shrink-0{{flex-shrink:0}} .rounded-full{{border-radius:9999px}} .overflow-hidden{{overflow:hidden}}
.truncate{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}} .codicon{{display:none}}
</style></head><body><div class="win"><div class="bar"><i></i><i></i><i></i><span>Hermes · Desk</span></div>
<div class="main">{body}</div></div></body></html>"""
open(sys.argv[2], "w", encoding="utf-8").write(page)
