"""Post: bloom on bright pixels + soft contact shadow, alpha preserved."""
import sys
from PIL import Image, ImageFilter, ImageChops, ImageDraw

def bloom(img, threshold=215, radius=14, strength=0.55):
    rgb = img.convert('RGB'); a = img.getchannel('A')
    import numpy as np
    arr = np.asarray(rgb).astype(int)
    mx = arr.max(axis=2); mn = arr.min(axis=2)
    sat = mx - mn
    mask = ((sat > 45) & (mx > 160)) | ((mx > 250) & (sat > 25))
    lum = Image.fromarray((mask * 255).astype('uint8'), 'L').filter(ImageFilter.MaxFilter(3))
    bright = Image.composite(rgb, Image.new('RGB', img.size, (0,0,0)), lum)
    bright = Image.composite(bright, Image.new('RGB', img.size, (0,0,0)), a)
    glow = bright.filter(ImageFilter.GaussianBlur(radius))
    glow = Image.eval(glow, lambda v: int(v*strength))
    out = ImageChops.screen(rgb, glow)
    # alpha: extend alpha where glow exists
    ga = glow.convert('L').point(lambda v: min(255, v*2))
    na = ImageChops.lighter(a, ga)
    out.putalpha(na)
    return out

def shadow(img, cy_frac=0.785, w_frac=0.62, h_frac=0.06, blur=16, opacity=85):
    W, H = img.size
    sh = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(sh)
    cx, cy = W/2, H*cy_frac
    w, h = W*w_frac/2, H*h_frac/2
    d.ellipse((cx-w, cy-h, cx+w, cy+h), fill=(20,24,30,opacity))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(sh, img)

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('RGBA')
    im = bloom(im)
    if '--noshadow' not in sys.argv:
        im = shadow(im)
    im.save(dst)
