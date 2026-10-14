# Redraws the knight's walk legs, since the painted sheet's walk frames barely move them.
# For each walk row one base frame keeps its body; its legs are erased, and one painted leg
# from that frame is re-posed at the hips for every frame (swung, lifted, foreshortened).
# Reads source-art/knight-sheet-original.jpg, writes source-art/knight-sheet.jpg (same layout),
# which build_assets.py then turns into the game atlas.
# Usage: python3 tools/redraw_knight_legs.py [preview.png]
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import build_assets as B

HERE = os.path.dirname(os.path.abspath(__file__))
ZW, ZH = 186, B.ROW_H        # walk zone around each frame, as build_assets crops it
A = 30                       # side-view leg swing, degrees either way
STANCE = 0.6                 # share of the cycle a foot is on the ground

# Coordinates are zone pixels: x from the zone's left, y measured UP from the feet line.
# leg: polygon of the painted leg to reuse, pivot = its hip; erase: polygon of the old legs
# (red cape pixels inside it are kept); hips: where the near and far leg hang.
ROWS = {
    'down':  dict(base=2, view='front', leg=[(73, 2), (99, 2), (99, 62), (73, 62)], pivot=(86, 60),
                  erase=[(72, 0), (125, 0), (125, 54), (72, 54)], hips=[(86, 60), (108, 60)], axis=97),
    'up':    dict(base=0, view='front', leg=[(98, 2), (124, 2), (124, 36), (98, 36)], pivot=(110, 36),
                  erase=[(72, 0), (126, 0), (126, 33), (72, 33)], hips=[(110, 36), (87, 36)], axis=98.5),
    'right': dict(base=0, view='side', leg=[(107, 8), (146, 8), (146, 24), (130, 32), (128, 53), (107, 53)], pivot=(118, 50),
                  erase=[(48, 0), (152, 0), (152, 47), (48, 47)], hips=[(115, 50), (106, 50)], mirror=False),
    'left':  dict(base=0, view='side', leg=None, pivot=None,
                  erase=[(38, 0), (150, 0), (150, 48), (111, 48), (108, 35), (40, 65)], hips=[(84, 48), (93, 48)], mirror=True),
}
LEFT_LEG_FROM = 'right'      # the left row's legs are hidden by the shield: reuse the right row's leg, mirrored


def Y(y_up):
    return ZH - y_up


def poly_mask(pts, feather=1.2):
    m = Image.new('L', (ZW, ZH), 0)
    ImageDraw.Draw(m).polygon([(x, Y(y)) for x, y in pts], fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(feather))).astype(np.float32) / 255


def is_red(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (r > 45) & (r > g * 1.5) & (r > b * 1.25)


PAD = 4  # the sheet is padded, since the first walk column's zone starts just off its left edge


def zone_slice(row, i):
    x0, b = B.WALK_X[i] - ZW // 2 + PAD, B.WALK_BOTTOM[row] + PAD
    return slice(b - ZH, b), slice(x0, x0 + ZW)


def zone_of(rgb, alpha, row, i):
    sl = zone_slice(row, i)
    return np.dstack([rgb[sl], alpha[sl][..., None] * 255]).astype(np.float32)  # premultiplied: RGB already sits on black


def place(piece, pivot, hip, angle, sy, mirror, sx=1.0):
    """Affine-place a premultiplied RGBA leg: scale along the leg (sy), optional mirror, rotate by angle
    (degrees, + = foot towards +x), with the source pivot landing on hip."""
    t = math.radians(angle)
    c, s = math.cos(t), math.sin(t)
    mx = -1 if mirror else 1
    # forward: q = H + R @ S @ M @ (p - P), R = [[c, s], [-s, c]], S = diag(sx, sy), M = diag(mx, 1)
    F = np.array([[c, s], [-s, c]]) @ np.diag([sx, sy]) @ np.diag([mx, 1])
    Fi = np.linalg.inv(F)
    P = np.array([pivot[0], Y(pivot[1])], float); H = np.array([hip[0], Y(hip[1])], float)
    off = P - Fi @ H
    chans = [Image.fromarray(piece[..., k]).transform((ZW, ZH), Image.AFFINE,
             (Fi[0, 0], Fi[0, 1], off[0], Fi[1, 0], Fi[1, 1], off[1]), Image.BICUBIC) for k in range(4)]
    out = np.dstack([np.asarray(ch) for ch in chans])
    return np.clip(out, 0, None)


def over(top, bottom):
    return top + bottom * (1 - top[..., 3:4] / 255)


def cycle(u):
    """Leg angle (in units of A, + = forward) and lift (0..1) at cycle position u."""
    u %= 1
    if u < STANCE:
        return 1 - 2 * u / STANCE, 0.0
    s = (u - STANCE) / (1 - STANCE)
    e = s * s * (3 - 2 * s)
    return -1 + 2 * e, math.sin(math.pi * s)


def main(preview=None):
    src = Image.open(os.path.join(B.SRC, 'knight-sheet-original.jpg')).convert('RGB')
    rgb = np.pad(np.asarray(src).astype(np.float32), ((PAD, PAD), (PAD, PAD), (0, 0)))
    alpha = np.pad(np.asarray(B.cutout(src, glow=False))[..., 3].astype(np.float32) / 255, PAD)
    out = rgb.copy()
    legs = {}
    for r, (name, cfg) in enumerate(ROWS.items()):
        base = zone_of(rgb, alpha, r, cfg['base'])
        red = is_red(base)
        if cfg['leg']:
            legs[name] = base * (poly_mask(cfg['leg'], 0.6) * ~red)[..., None]
        leg = legs[name] if cfg['leg'] else legs[LEFT_LEG_FROM]
        pivot = cfg['pivot'] or ROWS[LEFT_LEG_FROM]['pivot']
        body = base * (1 - poly_mask(cfg['erase']) * ~red)[..., None]
        for i in range(5):
            frame = np.zeros_like(base)
            poses = [cycle(i / 5), cycle(i / 5 + 0.5)]       # near leg, far leg (front view: left, right)
            if cfg['view'] == 'side':
                planted = max((p for p in poses if p[1] == 0), key=lambda p: abs(p[0]), default=poses[0])
                drop = 39 * (1 - math.cos(math.radians(planted[0] * A)))  # lower the hips so the planted foot stays down
                drop = round(drop * 0.8)
                for k in (1, 0):                              # far leg first, darker
                    ang, lift = poses[k]
                    hx, hy = cfg['hips'][k]
                    sign = -1 if cfg.get('mirror') else 1
                    piece = place(leg, pivot, (hx, hy - drop + lift * 5), sign * ang * A, 1.06 - 0.18 * lift, cfg.get('mirror', False), 1.15)
                    if k == 1: piece[..., :3] *= 0.72
                    frame = over(piece, frame)
                shifted = np.zeros_like(body); shifted[drop:] = body[:ZH - drop] if drop else body
                frame = over(shifted, frame)
            else:
                for k in (0, 1):
                    ang, lift = poses[k]
                    # knee raise: the lifted leg rides up under the tassets / cape and foreshortens;
                    # the leading foot reaches a little lower (towards the viewer)
                    sy = 1 + 0.12 * ang - 0.12 * lift
                    hx, hy = cfg['hips'][k]
                    rise = lift * (16 if name == 'down' else 13) - max(0, ang) * 3
                    frame = over(place(leg, pivot, (hx + (lift * 2 if k == 0 else -lift * 2), hy + rise), 0, sy, k == 1), frame)
                frame = over(body, frame)
            out[zone_slice(r, i)] = np.clip(frame[..., :3], 0, 255)
    out = out[PAD:-PAD, PAD:-PAD]
    Image.fromarray(out.astype(np.uint8)).save(os.path.join(B.SRC, 'knight-sheet.jpg'), quality=95)
    if preview:
        Image.fromarray(out.astype(np.uint8)).crop((0, 0, 930, 768)).save(preview)


if __name__ == '__main__':
    main(*sys.argv[1:])
