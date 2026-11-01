#!/usr/bin/env python3
"""
Car side-profile liveries for IMSA seasons from Andy Blackmore's spotter guides
(SpotterGuides.com, used with permission; see docs/CREDITS.md).

    python3 -I scripts/spotter-liveries.py --cache DIR [--download] [--write] [--sheets DIR]

  --cache DIR   where the guide PDFs, extracted pages and per-page results are kept
  --download    fetch the guide list from spotterguides.com/portfolio/{24,25,26}_imsa/ and download
                every "…_ONLINE…pdf" that is not cached yet (sequential, a few seconds apart)
  --write       write PNGs to public/media/car-liveries/<seasonId>/<car>.png and add
                v2_car_liveries rows (through scripts/lib/local-store.mjs). Without it: report only.
  --sheets DIR  contact sheets of the chosen liveries, one per series-season
  --force       also replace liveries that already exist (default: only fill gaps)

Each guide page is one 5000x3235 JPEG (no text layer), extracted with `pdfimages -j`. A page is a
grid of cells; each cell has a solid-colour number box (the colour is the class), driver names,
a side-profile car illustration on white facing right, and team/model text under it.

1. Number boxes: solid-colour rectangles of the page's dominant box size (run-based connected
   components of "flat" non-white pixels whose bounding-box edges are filled).
2. Car number: the digits in the box are segmented and matched against digit templates taken from
   the 2025 Rolex 24 guide's first page, whose 32 numbers are listed below (BOOTSTRAP).
3. Class: the box colour (WeatherTech: black GTP, blue LMP2, red GTD PRO, green GTD; Michelin
   Pilot Challenge: blue GS, yellow TCR). The page's series is the palette its boxes match.
4. Validation: a cell is used only when its number ran that event (our results/qualifying/practice
   rows for the matching series event) in the class of its box colour, its number keeps the
   page's numeric order within the class, and its crop looks like a car (aspect, not cut).
5. Crop: the largest ink component in the cell (rules under the car and the manufacturer logo
   removed), white background removed by filling from the crop border (white paint enclosed by
   the car stays), 1-px feathered edge, original orientation, at most 1200 px wide.
6. For each season the latest guide with the car in the matching class is used; existing
   liveries (IMSA's official art) are never replaced unless --force.

Needs Python 3 with Pillow and numpy, `pdfimages` (poppler-utils) and Node 22.6+ for --write.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from collections import Counter, defaultdict

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(ROOT, "data")
UA = "Mozilla/5.0 (compatible; TrackRecords/1.0; spotter-liveries)"
PORTFOLIOS = ["https://spotterguides.com/portfolio/%s_imsa/" % y for y in ("24", "25", "26")]

BOOTSTRAP_PDF = "SG_25_DAY_ONLINE_V1"
BOOTSTRAP_PAGE = 0
BOOTSTRAP = "5 6 7 10 24 25 31 40 60 63 85 93 2 04 8 11 18 22 43 52 73 74 88 99 1 3 4 007 9 14 20 48".split()

SERIES = {
    "WT": ("IMSA WeatherTech SportsCar Championship",
           {"GTP": (0, 0, 0), "LMP2": (56, 83, 164), "GTDPRO": (206, 52, 60), "GTD": (1, 172, 66)}),
    "MPC": ("IMSA Michelin Pilot Challenge", {"GS": (4, 90, 166), "TCR": (252, 228, 1)}),
}
DARK2 = (30, 24, 30)  # some 2024-2026 GTP boxes are a very dark grey

# guide file code -> regex on the event's name + short name
VENUES = {
    "DIS": r"Daytona", "DAY": r"Daytona", "SEB": r"Sebring", "LBGP": r"Long Beach", "DETROIT": r"Detroit",
    "LAGUNA": r"Laguna|Monterey", "WRLS": r"Laguna|Monterey", "MID_OHIO": r"Mid-Ohio", "WGI": r"Glen",
    "CTMP": r"CTMP|Canadian Tire", "RAm": r"Road America", "VIR": r"VIR|Virginia", "IMS": r"Indianapolis",
    "PLM": r"Petit Le Mans|Road Atlanta", "MRRA": r"Petit Le Mans|Road Atlanta",
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ----------------------------------------------------------------------------- download / extract

def fetch(url, dest=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
    if dest:
        with open(dest + ".part", "wb") as f:
            f.write(body)
        os.replace(dest + ".part", dest)
    return body


def download(cache):
    pdfdir = os.path.join(cache, "pdf")
    os.makedirs(pdfdir, exist_ok=True)
    urls = []
    for p in PORTFOLIOS:
        page = fetch(p).decode("utf8", "replace")
        urls += sorted(set(html.unescape(u) for u in re.findall(r'href="(https://spotterguides\.com/wp-content/uploads/[^"]*ONLINE[^"]*\.pdf)"', page)))
        time.sleep(3)
    for u in urls:
        dest = os.path.join(pdfdir, os.path.basename(u))
        if os.path.exists(dest):
            continue
        log("download", u)
        fetch(u, dest)
        time.sleep(4)


def extract(cache):
    pdfdir, imgdir = os.path.join(cache, "pdf"), os.path.join(cache, "img")
    out = []
    for f in sorted(os.listdir(pdfdir)):
        if not f.lower().endswith(".pdf"):
            continue
        name = f[:-4]
        d = os.path.join(imgdir, name)
        if not os.path.isdir(d):
            os.makedirs(d)
            subprocess.run(["pdfimages", "-j", os.path.join(pdfdir, f), os.path.join(d, "p")], check=True)
        for p in sorted(os.listdir(d)):
            if p.endswith(".jpg"):
                out.append((name, int(re.search(r"(\d+)", p).group(1)), os.path.join(d, p)))
    return out


# ----------------------------------------------------------------------------- connected components

def label(mask):
    """4-connected components of a bool mask (run-length union-find).
    Returns dicts with x0, y0, x1, y1 (exclusive), area and runs [(y, start, end)]."""
    parent = []

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    allruns, prev = [], []
    padded = np.zeros((mask.shape[0], mask.shape[1] + 2), np.int8)
    padded[:, 1:-1] = mask
    d = np.diff(padded, axis=1)
    for y in range(mask.shape[0]):
        ss = np.flatnonzero(d[y] == 1).tolist()
        ee = np.flatnonzero(d[y] == -1).tolist()
        cur, j = [], 0
        for s, e in zip(ss, ee):
            rid = len(parent)
            parent.append(rid)
            while j < len(prev) and prev[j][1] <= s:
                j += 1
            k = j
            while k < len(prev) and prev[k][0] < e:
                a, b = find(rid), find(prev[k][2])
                if a != b:
                    parent[max(a, b)] = min(a, b)
                k += 1
            cur.append((s, e, rid))
            allruns.append((y, s, e, rid))
        prev = cur
    comps = {}
    for y, s, e, rid in allruns:
        r = find(rid)
        c = comps.get(r)
        if c is None:
            comps[r] = c = {"x0": s, "y0": y, "x1": e, "y1": y + 1, "area": 0, "runs": []}
        c["x0"] = min(c["x0"], s)
        c["x1"] = max(c["x1"], e)
        c["y1"] = y + 1
        c["area"] += e - s
        c["runs"].append((y, s, e))
    return list(comps.values())


def comp_mask(c):
    m = np.zeros((c["y1"] - c["y0"], c["x1"] - c["x0"]), bool)
    for y, s, e in c["runs"]:
        m[y - c["y0"], s - c["x0"]:e - c["x0"]] = True
    return m


# ----------------------------------------------------------------------------- number boxes + digits

def find_boxes(page, f=2):
    """Number boxes: flat-colour rectangles of the page's dominant box height."""
    a = np.asarray(page.reduce(f)).astype(np.int16)
    white = a.min(2) > 200
    dx = np.abs(a[:, 1:] - a[:, :-1]).max(2) <= 18
    dy = np.abs(a[1:] - a[:-1]).max(2) <= 18
    solid = np.zeros(white.shape, bool)
    solid[:-1, :-1] = dx[:-1] & dy[:, :-1]
    solid &= ~white
    cands = []
    for c in label(solid):
        w, h = c["x1"] - c["x0"], c["y1"] - c["y0"]
        if w < 18 or h < 18 or c["area"] < 250:
            continue
        m = comp_mask(c)
        top, bot = m[:2].any(0).mean(), m[-2:].any(0).mean()
        left, right = m[:, :2].any(1).mean(), m[:, -2:].any(1).mean()
        # digits may overflow the left/right edge (007, 343), never the top/bottom
        if min(top, bot) < 0.85 or left + right < 1.3 or min(left, right) < 0.3:
            continue
        fill = c["area"] / (w * h)
        if fill >= 0.97:  # no digits inside: a flag, a logo panel, the footer
            continue
        col = a[c["y0"]:c["y1"], c["x0"]:c["x1"]][m].mean(0)
        cands.append(dict(x0=c["x0"] * f, y0=c["y0"] * f, x1=c["x1"] * f, y1=c["y1"] * f, col=[int(v) for v in col]))
    if not cands:
        return []
    cnt = Counter(round((b["y1"] - b["y0"]) / 6) for b in cands)
    hm = max(cnt, key=lambda k: (cnt[k], k)) * 6
    same_h = [b for b in cands if abs((b["y1"] - b["y0"]) - hm) <= 0.12 * hm]
    ws = sorted(b["x1"] - b["x0"] for b in same_h)
    wm = ws[len(ws) // 2]
    return [b for b in same_h if 0.75 * wm <= b["x1"] - b["x0"] <= 1.8 * wm]


def glyphs(page, b):
    """Digit glyphs inside a box, left to right (bool arrays cropped to the glyph)."""
    a = np.asarray(page.crop((b["x0"], b["y0"], b["x1"], b["y1"]))).astype(np.int16)
    d = np.abs(a - np.array(b["col"])).max(2)
    ink = d > max(60, 0.5 * np.percentile(d, 99.5))  # white digits; blue on yellow TCR boxes
    ink[:2] = ink[-2:] = False
    cols = ink.any(0)
    out, x, W = [], 0, ink.shape[1]
    while x < W:
        if not cols[x]:
            x += 1
            continue
        s = x
        while x < W and cols[x]:
            x += 1
        g = ink[:, s:x]
        rows = np.flatnonzero(g.any(1))
        g = g[rows[0]:rows[-1] + 1]
        if g.sum() >= 30:
            out.append(dict(g=g, clip=("L" if s <= 1 else "") + ("R" if x >= W - 1 else "")))
    return out


def norm_glyph(g, H=48):
    W = max(1, round(g.shape[1] * H / g.shape[0]))
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)) > 127


def classify(g, T, clip=""):
    """(digit, IoU, runner-up IoU). A glyph cut by the box edge is compared with that part of each template."""
    n = norm_glyph(g)
    scores = {}
    for dgt, ts in T.items():
        best = 0.0
        for t in ts:
            if clip and n.shape[1] < t.shape[1]:
                t = t[:, t.shape[1] - n.shape[1]:] if clip == "L" else t[:, :n.shape[1]]
            r = n.shape[1] / t.shape[1]
            if r < 0.75 or r > 1.33:
                continue
            m = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((t.shape[1], t.shape[0]))) > 127
            best = max(best, float((m & t).sum() / max(1, (m | t).sum())))
        scores[dgt] = best
    ds = sorted(scores, key=lambda k: -scores[k])
    return ds[0], scores[ds[0]], scores[ds[1]]


def read_number(page, b, T):
    res = [classify(g["g"], T, g["clip"]) for g in glyphs(page, b)]
    if not res:
        return "", 0.0, 0.0
    return "".join(r[0] for r in res), min(r[1] for r in res), min(r[1] - r[2] for r in res)


def reading_order(boxes):
    h = boxes[0]["y1"] - boxes[0]["y0"]
    return sorted(boxes, key=lambda b: (round(b["y0"] / h), b["x0"]))


def bootstrap_templates(pages):
    path = next(p for n, i, p in pages if n == BOOTSTRAP_PDF and i == BOOTSTRAP_PAGE)
    page = Image.open(path).convert("RGB")
    boxes = reading_order(find_boxes(page))
    if len(boxes) != len(BOOTSTRAP):
        raise SystemExit(f"bootstrap page: {len(boxes)} boxes, expected {len(BOOTSTRAP)}")
    T = defaultdict(list)
    for b, num in zip(boxes, BOOTSTRAP):
        gs = glyphs(page, b)
        if len(gs) != len(num):
            continue
        for dgt, g in zip(num, gs):
            if not g["clip"]:
                T[dgt].append(norm_glyph(g["g"]))
    if len(T) != 10:
        raise SystemExit("bootstrap page: templates for %s only" % sorted(T))
    return dict(T)


# ----------------------------------------------------------------------------- cells + car crop

INK = 225  # a pixel is ink when its darkest channel is below this


def cells(boxes):
    """Cell rectangle of each box: right edge = next column's box, bottom = next box below."""
    lefts = []
    for x in sorted(b["x0"] for b in boxes):
        if not lefts or x - lefts[-1][-1] > 40:
            lefts.append([x])
        else:
            lefts[-1].append(x)
    lefts = [min(c) for c in lefts]
    pitch = float(np.median(np.diff(lefts))) if len(lefts) > 1 else 1200.0
    for b in boxes:
        ci = max(i for i, l in enumerate(lefts) if b["x0"] >= l - 40)
        b["col_i"] = ci
        b["cx1"] = int(lefts[ci + 1] - 12) if ci + 1 < len(lefts) else int(lefts[ci] + pitch - 12)
    for ci in range(len(lefts)):
        col = sorted([b for b in boxes if b["col_i"] == ci], key=lambda b: b["y0"])
        steps = [n["y0"] - b["y0"] for b, n in zip(col, col[1:])]
        rp = int(np.median(steps)) if steps else int((col[0]["y1"] - col[0]["y0"]) * 2.7)
        for b, n in zip(col, col[1:] + [None]):
            b["cy1"] = n["y0"] - 4 if n is not None and n["y0"] - b["y0"] < 1.5 * rp else b["y0"] + rp - 4
    return boxes


def car_bbox(page, b):
    """The car illustration in a cell: bbox (page coords) + mask of its ink components."""
    x0, y0, x1, y1 = b["x0"], b["y0"], min(b["cx1"], page.width), min(b["cy1"], page.height)
    a = np.asarray(page.crop((x0, y0, x1, y1))).astype(np.int16)
    ink = a.min(2) < INK
    ink[: b["y1"] - y0 + 3, : b["x1"] - x0 + 3] = False  # the number box
    # rules under the car: an unbroken ink run from the cell's left edge across most of the cell
    first_gap = np.where(ink.all(1), ink.shape[1], np.argmin(ink, axis=1))
    rule = first_gap >= 0.6 * ink.shape[1]
    y = 0
    while y < len(rule):
        if rule[y]:
            s0 = y
            while y < len(rule) and rule[y]:
                y += 1
            if y - s0 <= 8:
                ink[max(0, s0 - 1):y + 1] = False
        y += 1
    comps = sorted(label(ink), key=lambda c: -c["area"])
    if not comps:
        return None
    main = comps[0]
    keep = [main]
    for c in comps[1:]:
        if c["area"] < 0.015 * main["area"]:
            break
        if c["x1"] <= b["x1"] - x0 + 10:
            continue  # manufacturer logo under the number box
        if c["x0"] < main["x1"] and c["x1"] > main["x0"] and c["y0"] < main["y1"] and c["y1"] > main["y0"]:
            keep.append(c)
    bx0, by0 = min(c["x0"] for c in keep), min(c["y0"] for c in keep)
    bx1, by1 = max(c["x1"] for c in keep), max(c["y1"] for c in keep)
    m = np.zeros((by1 - by0, bx1 - bx0), bool)
    for c in keep:
        for yy, s, e in c["runs"]:
            m[yy - by0, s - bx0:e - bx0] = True
    return dict(x0=x0 + bx0, y0=y0 + by0, x1=x0 + bx1, y1=y0 + by1, mask=m,
                cut=bx0 == 0 or by0 == 0 or bx1 == ink.shape[1] or by1 == ink.shape[0])


def car_ok(cb, b):
    if cb is None or cb["cut"]:
        return "cut by the cell edge"
    w, h = cb["x1"] - cb["x0"], cb["y1"] - cb["y0"]
    if not 2.0 <= w / h <= 5.5:
        return f"odd shape {w}x{h}"
    if w < 0.45 * (b["cx1"] - b["x0"]):
        return f"too narrow ({w}px)"
    return None


def cutout(page, cb, pad=3):
    """RGBA car: background = non-car pixels connected to the border; feathered 1-px edge."""
    x0, y0, x1, y1 = cb["x0"] - pad, cb["y0"] - pad, cb["x1"] + pad, cb["y1"] + pad
    a = np.asarray(page.crop((x0, y0, x1, y1))).astype(np.float32)
    keep = np.zeros(a.shape[:2], bool)
    keep[pad:pad + cb["mask"].shape[0], pad:pad + cb["mask"].shape[1]] = cb["mask"]
    outside = np.zeros_like(keep)
    H, W = keep.shape
    for c in label(~keep):
        if c["x0"] == 0 or c["y0"] == 0 or c["x1"] == W or c["y1"] == H:
            for y, s, e in c["runs"]:
                outside[y, s:e] = True
    hard = ~outside
    ring = np.zeros_like(hard)
    ring[1:] |= hard[:-1]
    ring[:-1] |= hard[1:]
    ring[:, 1:] |= hard[:, :-1]
    ring[:, :-1] |= hard[:, 1:]
    ring &= ~hard
    alpha = hard.astype(np.float32)
    alpha[ring] = np.clip((250 - a.min(2)[ring]) / (250 - INK), 0, 1)
    al = alpha[..., None]
    soft = (al > 0) & (al < 1)
    rgb = np.where(soft, (a - (1 - al) * 255) / np.maximum(al, 1e-3), a)  # un-blend the white
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")
    im = im.crop(im.getbbox())
    if im.width > 1200:
        im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
    return im


# ----------------------------------------------------------------------------- our data

def ndjson(table):
    with open(os.path.join(DATA, table + ".ndjson")) as f:
        return [json.loads(l) for l in f if l.strip()]


def load_entries():
    """{series key: {year: {"season": row, "events": [{..., "cars": {num: set(classes)}}]}}}"""
    series = {s["id"]: s["name"] for s in ndjson("v2_series")}
    want = {v[0]: k for k, v in SERIES.items()}
    seasons = {s["id"]: (want[series[s["series_id"]]], s) for s in ndjson("v2_seasons") if series.get(s["series_id"]) in want}
    events = {e["id"]: e for e in ndjson("v2_events") if e["season_id"] in seasons}
    sessions = {s["id"]: s["event_id"] for s in ndjson("v2_sessions") if s["event_id"] in events}
    cars = defaultdict(lambda: defaultdict(set))
    for t in ("v2_race_results", "v2_qualifying_results", "v2_practice_results"):
        for r in ndjson(t):
            ev = sessions.get(r["session_id"])
            if ev:
                cls = (r.get("extra_data") or {}).get("Class")
                cars[ev][str(r["car_number"])].add(cls)
    out = defaultdict(dict)
    for sid, (key, s) in seasons.items():
        evs = sorted([e for e in events.values() if e["season_id"] == sid], key=lambda e: e["start_date"])
        out[key][s["year"]] = {"season": s, "events": [dict(e, cars=cars[e["id"]]) for e in evs]}
    return out


def guide_event(entries, key, name):
    m = re.match(r"SG_?(\d\d)_?(.+?)_ONLINE", name)
    if not m:
        return None
    year, code = 2000 + int(m.group(1)), m.group(2)
    rx = VENUES.get(code)
    season = entries.get(key, {}).get(year)
    if not rx or not season:
        return None
    hits = [e for e in season["events"] if re.search(rx, f'{e["name"]} {e.get("short_name") or ""}', re.I)]
    return (year, hits[0]) if len(hits) == 1 else None


def nearest_class(col):
    best = None
    for key, (_, pal) in SERIES.items():
        for cls, c in pal.items():
            d = max(abs(a - b) for a, b in zip(col, c))
            if cls == "GTP":
                d = min(d, max(abs(a - b) for a, b in zip(col, DARK2)))
            if best is None or d < best[0]:
                best = (d, key, cls)
    return (best[1], best[2]) if best[0] <= 30 else (None, None)


def ordered(nums):
    """Indices of the longest non-decreasing subsequence of nums."""
    n = len(nums)
    best, prev = [1] * n, [-1] * n
    for i in range(n):
        for j in range(i):
            if nums[j] <= nums[i] and best[j] + 1 > best[i]:
                best[i], prev[i] = best[j] + 1, j
    if not n:
        return set()
    i = max(range(n), key=lambda k: best[k])
    keep = set()
    while i >= 0:
        keep.add(i)
        i = prev[i]
    return keep


# ----------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--cache", required=True)
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sheets")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    cache = os.path.abspath(args.cache)
    if args.download:
        download(cache)
    pages = extract(cache)
    T = bootstrap_templates(pages)
    entries = load_entries()
    existing = defaultdict(set)
    for l in ndjson("v2_car_liveries"):
        existing[l["season_id"]].add(str(l["car_number"]))

    cells_ok = []  # validated cells
    problems = []
    for name, idx, path in pages:
        page = Image.open(path).convert("RGB")
        boxes = find_boxes(page)
        if not boxes:
            continue
        boxes = reading_order(cells(boxes))
        for b in boxes:
            b["num"], b["iou"], b["margin"] = read_number(page, b, T)
            b["series"], b["cls"] = nearest_class(b["col"])
        key = Counter(b["series"] for b in boxes if b["series"]).most_common(1)
        if not key:
            continue
        key = key[0][0]
        ge = guide_event(entries, key, name)
        tag = f"{name} p{idx + 1}"
        if ge is None:
            problems.append((tag, "*", f"no {key} event in our data for this guide"))
            continue
        year, ev = ge
        # numeric order within each class on the page
        bad_order = set()
        for cls in set(b["cls"] for b in boxes):
            run = [i for i, b in enumerate(boxes) if b["cls"] == cls and b["series"] == key]
            nums = [int(boxes[i]["num"]) if boxes[i]["num"].isdigit() else -1 for i in run]
            ok = ordered(nums)
            bad_order |= {run[k] for k in range(len(run)) if k not in ok}
        for i, b in enumerate(boxes):
            why = None
            if b["series"] != key:
                why = f"box colour {b['col']} not a {key} class"
            elif not b["num"] or b["iou"] < 0.7:
                why = f"unreadable number ({b['num']!r}, IoU {b['iou']:.2f})"
            elif b["num"] not in ev["cars"]:
                why = "not in our results for this event"
            elif b["cls"] not in ev["cars"][b["num"]]:
                why = f"class {b['cls']} but our results say {sorted(c for c in ev['cars'][b['num']] if c)}"
            elif i in bad_order:
                why = "breaks the page's numeric order"
            if why is None:
                cb = car_bbox(page, b)
                why = car_ok(cb, b)
            if why:
                problems.append((tag, b["num"] or "?", why))
                continue
            cells_ok.append(dict(key=key, year=year, event=ev, guide=tag,
                                 path=path, num=b["num"], cls=b["cls"], box=b, cb=cb))
        log(f"{tag}: {key} {ev['short_name'] or ev['name']}: {len(boxes)} boxes, "
            f"{sum(1 for c in cells_ok if c['guide'] == tag)} usable")

    # latest guide per season + car
    chosen = {}
    for c in cells_ok:
        season = entries[c["key"]][c["year"]]["season"]
        k = (season["id"], c["num"])
        if k not in chosen or c["event"]["start_date"] > chosen[k]["event"]["start_date"]:
            chosen[k] = dict(c, season=season)

    summary = []
    rows = []
    sheets = defaultdict(list)
    outroot = os.path.join(ROOT, "public", "media", "car-liveries")
    for key in SERIES:
        for year, s in sorted(entries.get(key, {}).items()):
            season = s["season"]
            allcars = set().union(*[set(e["cars"]) for e in s["events"]]) if s["events"] else set()
            have = existing[season["id"]] & allcars
            new = []
            for num in sorted(allcars, key=lambda n: (int(n) if n.isdigit() else 9999, n)):
                if num in have and not args.force:
                    continue
                c = chosen.get((season["id"], num))
                if c:
                    new.append(c)
            missing = sorted(allcars - have - {c["num"] for c in new}, key=lambda n: (int(n) if n.isdigit() else 9999, n))
            summary.append(dict(series=SERIES[key][0], year=year, cars=len(allcars), before=len(have),
                                after=len(have | {c["num"] for c in new}), missing=missing,
                                guides=sorted(set(c["guide"].split(" ")[0] for c in new))))
            pagecache = {}
            for c in new:
                if c["path"] not in pagecache:
                    pagecache.clear()
                    pagecache[c["path"]] = Image.open(c["path"]).convert("RGB")
                im = cutout(pagecache[c["path"]], c["cb"])
                sheets[(SERIES[key][0], year)].append((c["num"], c["guide"], im))
                if args.write:
                    d = os.path.join(outroot, season["id"])
                    os.makedirs(d, exist_ok=True)
                    f = os.path.join(d, f"{c['num']}.png")
                    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(f, optimize=True)
                    rows.append(dict(season_id=season["id"], car_number=c["num"],
                                     image_url=f"/media/car-liveries/{season['id']}/{c['num']}.png"))

    if args.write and rows:
        js = """
import { openStore } from %s;
const rows = JSON.parse(process.argv[1]);
const store = openStore({ writable: true });
const all = (await store.from("v2_car_liveries").select("*")).data;
for (const r of rows) {
  const ex = all.find((l) => l.season_id === r.season_id && String(l.car_number) === r.car_number);
  const res = ex ? await store.from("v2_car_liveries").update({ image_url: r.image_url }).eq("id", ex.id)
                 : await store.from("v2_car_liveries").insert(r);
  if (res.error) throw new Error(res.error.message);
}
await store.flush();
console.error(`${rows.length} v2_car_liveries rows written`);
""" % json.dumps("file://" + os.path.join(ROOT, "scripts", "lib", "local-store.mjs"))
        subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", js, json.dumps(rows)],
                       check=True, cwd=ROOT)

    if args.sheets:
        os.makedirs(args.sheets, exist_ok=True)
        for (sname, year), tiles in sheets.items():
            W, H, n = 420, 150, 4
            sheet = Image.new("RGB", (W * n, H * ((len(tiles) + n - 1) // n)), (150, 150, 150))
            d = ImageDraw.Draw(sheet)
            for i, (num, guide, im) in enumerate(tiles):
                t = im.copy()
                t.thumbnail((W - 12, H - 26))
                x, y = (i % n) * W, (i // n) * H
                sheet.paste(t, (x + 6, y + 22), t)
                d.text((x + 6, y + 4), f"#{num}  {guide}", fill=(255, 255, 0))
            fn = os.path.join(args.sheets, re.sub(r"\W+", "_", f"{sname}_{year}") + ".png")
            sheet.save(fn)
            log("sheet", fn)

    report = dict(summary=summary, problems=[dict(guide=g, car=n, why=w) for g, n, w in problems])
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
