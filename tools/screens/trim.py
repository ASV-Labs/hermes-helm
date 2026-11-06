"""Trim the empty page background below a framed screenshot and save it at 1x-friendly size."""
import sys

from PIL import Image

BG = (6, 9, 13)
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
px = im.load()


def blank(y):
    return all(abs(px[x, y][0] - BG[0]) < 4 and abs(px[x, y][1] - BG[1]) < 4 and abs(px[x, y][2] - BG[2]) < 4
               for x in range(0, w, 8))


bottom = h - 1
while bottom > 0 and blank(bottom):
    bottom -= 1
im = im.crop((0, 0, w, min(h, bottom + 56)))
if im.width > 1600:  # keep README images light; 2x capture downsampled
    im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
im.save(dst, optimize=True)
print(dst, im.size)
