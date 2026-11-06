"""Render every Helm robot layer. Resumable: skips outputs that exist."""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import robot as R, bpy
from post import bloom, shadow
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/hermes-helm/dashboard/sprites'
os.makedirs(OUT, exist_ok=True)
COLS = list(R.COLORS)
FACES = ['idle','happy','focused','question','error','sleep','heart','star','wink','tongue']
TOPPERS_COL = ['antenna','cat','dish','cap']
TOPPERS_FREE = ['sprout','goggles','bunny','beanie','crown','headphones']
CHESTS = ['planet','heart','gear','leaf','bars','paw','recycle','bolt']
TOOLS = ['wrench','claw','drill','flashlight','magnet','camera']
BACKS_COL = ['backpack','jetpack']
BACKS_FREE = ['cape','satchel','scarf','bow']

jobs = []
for c in COLS: jobs.append(('base', None, c))
for c in COLS:
    for f in FACES: jobs.append(('face', f, c))
    for t in TOPPERS_COL: jobs.append(('topper', t, c))
    for ch in CHESTS: jobs.append(('chest', ch, c))
    for b in BACKS_COL: jobs.append(('back', b, c))
for t in TOPPERS_FREE: jobs.append(('topper', t, 'white'))
for t in TOOLS: jobs.append(('tool', t, 'white'))
for b in BACKS_FREE: jobs.append(('back', b, 'white'))

def name(kind, part, col):
    if kind == 'base': return f'base_{col}.png'
    free = (kind == 'topper' and part in TOPPERS_FREE) or kind == 'tool' or (kind == 'back' and part in BACKS_FREE)
    return f'{kind}_{part}.png' if free else f'{kind}_{part}_{col}.png'

manifest = {'colors': COLS, 'faces': FACES, 'toppers': TOPPERS_COL + TOPPERS_FREE, 'chests': CHESTS,
            'tools': TOOLS, 'backs': BACKS_COL + BACKS_FREE, 'colorFree': {'topper': TOPPERS_FREE, 'back': BACKS_FREE, 'tool': TOOLS},
            'size': [640, 800]}
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)

def holdout(coll):
    for ob in coll.objects:
        ob.is_holdout = True

total = len(jobs); done = 0; t0 = time.time()
for kind, part, col in jobs:
    fn = os.path.join(OUT, name(kind, part, col))
    done += 1
    if os.path.exists(fn):
        continue
    t = time.time()
    R.setup_scene(res=(640, 800), samples=48 if kind == 'base' else 32)
    R.set_colour(col)
    base = R.new_coll('base'); R.build_base(col, base)
    if kind != 'base':
        holdout(base)
        c = R.new_coll(kind)
        {'face': R.build_face, 'topper': R.build_topper, 'chest': R.build_chest, 'tool': R.build_tool, 'back': R.build_back}[kind](part, col, c)
    raw = fn + '.raw.png'
    R.render(raw)
    im = Image.open(raw).convert('RGBA')
    im = bloom(im)
    if kind == 'base':
        im = shadow(im)
    im.save(fn, optimize=True)
    os.remove(raw)
    print(f'[{done}/{total}] {os.path.basename(fn)} {time.time()-t:.1f}s  elapsed {(time.time()-t0)/60:.1f}m', flush=True)
print('ALL DONE', flush=True)
