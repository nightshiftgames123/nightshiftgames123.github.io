# Turns the source art in tools/source-art/ into game-ready assets in assets/.
# Painted sheets share one layout: 4 walk rows x 5 frames (down, up, right, left) on the
# left, and two columns of three attack poses on the right (A = facing you, B = facing right).
# Pixel-art hero sheets are laid out more freely, so each one lists which figures to use (PIXEL).
# Every atlas has 6 walk slots per direction (painted sheets leave the 6th empty), then A1-A3, B1-B3.
# Backgrounds are removed with soft edges so glows survive, while dark armour stays solid.
# Usage: python3 tools/build_assets.py   (prints the frame table pasted into game.js)
import os, json
import numpy as np
from scipy import ndimage
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
SLOTS = 6                                  # walk frames per direction in every atlas
DIRS = ['down', 'up', 'right', 'left']


# Glowing art (ghosts, the crystal) keeps a long soft ramp so its glow fades out; solid
# characters use a short ramp so dark armour and boots stay opaque instead of see-through.
GLOWY = {'ghost', 'crystal'}


def cutout(img, bg='black', glow=True):
    """RGB image on a flat background -> RGBA with soft edges and solid interiors."""
    rgb = np.asarray(img.convert('RGB')).astype(np.float32)
    if bg == 'black':
        level = rgb.max(axis=2)
        soft = np.clip((level - 14) / 70, 0, 1) if glow else np.clip((level - 9) / 24, 0, 1)
        near_bg = level < 22
    else:  # white
        level = 255 - rgb.min(axis=2)
        soft = np.clip((level - 10) / 60, 0, 1)
        near_bg = level < 18
    # Solid core = clearly bright pixels plus any dim pixels they enclose (dark armour).
    # Dim glow connected to the outside stays soft; true-black pockets stay see-through.
    core = Image.fromarray(np.where(level >= (50 if glow else 28), 255, 0).astype(np.uint8)).copy()  # copy: fromarray views are read-only
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


def keep_main_body(zone):
    """Erase slivers of neighbouring frames: keep only the column span holding most of the figure."""
    a = np.asarray(zone).copy()
    cols = a[..., 3].astype(np.float32).sum(axis=0)
    filled = cols > 255 * 2
    spans, start = [], None
    for x, f in enumerate(list(filled) + [False]):
        if f and start is None: start = x
        if not f and start is not None: spans.append([start, x]); start = None
    merged = []
    for sp in spans:  # bridge small gaps (a sword held slightly apart from the body)
        if merged and sp[0] - merged[-1][1] <= 6: merged[-1][1] = sp[1]
        else: merged.append(sp)
    if not merged:
        return zone
    main = max(merged, key=lambda sp: cols[sp[0]:sp[1]].sum())
    a[:, :main[0]] = 0; a[:, main[1]:] = 0
    return Image.fromarray(a, 'RGBA')


def torso_x(img):
    """Horizontal centre of the body, measured on the middle band so weapons and capes don't pull it."""
    a = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(a > 128)
    if not len(xs):
        return img.width / 2
    top, bot = ys.min(), ys.max()
    band = (ys > top + (bot - top) * 0.35) & (ys < top + (bot - top) * 0.75)
    return float(np.median(xs[band] if band.any() else xs))


def frames_of(sheet):
    """Yield (name, cell image) for every frame, feet anchored at the cell's bottom centre and each
    row centred on the body, so turning around doesn't make the character jump sideways."""
    out = []
    for r, name in enumerate(['down', 'up', 'right', 'left']):
        b = WALK_BOTTOM[r]
        zones = [keep_main_body(sheet.crop((cx - 93, b - ROW_H, cx + 93, b))) for cx in WALK_X]
        centre = sum(torso_x(z) for z in zones) / len(zones)   # one offset per row: no jitter between frames
        for i, zone in enumerate(zones):
            cell = Image.new('RGBA', (CELL_W, CELL_H))
            cell.paste(zone, (round(CELL_W / 2 - centre), CELL_H - FOOT - ROW_H), zone)
            out.append((f'{name}{i}', cell))
        out += [(f'{name}{i}', Image.new('RGBA', (CELL_W, CELL_H))) for i in range(len(zones), SLOTS)]
    for c, (x0, x1) in enumerate(ATK_COLS):
        for r, (y0, y1) in enumerate(ATK_ROWS):
            zone = sheet.crop((x0, y0, x1, y1))
            bbox = zone.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox()
            if not bbox:
                continue
            piece = zone.crop(bbox)
            cell = Image.new('RGBA', (CELL_W, CELL_H))
            px = round(CELL_W / 2 - torso_x(piece))
            py = CELL_H - FOOT - (bbox[3] - bbox[1])
            cell.paste(piece, (px, max(0, py)), piece)
            out.append((f'{"AB"[c]}{r + 1}', cell))
    return out


# Pixel-art hero sheets. Figures are found automatically (one per connected blob, with stray
# sparkles and slash trails joined to the nearest figure) and numbered per row, left to right.
# walk: direction -> (row, [figure numbers]) in play order, or 'mirror <direction>';
# poses: A1-A3 / B1-B3 -> (row, figure number[, 'mirror']). Figures facing the wrong way, or
# drawn with a different prop than their row, are simply left out.
PIXEL_SCALE = 0.58      # sheet px -> cell px, so pixel heroes stand as tall as the painted cast
PIXEL = {
    'queen': dict(attack_x=1900,
                  walk={'down': (0, [0, 1, 2, 5]), 'up': (1, [1, 2, 3, 4, 5]),            # front 4 near-repeats 6; 5 swings the sword out
                        'right': (2, [2, 5, 4, 5]), 'left': 'mirror right'},  # only the shield-up side frames
                  poses={'A1': (0, 6), 'A2': (1, 6), 'A3': (2, 7), 'B1': (0, 6), 'B2': (1, 6), 'B3': (3, 6)}),
    'ninja': dict(attack_x=2200,
                  walk={'down': (0, [0, 1, 2, 3, 4]), 'up': (1, [0, 1, 2, 4, 5]),     # near-duplicate frames dropped
                        'right': (2, [0, 1, 2, 4]), 'left': (3, [0, 1, 2, 4])},
                  poses={'A1': (1, 6), 'A2': (0, 6), 'A3': (1, 6), 'B1': (3, 6, 'mirror'), 'B2': (2, 6, 'mirror'), 'B3': (3, 6, 'mirror')}),
    'sorceress': dict(attack_x=2200,
                      walk={'down': (0, [0, 1, 2, 4]), 'up': (1, [0, 1, 4]),         # front 3 faces away; back 2-3 wear the hood
                            'right': (2, [0, 1, 2, 3, 4]), 'left': (3, [0, 1, 2, 3, 4])},
                      poses={'A1': (0, 5), 'A2': (1, 5), 'A3': (0, 5), 'B1': (1, 6), 'B2': (0, 6), 'B3': (2, 5)}),
}


def pixel_figures(img, attack_x):
    """Find the figures on a pixel sheet: [[(mask, bbox), ...] per row], walk figures first."""
    a = np.asarray(img.convert('RGB')).astype(int)
    lab, _ = ndimage.label(ndimage.binary_dilation(a.max(2) > 40, iterations=6))
    objs = [(i + 1, sl) for i, sl in enumerate(ndimage.find_objects(lab)) if sl is not None]
    big = [(i, sl) for i, sl in objs if sl[0].stop - sl[0].start > 150]
    owner = {i: i for i, _ in big}
    for i, sl in objs:  # sparkles, slash trails: join the nearest figure
        if i in owner:
            continue
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        owner[i] = min(big, key=lambda b: max(0, b[1][1].start - cx, cx - b[1][1].stop) + max(0, b[1][0].start - cy, cy - b[1][0].stop))[0]
    lab = np.vectorize(lambda v: owner.get(v, 0))(lab)
    figs = []
    for i, _ in big:
        ys, xs = np.nonzero(lab == i)
        figs.append((i, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
    rows = [[] for _ in range(4)]
    for i, (x0, y0, x1, y1) in figs:
        rows[min(3, int(y1 / (img.height / 4)))].append((i, (x0, y0, x1, y1)))
    out = []
    for r in rows:  # walk figures left to right, then attack figures left to right
        r.sort(key=lambda f: ((f[1][0] + f[1][2]) / 2 >= attack_x, f[1][0]))
        out.append([((lab == i), box) for i, box in r])
    return out


def register(cells):
    """Line a walk row's frames up on the upper body (head and chest), so the figure doesn't jitter
    sideways when a sword or a leg sticks out further in one frame. Legs and arms keep moving."""
    def band(c):
        a = np.asarray(c).astype(np.float32)
        al = a[..., 3] / 255
        ys = np.nonzero(al.max(1) > 0.5)[0]
        top, h = ys.min(), ys.max() - ys.min()
        g = (a[..., :3].mean(2) / 255 + 0.5) * al          # shade + silhouette, so outlines and faces count
        g[:int(top + h * 0.06)] = 0; g[int(top + h * 0.45):] = 0
        return g
    bands = [band(c) for c in cells]
    ref = sum(bands) / len(bands)
    shifts = []
    for g in bands:
        errs = {dx: np.abs(np.roll(g, dx, axis=1) - ref).mean() for dx in range(-30, 31)}
        shifts.append(min(errs, key=errs.get))
    mean = round(sum(shifts) / len(shifts))
    out = []
    for c, dx in zip(cells, shifts):
        n = Image.new('RGBA', c.size); n.paste(c, (dx - mean, 0)); out.append(n)
    return out


def pixel_frames(name):
    spec = PIXEL[name]
    src = Image.open(f'{SRC}/{name}-sheet.jpg')
    sheet = cutout(src, glow=False)
    rows = pixel_figures(src, spec['attack_x'])

    def piece(r, k, mirror=False):
        mask, (x0, y0, x1, y1) = rows[r][k]
        a = np.asarray(sheet).copy(); a[..., 3] = np.where(mask, a[..., 3], 0)
        p = Image.fromarray(a, 'RGBA').crop((x0, y0, x1, y1))
        p = p.resize((round(p.width * PIXEL_SCALE), round(p.height * PIXEL_SCALE)), Image.LANCZOS)
        return p.transpose(Image.FLIP_LEFT_RIGHT) if mirror else p, y1

    def place(p, centre, bottom_gap):
        cell = Image.new('RGBA', (CELL_W, CELL_H))
        cell.paste(p, (round(CELL_W / 2 - centre), CELL_H - FOOT - p.height - bottom_gap), p)
        return cell

    walks = {}
    for d in DIRS:
        w = spec['walk'][d]
        if isinstance(w, str):
            walks[d] = [p.transpose(Image.FLIP_LEFT_RIGHT) for p in walks[w.split()[1]]]
            continue
        r, ks = w
        pieces = [piece(r, k) for k in ks]
        ground = max(y1 for _, y1 in pieces)            # one feet line per row: lifted feet stay lifted
        centre = sum(torso_x(p) for p, _ in pieces) / len(pieces)
        walks[d] = register([place(p, centre, round((ground - y1) * PIXEL_SCALE)) for p, y1 in pieces])
    out = []
    for d in DIRS:
        out += [(f'{d}{i}', walks[d][i] if i < len(walks[d]) else Image.new('RGBA', (CELL_W, CELL_H))) for i in range(SLOTS)]
    for n in ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']:
        r, k, *m = spec['poses'][n]
        p, _ = piece(r, k, bool(m))
        out.append((n, place(p, torso_x(p), 0)))
    walk_counts = {d: len(walks[d]) for d in DIRS}
    return out, walk_counts


def atlas(name, scales):
    if name in PIXEL:
        frames, walk = pixel_frames(name)
    else:
        frames, walk = frames_of(cutout(Image.open(f'{SRC}/{name}-sheet.jpg'), glow=name in GLOWY)), None
    meta = {'frames': [n for n, _ in frames], 'cols': COLS}
    if walk:
        meta['walk'] = walk
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
    for name, scales in [('queen', [0.8]), ('ninja', [0.8]), ('sorceress', [0.8]), ('skeleton', [0.44]),
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
