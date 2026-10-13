# Turns the source art in tools/source-art/ into game-ready assets in assets/.
# Sprite sheets share one layout: 4 walk rows x 5 frames (down, up, right, left) on the
# left, and two columns of three attack poses on the right (A = facing you, B = facing right).
# Backgrounds are removed with soft edges so glows survive, while dark armour stays solid.
# Usage: python3 tools/build_assets.py   (prints the frame table pasted into game.js)
import os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source-art')
OUT = os.path.join(HERE, '..', 'assets')

WALK_X = [92, 279, 465, 650, 836]          # column centres of the walk frames
WALK_BOTTOM = [190, 378, 566, 760]         # feet line of each walk row
ROW_H = 188
ATK_COLS = [(935, 1155), (1155, 1376)]     # A, B
ATK_ROWS = [(0, 245), (245, 490), (490, 768)]
CELL_W, CELL_H, FOOT = 236, 236, 8         # source-pixel cell; feet sit FOOT px above its bottom
COLS = 8


def cutout(img, bg='black'):
    """RGB image on a flat background -> RGBA with soft edges and solid interiors."""
    rgb = np.asarray(img.convert('RGB')).astype(np.float32)
    if bg == 'black':
        level = rgb.max(axis=2)
        soft = np.clip((level - 14) / 70, 0, 1)
        near_bg = level < 22
    else:  # white
        level = 255 - rgb.min(axis=2)
        soft = np.clip((level - 10) / 60, 0, 1)
        near_bg = level < 18
    # Solid core = clearly bright pixels plus any dim pixels they enclose (dark armour).
    # Dim glow connected to the outside stays soft; true-black pockets stay see-through.
    core = Image.fromarray(np.where(level >= 50, 255, 0).astype(np.uint8)).copy()  # copy: fromarray views are read-only
    w, h = core.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if core.getpixel(seed) == 0:
            ImageDraw.floodfill(core, seed, 128)
    enclosed = (np.asarray(core) != 128) & ~near_bg
    enclosed = np.asarray(Image.fromarray((enclosed * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    a = np.maximum(soft, enclosed)
    if bg == 'black':  # un-blend the black so glow edges don't go muddy
        rgb = np.where(a[..., None] > 0, rgb / np.maximum(a[..., None], 1e-3), 0)
    else:
        rgb = np.where(a[..., None] > 0, (rgb - 255 * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3), 0)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def frames_of(sheet):
    """Yield (name, cell image) for every frame, feet anchored at the cell's bottom centre."""
    out = []
    for r, name in enumerate(['down', 'up', 'right', 'left']):
        b = WALK_BOTTOM[r]
        for i, cx in enumerate(WALK_X):
            zone = sheet.crop((cx - 93, b - ROW_H, cx + 93, b))
            cell = Image.new('RGBA', (CELL_W, CELL_H))
            cell.paste(zone, (CELL_W // 2 - 93, CELL_H - FOOT - ROW_H), zone)
            out.append((f'{name}{i}', cell))
    for c, (x0, x1) in enumerate(ATK_COLS):
        for r, (y0, y1) in enumerate(ATK_ROWS):
            zone = sheet.crop((x0, y0, x1, y1))
            bbox = zone.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox()
            if not bbox:
                continue
            piece = zone.crop(bbox)
            cell = Image.new('RGBA', (CELL_W, CELL_H))
            px = CELL_W // 2 - (bbox[2] - bbox[0]) // 2
            py = CELL_H - FOOT - (bbox[3] - bbox[1])
            cell.paste(piece, (px, max(0, py)), piece)
            out.append((f'{"AB"[c]}{r + 1}', cell))
    return out


def atlas(name, scales):
    sheet = cutout(Image.open(f'{SRC}/{name}-sheet.jpg'))
    frames = frames_of(sheet)
    meta = {'frames': [n for n, _ in frames], 'cols': COLS}
    for s in scales:
        w, h = round(CELL_W * s), round(CELL_H * s)
        rows = (len(frames) + COLS - 1) // COLS
        at = Image.new('RGBa', (w * COLS, h * rows))
        for i, (_, f) in enumerate(frames):
            at.paste(f.convert('RGBa').resize((w, h), Image.LANCZOS), ((i % COLS) * w, (i // COLS) * h))
        fn = f'{name}@{s}.webp'
        at.convert('RGBA').save(f'{OUT}/{fn}', quality=88, method=6)
        meta[str(s)] = {'file': fn, 'w': w, 'h': h}
    return meta


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, scales in [('wizard', [0.44]), ('knight', [0.44]), ('skeleton', [0.44]),
                         ('goblin', [0.44, 0.8]), ('ghost', [0.44, 0.8])]:
        meta[name] = atlas(name, scales)
    crystal = cutout(Image.open(f'{SRC}/crystal.jpg')).crop((110, 120, 920, 900))
    for s in (32, 64, 160):
        crystal.convert('RGBa').resize((s, s), Image.LANCZOS).convert('RGBA').save(f'{OUT}/crystal{s}.webp', quality=90, method=6)
    Image.open(f'{SRC}/floor.jpg').save(f'{OUT}/floor.jpg', quality=80)
    cutout(Image.open(f'{SRC}/levelup-frame.jpg'), bg='white').save(f'{OUT}/levelup.webp', quality=88, method=6)
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
