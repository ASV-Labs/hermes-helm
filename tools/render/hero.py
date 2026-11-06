"""Compose docs/robots.png (light) and docs/robots-dark.png from the sprite set."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
S = sys.argv[1]; OUT = sys.argv[2]
def bot(color, face, topper, chest, tool=None, back=None):
    im = Image.new('RGBA', (640, 800), (0, 0, 0, 0))
    layers = [f'back_{back}_{color}.png' if back in ('backpack', 'jetpack') else (f'back_{back}.png' if back else None),
              f'base_{color}.png', f'chest_{chest}_{color}.png', f'face_{face}_{color}.png',
              f'topper_{topper}_{color}.png' if topper in ('antenna', 'cat', 'dish', 'cap') else f'topper_{topper}.png',
              f'tool_{tool}.png' if tool else None]
    for n in layers:
        if n and os.path.exists(os.path.join(S, n)):
            im.alpha_composite(Image.open(os.path.join(S, n)).convert('RGBA'))
    return im
crew = [('pink', 'happy', 'cat', 'heart', None, 'bow'), ('gold', 'wink', 'cap', 'bars', 'drill', 'backpack'),
        ('blue', 'idle', 'antenna', 'planet', None, None), ('purple', 'tongue', 'goggles', 'gear', 'wrench', 'jetpack'),
        ('green', 'happy', 'sprout', 'recycle', 'camera', 'satchel')]
for name, bgc in (('robots.png', (240, 242, 246, 255)), ('robots-dark.png', (23, 30, 39, 255))):
    W, H = 1760, 540
    bg = Image.new('RGBA', (W, H), bgc)
    scale = 0.58
    for i, c in enumerate(crew):
        b = bot(*c).resize((int(640 * scale), int(800 * scale)), Image.LANCZOS)
        x = int(30 + i * 330)
        y = 60 if i in (1, 3) else 100
        bg.alpha_composite(b, (x, y))
    bg.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name)
