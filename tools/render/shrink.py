"""Shrink rendered sprites in place without external tools: zero the RGB of
fully transparent pixels (Cycles leaves noise there, which defeats PNG
compression) and re-save with Pillow's optimizer."""
import os, sys
from PIL import Image
import numpy as np

d = sys.argv[1]
before = after = 0
for n in sorted(os.listdir(d)):
    if not n.endswith('.png'):
        continue
    p = os.path.join(d, n)
    before += os.path.getsize(p)
    a = np.asarray(Image.open(p).convert('RGBA')).copy()
    a[a[:, :, 3] == 0, :3] = 0
    Image.fromarray(a, 'RGBA').save(p, optimize=True)
    after += os.path.getsize(p)
print(f'{before/1e6:.1f} MB -> {after/1e6:.1f} MB')
