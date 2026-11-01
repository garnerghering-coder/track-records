#!/usr/bin/env python3
"""
Render a track outline from OpenStreetMap raceway geometry (ODbL, © OpenStreetMap
contributors) as a white line on a transparent PNG, matching the other layout maps
(the site's .logo-adapt class inverts it for day mode).

  python3 scripts/osm-track-map.py --lat 43.0195 --lon -88.0108 --radius 900 \
      --name "Milwaukee Mile" --out public/media/circuit-layouts/<layoutId>.png

Selects raceway ways whose name matches --name (regex, case-insensitive).
Requires Pillow. Uses a public Overpass endpoint.
"""
import argparse, json, math, re, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw

ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"]

def overpass(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(ep, data=body, headers={"User-Agent": "TrackRecords/1.0 (https://track-records.com)"})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:  # try the next mirror
            print(f"{ep}: {e}", file=sys.stderr)
    sys.exit("no Overpass endpoint answered")

ap = argparse.ArgumentParser()
ap.add_argument("--lat", type=float, required=True); ap.add_argument("--lon", type=float, required=True)
ap.add_argument("--radius", type=int, default=1500); ap.add_argument("--name", required=True)
ap.add_argument("--json", help="use a saved Overpass response instead of querying");
ap.add_argument("--out", required=True); ap.add_argument("--width", type=int, default=1200); ap.add_argument("--stroke", type=int, default=16)
a = ap.parse_args()

d = json.load(open(a.json)) if a.json else overpass(f'[out:json][timeout:90];way["highway"="raceway"](around:{a.radius},{a.lat},{a.lon});out geom;')
ways = [w for w in d["elements"] if re.search(a.name, w.get("tags", {}).get("name", ""), re.I)]
if not ways: sys.exit(f"no raceway named /{a.name}/ near {a.lat},{a.lon}")
k = math.cos(math.radians(a.lat))
lines = [[(p["lon"] * k, -p["lat"]) for p in w["geometry"]] for w in ways]
xs = [x for l in lines for x, _ in l]; ys = [y for l in lines for _, y in l]
pad = a.stroke * 2
scale = (a.width - 2 * pad) / (max(xs) - min(xs))
h = int((max(ys) - min(ys)) * scale + 2 * pad)
img = Image.new("RGBA", (a.width, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
for l in lines:
    pts = [((x - min(xs)) * scale + pad, (y - min(ys)) * scale + pad) for x, y in l]
    dr.line(pts, fill=(255, 255, 255, 255), width=a.stroke, joint="curve")
    r = a.stroke / 2
    for x, y in (pts[0], pts[-1]): dr.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 255))
img.save(a.out, optimize=True)
print(f"{a.out}: {len(ways)} way(s), {a.width}x{h}")
