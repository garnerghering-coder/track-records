#!/usr/bin/env python3
"""
Turn a rendered circuit map (e.g. a Wikimedia Commons PNG render) into the site's
layout-map style: the circuit only, as a WHITE line on transparent (the site's
.logo-adapt class inverts it for day mode).

  python3 scripts/clean-track-map.py --in map.png --out public/media/circuit-layouts/<id>.png [--open 9] [--dark 90]

1. keep near-black pixels (luminance < --dark): drops coloured roads, grey alternate
   sections, red arrows, blue water…
2. morphological opening (erode then dilate, --open px): removes anything thinner
   than the track line — text, number circles, thin streets, scale bars
3. keep the largest connected shape (the circuit)
4. crop tight, scale to 1200 px wide, white on transparent
Requires Pillow + numpy.
"""
import argparse
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--open", type=int, default=9, help="opening size in px (odd); 0 disables")
ap.add_argument("--dark", type=int, default=90, help="max luminance counted as track (0-255)")
ap.add_argument("--width", type=int, default=1200)
ap.add_argument("--keep-frac", type=float, default=1.0, help="also keep shapes at least this fraction of the largest (for lines broken by markers)")
a = ap.parse_args()

im = Image.open(a.src).convert("RGBA")
bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
lum = np.asarray(bg.convert("L"))
mask = Image.fromarray(((lum < a.dark) * 255).astype(np.uint8))
if a.open:
    mask = mask.filter(ImageFilter.MinFilter(a.open)).filter(ImageFilter.MaxFilter(a.open))
m = np.asarray(mask) > 127

# largest 8-connected component
h, w = m.shape
lab = np.zeros((h, w), dtype=np.int32); best, best_n, cur = 0, 0, 0; sizes = {}
for y0, x0 in zip(*np.nonzero(m)):
    if lab[y0, x0]: continue
    cur += 1; n = 0; q = deque([(y0, x0)]); lab[y0, x0] = cur
    while q:
        y, x = q.popleft(); n += 1
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur; q.append((yy, xx))
    sizes[cur] = n
    if n > best_n: best, best_n = cur, n
keep_ids = [k for k, n in sizes.items() if n >= best_n * a.keep_frac]
keep = np.isin(lab, keep_ids)
ys, xs = np.nonzero(keep)
pad = 12
y1, y2, x1, x2 = max(ys.min() - pad, 0), min(ys.max() + pad, h - 1), max(xs.min() - pad, 0), min(xs.max() + pad, w - 1)
crop = keep[y1 : y2 + 1, x1 : x2 + 1]
alpha = Image.fromarray((crop * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
out = Image.new("RGBA", alpha.size, (255, 255, 255, 0)); out.putalpha(alpha)
ratio = a.width / out.width
out = out.resize((a.width, max(1, round(out.height * ratio))), Image.LANCZOS)
out.save(a.out, optimize=True)
print(f"{a.out}: kept {best_n} px of {int(m.sum())}, {out.width}x{out.height}")
