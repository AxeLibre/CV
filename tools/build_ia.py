"""
Puce « IA » en particules (projet « IA open source en local ») : boîtier, broches,
lettres IA, pistes de circuit terminées par des pastilles.

Les points des pistes portent, dans leur fichier .col (alpha 0 : la couleur reste le
dégradé holographique du site) :
  G = position le long de la piste (0 à la broche, 1 à la pastille),
  R = décalage propre à la piste, B = 255 (point de piste).
Le shader y fait circuler des impulsions lumineuses : les « électrons ».

    python tools/build_ia.py
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from pointcloud import normalize, preview_png, write_bin
from build_milan import _hilbert_perm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "shapes")
PREV = os.path.join(ROOT, "tools", "previews")
N = 32768
FONT = r"C:\Windows\Fonts\bahnschrift.ttf"
rng = np.random.default_rng(42)
DEPTH = 0.035


def seg_points(a, b, n):
    t = rng.random(n)
    return a + (b - a) * t[:, None], t


def square_outline(h, n, width=0.012):
    """Contour d'un carré de demi-côté h (épaisseur width), points uniformes."""
    corners = np.array([[-h, -h], [h, -h], [h, h], [-h, h]])
    per = np.repeat(np.arange(4), n // 4)
    t = rng.random(len(per))
    p = corners[per] + (corners[(per + 1) % 4] - corners[per]) * t[:, None]
    return p + rng.normal(0, width, p.shape)


def ring(c, r, n, width=0.006):
    a = rng.random(n) * 2 * math.pi
    rr = r + rng.normal(0, width, n)
    return np.c_[c[0] + rr * np.cos(a), c[1] + rr * np.sin(a)]


def text_points(txt, box, n):
    font = ImageFont.truetype(FONT, 400)
    bb = font.getbbox(txt)
    w, h = bb[2] - bb[0] + 20, bb[3] - bb[1] + 20
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((10 - bb[0], 10 - bb[1]), txt, fill=255, font=font)
    ys, xs = np.nonzero(np.array(img) > 127)
    k = rng.integers(0, len(xs), n)
    s = box * 2 / max(w, h)
    return np.c_[(xs[k] + rng.random(n) - 0.5 - w / 2) * s, -(ys[k] + rng.random(n) - 0.5 - h / 2) * s]


def traces():
    """Pistes imbriquées, comme sur un circuit imprimé : de chaque broche, un segment droit,
    un coude à 45° vers l'extérieur, puis une pastille. Les broches extérieures coudent plus
    tôt que les broches centrales : les pistes d'un même côté ne se croisent jamais."""
    out = []
    H, PIN = 0.5, 0.075
    pins = np.linspace(-0.36, 0.36, 7)
    skip = [{1, 5}, {0, 4}, {2, 6}, {1, 3}]            # un peu d'asymétrie entre les côtés
    for side in range(4):
        ang = side * math.pi / 2
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        for k, u in enumerate(pins):
            if k in skip[side]:
                continue
            rank = abs(k - 3)                            # 0 au centre, 3 aux extrémités
            p0 = np.array([H + PIN, u])
            if rank == 0:                                # broche centrale : piste droite
                p1 = p0 + np.array([0.2, 0])
                p2 = p1 + np.array([0.12, 0])
            else:
                bend = 1 if u > 0 else -1
                p1 = p0 + np.array([0.05 + (3 - rank) * 0.075, 0])
                d = 0.07 + rank * 0.035
                p2 = p1 + np.array([d, bend * d])
            p3 = p2 + np.array([0.09 + 0.03 * ((k + side) % 3), 0])
            out.append([R @ p for p in (p0, p1, p2, p3)])
    return out


def main():
    parts, cols = [], []

    def add(p2d, n_col=None, z=None):
        z = rng.uniform(-DEPTH, DEPTH, len(p2d)) if z is None else z
        parts.append(np.c_[p2d, z])
        cols.append(np.zeros((len(p2d), 4), np.uint8) if n_col is None else n_col)

    # boîtier : contour épais + carré intérieur + légère dalle
    add(square_outline(0.5, int(N * 0.14), 0.01))
    add(square_outline(0.46, int(N * 0.05), 0.006))
    add(square_outline(0.36, int(N * 0.08), 0.008))
    plate = rng.uniform(-0.46, 0.46, (int(N * 0.05), 2))
    add(plate, z=np.full(len(plate), -DEPTH))
    # broches
    pins = []
    for side in range(4):
        for u in np.linspace(-0.36, 0.36, 7):
            a, _ = seg_points(np.array([0.5, u]), np.array([0.575, u]), 60)
            a += rng.normal(0, 0.006, a.shape)
            ang = side * math.pi / 2
            R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
            pins.append(a @ R.T)
    add(np.concatenate(pins))
    # lettres IA
    add(text_points("IA", 0.27, int(N * 0.2)), z=rng.uniform(-DEPTH * 0.5, DEPTH * 1.5, int(N * 0.2)))

    # pistes + pastilles, avec la position le long de la piste pour les électrons
    tr = traces()
    used = sum(len(p) for p in parts)
    n_left = N - used
    n_pad = int(n_left * 0.32)
    n_wire = n_left - n_pad
    lengths = np.array([sum(np.linalg.norm(t[i + 1] - t[i]) for i in range(3)) for t in tr])
    per_wire = np.maximum(40, (lengths / lengths.sum() * n_wire).astype(int))
    per_wire[-1] += n_wire - per_wire.sum()
    per_pad = np.full(len(tr), n_pad // len(tr))
    per_pad[-1] += n_pad - per_pad.sum()
    for ti, t in enumerate(tr):
        offset = rng.random()
        seglen = [np.linalg.norm(t[i + 1] - t[i]) for i in range(3)]
        total = sum(seglen)
        s = rng.random(per_wire[ti]) * total
        pts, ph = [], []
        for x in s:
            acc = 0
            for i in range(3):
                if x <= acc + seglen[i] or i == 2:
                    f = (x - acc) / seglen[i]
                    pts.append(t[i] + (t[i + 1] - t[i]) * min(f, 1))
                    break
                acc += seglen[i]
            ph.append(x / total)
        pts = np.array(pts) + rng.normal(0, 0.005, (len(pts), 2))
        c = np.zeros((len(pts), 4), np.uint8)
        c[:, 0] = int(offset * 255)
        c[:, 1] = np.round(np.array(ph) * 255)
        c[:, 2] = 255
        add(pts, c)
        # pastille : anneau + point central, allumée à l'arrivée de l'électron
        end = t[3]
        r = 0.045 + 0.02 * rng.random()
        nr = per_pad[ti]
        pad = np.concatenate([ring(end, r, int(nr * 0.7)), end + rng.normal(0, r * 0.28, (nr - int(nr * 0.7), 2))])
        c = np.zeros((len(pad), 4), np.uint8)
        c[:, 0] = int(offset * 255)
        c[:, 1] = 255
        c[:, 2] = 255
        add(pad, c)

    pts = np.concatenate(parts)[:N]
    col = np.concatenate(cols)[:N]
    pts = normalize(pts)
    perm = _hilbert_perm(pts)
    pts, col = pts[perm], col[perm]
    write_bin(pts, os.path.join(OUT, "ia.bin"))
    col.tofile(os.path.join(OUT, "ia.col"))
    preview_png(pts, os.path.join(PREV, "ia.png"))
    print(f"  ia : {len(pts)} pts, {len(tr)} pistes")

    path = os.path.join(OUT, "manifest.json")
    man = json.load(open(path, encoding="utf-8"))
    man["ia"] = {"colors": True, "pulse": True, "idle": 0.45}
    json.dump(man, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
