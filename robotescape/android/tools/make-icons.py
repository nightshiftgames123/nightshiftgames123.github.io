#!/usr/bin/env python3
"""Regenerate the Robot Escape app icons.

Pure standard library (zlib + struct) so it runs anywhere without Pillow.
Run from the repo root:  python3 robotescape/android/tools/make-icons.py
"""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'icons')

def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

class Img:
    def __init__(self, w, h, bg=(0, 0, 0)):
        self.w, self.h = w, h
        self.px = bytearray(bg * w * h)

    def set(self, x, y, c, a=1.0):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        i = (y * self.w + x) * 3
        if a >= 1.0:
            self.px[i:i + 3] = bytes(c)
        else:
            for k in range(3):
                self.px[i + k] = int(self.px[i + k] * (1 - a) + c[k] * a)

    def vgrad(self, top, bot):
        for y in range(self.h):
            t = y / max(1, self.h - 1)
            c = tuple(int(top[k] + (bot[k] - top[k]) * t) for k in range(3))
            row = bytes(c) * self.w
            self.px[y * self.w * 3:(y + 1) * self.w * 3] = row

    def rect(self, x, y, w, h, c):
        for yy in range(int(round(y)), int(round(y + h))):
            for xx in range(int(round(x)), int(round(x + w))):
                self.set(xx, yy, c)

    def disc(self, cx, cy, r, c, a=1.0):
        r2 = r * r
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                d = (xx - cx) ** 2 + (yy - cy) ** 2
                if d <= r2:
                    self.set(xx, yy, c, a)

    def glow(self, cx, cy, r, c, strength=0.5):
        for yy in range(int(cy - r), int(cy + r + 1)):
            for xx in range(int(cx - r), int(cx + r + 1)):
                d = ((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5
                if d <= r:
                    self.set(xx, yy, c, strength * (1 - d / r) ** 2)

    def png(self, path):
        raw = bytearray()
        stride = self.w * 3
        for y in range(self.h):
            raw.append(0)
            raw += self.px[y * stride:(y + 1) * stride]
        def chunk(tag, data):
            return (struct.pack('>I', len(data)) + tag + data +
                    struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 2, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        png += chunk(b'IEND', b'')
        with open(path, 'wb') as f:
            f.write(png)

BODY, DARK, LEG = hexc('#4fd1c5'), hexc('#3bb5ac'), hexc('#1f6b64')
ACCENT, VISOR, CHEST = hexc('#ffd23f'), hexc('#0a0e14'), hexc('#02201d')
WHITE = (255, 255, 255)

def robot(im, cx, cy, s):
    """ESC-9 drawn around (cx, cy) at scale s — same shape as skin 0 in game."""
    def R(x, y, w, h, c):
        im.rect(cx + x * s, cy + y * s, w * s, h * s, c)
    im.glow(cx, cy - 4 * s, 26 * s, BODY, 0.30)
    R(-10, 10, 7, 10, LEG)
    R(3, 10, 7, 10, LEG)
    R(-12, -10, 24, 22, BODY)
    R(-5, -3, 10, 8, CHEST)
    R(-10, -22, 20, 13, DARK)
    R(-7, -19, 15, 6, VISOR)
    R(1, -17, 5, 3, WHITE)
    R(-1, -30, 2, 8, BODY)
    im.disc(cx, cy - 31 * s, 2.6 * s, ACCENT)
    im.glow(cx, cy - 31 * s, 7 * s, ACCENT, 0.55)

def make(size, path, cover=0.62):
    im = Img(size, size)
    im.vgrad(hexc('#122031'), hexc('#070b11'))
    s = size * cover / 53.0            # robot art is ~53 units tall
    robot(im, size / 2, size / 2 + 5 * s, s)
    im.png(path)
    print('wrote', os.path.relpath(path), size, 'x', size)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make(192, os.path.join(OUT, 'icon-192.png'))
    make(512, os.path.join(OUT, 'icon-512.png'))
    make(512, os.path.join(OUT, 'icon-maskable-512.png'), cover=0.42)  # 80% safe zone
    make(180, os.path.join(OUT, 'apple-touch-icon.png'))
    make(32,  os.path.join(OUT, 'favicon-32.png'))
