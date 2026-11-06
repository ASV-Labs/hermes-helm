"""Shrink rendered sprites in place: zero RGB under alpha 0 (Cycles leaves noise
there, which defeats PNG compression) then pngquant at quality 85-100."""
import os, shutil, subprocess, sys
from PIL import Image
import numpy as np

d = sys.argv[1]
PQ = shutil.which('pngquant')
if not PQ:
    print('pngquant not found: zeroing hidden pixels only (install with: brew install pngquant)')
total_before = total_after = 0
for n in sorted(os.listdir(d)):
    if not n.endswith('.png'):
        continue
    p = os.path.join(d, n)
    before = os.path.getsize(p)
    im = Image.open(p).convert('RGBA')
    a = np.asarray(im).copy()
    a[a[:, :, 3] == 0, :3] = 0
    Image.fromarray(a, 'RGBA').save(p, optimize=True)
    if PQ:
        subprocess.run([PQ, '--quality=85-100', '--speed', '1', '--force', '--skip-if-larger', '--output', p, p], check=False)
    after = os.path.getsize(p)
    total_before += before; total_after += after
print(f'{total_before/1e6:.1f} MB -> {total_after/1e6:.1f} MB')
