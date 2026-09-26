"""
Génère les formes du morph dans public/shapes/*.bin (+ aperçus PNG dans tools/previews).

Usage :
    python tools/build_shapes.py              # toutes les formes
    python tools/build_shapes.py head code    # seulement certaines

Pour ajouter une forme exportée depuis Blender (addon tools/blender/export_points.py),
dépose le .json dans tools/sources/ et ajoute une entrée dans SHAPES :
    "ma_forme": ("json", "tools/sources/ma_forme.json"),
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pointcloud import (box_tris, hilbert_sort, load_glb_triangles, load_json_points,
                        normalize, preview_png, resample, sample_triangles, write_bin)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "shapes")
PREV = os.path.join(ROOT, "tools", "previews")
N = 32768
rng = np.random.default_rng(2026)
OLD = os.path.join(ROOT, "..")          # dossier de l'ancien site (JSON Blender existants)


# ---------------------------------------------------------------------------
# Formes procédurales
# ---------------------------------------------------------------------------

def lines_to_points(segments, n):
    """Échantillonne des points le long de segments (wireframe holographique)."""
    segs = np.array(segments, dtype=np.float64)
    lens = np.linalg.norm(segs[:, 1] - segs[:, 0], axis=1)
    pick = rng.choice(len(segs), size=n, p=lens / lens.sum())
    t = rng.random(n)[:, None]
    return segs[pick, 0] + (segs[pick, 1] - segs[pick, 0]) * t


def shape_cube():
    """Clin d'œil à la v1 : cube voxel 10x10x10, arêtes du treillis."""
    g = np.linspace(-1, 1, 6)
    segs = []
    for a in g:
        for b in g:
            segs += [((-1, a, b), (1, a, b)), ((a, -1, b), (a, 1, b)), ((a, b, -1), (a, b, 1))]
    pts = lines_to_points(segs, int(N * 0.55))
    nodes = np.array([(x, y, z) for x in g for y in g for z in g])
    blobs = nodes[rng.integers(0, len(nodes), N - len(pts))] + rng.normal(0, 0.025, (N - len(pts), 3))
    return np.concatenate([pts, blobs])


def shape_laptop():
    tris = []
    # base
    tris.append(box_tris(0, -0.04, 0, 3.0, 0.08, 2.0))
    # touches (grille surélevée)
    for r in range(5):
        for c in range(12):
            tris.append(box_tris(-1.32 + c * 0.24, 0.02, -0.72 + r * 0.24, 0.19, 0.03, 0.19))
    # pavé tactile
    tris.append(box_tris(0, 0.005, 0.62, 0.9, 0.01, 0.5))
    # écran incliné (rotation autour de X, charnière à l'arrière)
    screen = [box_tris(0, 0.95, 0, 3.0, 1.9, 0.06)]
    ang = math.radians(-12)
    rot = np.array([[1, 0, 0], [0, math.cos(ang), -math.sin(ang)], [0, math.sin(ang), math.cos(ang)]])
    for t in screen:
        t = t @ rot.T
        t[..., 2] -= 1.0
        tris.append(t)
    tris = np.concatenate(tris)
    pts = sample_triangles(tris, int(N * 0.8), rng)
    # "contenu" de l'écran : lignes de code lumineuses
    lines = []
    for k in range(14):
        y = 0.2 + k * 0.115
        w = rng.uniform(0.4, 2.2)
        x0 = -1.3 + rng.uniform(0, 0.4) * (k % 3)
        lines.append(((x0, y, 0.035), (x0 + w, y, 0.035)))
    code = lines_to_points(lines, N - len(pts)) + rng.normal(0, 0.008, (N - len(pts), 3))
    code = code @ rot.T
    code[:, 2] -= 1.0
    return np.concatenate([pts, code])


def shape_network():
    """Globe réseau : méridiens/parallèles, nœuds et arcs de connexion."""
    segs = []
    steps = 96
    for lat in np.linspace(-75, 75, 9):
        la = math.radians(lat)
        for i in range(steps):
            a0, a1 = 2 * math.pi * i / steps, 2 * math.pi * (i + 1) / steps
            segs.append(((math.cos(la) * math.cos(a0), math.sin(la), math.cos(la) * math.sin(a0)),
                         (math.cos(la) * math.cos(a1), math.sin(la), math.cos(la) * math.sin(a1))))
    for lon in np.linspace(0, 180, 9)[:-1]:
        lo = math.radians(lon)
        for i in range(steps):
            b0, b1 = 2 * math.pi * i / steps, 2 * math.pi * (i + 1) / steps
            segs.append(((math.cos(b0) * math.cos(lo), math.sin(b0), math.cos(b0) * math.sin(lo)),
                         (math.cos(b1) * math.cos(lo), math.sin(b1), math.cos(b1) * math.sin(lo))))
    grid = lines_to_points(segs, int(N * 0.35)) * 0.92

    # nœuds (serveurs/routeurs) à la surface
    k = 28
    nodes = rng.normal(size=(k, 3))
    nodes /= np.linalg.norm(nodes, axis=1, keepdims=True)
    arcs = []
    for i in range(k):
        d = np.linalg.norm(nodes - nodes[i], axis=1)
        for j in np.argsort(d)[1:3]:
            a, b = nodes[i], nodes[j]
            for s in range(24):
                t0, t1 = s / 24, (s + 1) / 24
                p0 = a * (1 - t0) + b * t0
                p1 = a * (1 - t1) + b * t1
                h0 = 1 + 0.25 * math.sin(math.pi * t0) * np.linalg.norm(a - b)
                h1 = 1 + 0.25 * math.sin(math.pi * t1) * np.linalg.norm(a - b)
                arcs.append((p0 / np.linalg.norm(p0) * h0, p1 / np.linalg.norm(p1) * h1))
    arc_pts = lines_to_points(arcs, int(N * 0.35))
    n_blob = N - len(grid) - len(arc_pts)
    blobs = nodes[rng.integers(0, k, n_blob)] * 1.0 + rng.normal(0, 0.035, (n_blob, 3))
    return np.concatenate([grid, arc_pts, blobs])


def shape_text(text, font_file, depth=0.22):
    """Texte extrudé : faces avant/arrière + parois (points sur les contours)."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    font = ImageFont.truetype(font_file, 400)
    bbox = font.getbbox(text)
    w, h = bbox[2] - bbox[0] + 40, bbox[3] - bbox[1] + 40
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((20 - bbox[0], 20 - bbox[1]), text, fill=255, font=font)
    mask = np.array(img) > 127
    edge = np.array(img.filter(ImageFilter.FIND_EDGES)) > 60
    ys, xs = np.nonzero(mask)
    ey, ex = np.nonzero(edge)
    n_face = int(N * 0.6)
    n_wall = N - n_face
    fi = rng.integers(0, len(xs), n_face)
    face = np.c_[xs[fi], -ys[fi], np.where(rng.random(n_face) < 0.5, -1, 1) * depth * h / 2]
    wi = rng.integers(0, len(ex), n_wall)
    wall = np.c_[ex[wi], -ey[wi], rng.uniform(-1, 1, n_wall) * depth * h / 2]
    pts = np.concatenate([face, wall]).astype(np.float64)
    pts[:, :2] += rng.random((N, 2)) - 0.5
    return pts


def shape_heart():
    """Cœur 3D implicite, surface trouvée par dichotomie le long de rayons."""
    def f(p):
        x, y, z = p[:, 0], p[:, 2], p[:, 1]   # z implicite = y écran
        return (x * x + 2.25 * y * y + z * z - 1) ** 3 - x * x * z ** 3 - 0.1125 * y * y * z ** 3
    d = rng.normal(size=(N, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    lo = np.zeros(N)
    hi = np.full(N, 1.6)
    for _ in range(30):
        mid = (lo + hi) / 2
        inside = f(d * mid[:, None]) < 0
        lo = np.where(inside, mid, lo)
        hi = np.where(inside, hi, mid)
    pts = d * lo[:, None]
    # remplissage léger pour le volume
    inner = rng.random(N) < 0.12
    pts[inner] *= rng.uniform(0.3, 0.95, inner.sum())[:, None]
    return pts


def shape_house():
    """Maison filaire (clin d'œil au logo Bigoo) : murs, toit, porte, fenêtres, cheminée."""
    W, D, H, R = 1.0, 0.8, 0.9, 0.6
    c = [(-W, 0, -D), (W, 0, -D), (W, 0, D), (-W, 0, D)]
    top = [(x, H, z) for x, _, z in c]
    segs = []
    for i in range(4):
        segs += [(c[i], c[(i + 1) % 4]), (top[i], top[(i + 1) % 4]), (c[i], top[i])]
    ridge = [(-W - 0.15, H + R, 0), (W + 0.15, H + R, 0)]
    segs += [tuple(ridge)]
    for x in (-W, W):
        for z in (-D, D):
            segs.append(((x * 1.15, H - 0.08, z * 1.12), (x + 0.15 * np.sign(x), H + R, 0)))
    # chemin de toit, cheminée, porte, fenêtres (façade avant z = +D)
    segs += [((0.5, H + 0.25, 0.4), (0.5, H + 0.85, 0.4)), ((0.75, H + 0.1, 0.4), (0.75, H + 0.85, 0.4)),
             ((0.5, H + 0.85, 0.4), (0.75, H + 0.85, 0.4))]
    door = [(-0.18, 0, D), (-0.18, 0.55, D), (0.18, 0.55, D), (0.18, 0, D)]
    segs += [(door[i], door[i + 1]) for i in range(3)]
    for wx in (-0.65, 0.65):
        win = [(wx - 0.18, 0.35, D), (wx - 0.18, 0.7, D), (wx + 0.18, 0.7, D), (wx + 0.18, 0.35, D)]
        segs += [(win[i], win[(i + 1) % 4]) for i in range(4)]
        segs += [((wx, 0.35, D), (wx, 0.7, D)), ((wx - 0.18, 0.525, D), (wx + 0.18, 0.525, D))]
    edges = lines_to_points(segs, int(N * 0.55)) + rng.normal(0, 0.006, (int(N * 0.55), 3))
    # toit plein (deux pans)
    roof = []
    for zs in (-1, 1):
        roof.append([(-W - 0.15, H - 0.08, zs * D * 1.12), (W + 0.15, H - 0.08, zs * D * 1.12), (W + 0.15, H + R, 0)])
        roof.append([(-W - 0.15, H - 0.08, zs * D * 1.12), (W + 0.15, H + R, 0), (-W - 0.15, H + R, 0)])
    faces = sample_triangles(np.array(roof, dtype=np.float64), int(N * 0.25), rng)
    walls = sample_triangles(box_tris(0, H / 2, 0, 2 * W, H, 2 * D), N - len(edges) - len(faces), rng)
    return np.concatenate([edges, faces, walls])


FONT_CODE = r"C:\Windows\Fonts\consolab.ttf"

SHAPES = {
    "cube": ("fn", shape_cube),
    "head": ("json", os.path.join(OLD, "headhd2.json")),
    "laptop": ("fn", shape_laptop),
    "network": ("fn", shape_network),
    "butterfly": ("json", os.path.join(OLD, "butterfly1.json")),
    "code": ("fn", lambda: shape_text("</>", FONT_CODE)),
    "heart": ("fn", shape_heart),
    "house": ("fn", shape_house),
}


# rotations d'orientation (x, y, z) -> nouvelle base, pour les sources couchées
# Le papillon est modélisé en vol (corps selon Z, ailes selon X, à plat) : on le garde
# de face, tête vers la caméra, simplement incliné de 25° pour voir le dessus des ailes.
BUTTERFLY_TILT = math.radians(25)
ORIENT = {
    "butterfly": lambda p: np.c_[
        p[:, 0],
        p[:, 1] * math.cos(BUTTERFLY_TILT) - p[:, 2] * math.sin(BUTTERFLY_TILT),
        p[:, 1] * math.sin(BUTTERFLY_TILT) + p[:, 2] * math.cos(BUTTERFLY_TILT),
    ],
}


# jitter des points dupliqués (les ailes du papillon sont des plans très fins)
JITTER = {"butterfly": 0.002}

# facteur d'échelle final (les volumes "pleins" comme le cube paraissent plus gros en rotation)
SCALE = {"cube": 0.7}


def build(name):
    kind, src = SHAPES[name]
    pts = load_json_points(src) if kind == "json" else src()
    if name in ORIENT:
        pts = ORIENT[name](np.asarray(pts, dtype=np.float64))
    pts = normalize(np.asarray(pts, dtype=np.float64))
    pts = resample(pts, N, rng, sigma=JITTER.get(name))
    pts = normalize(pts)
    pts = hilbert_sort(pts) * SCALE.get(name, 1.0)
    write_bin(pts, os.path.join(OUT, f"{name}.bin"))
    if name == "heart":
        update_manifest(name, {"beat": True})
    if name == "butterfly":
        # battement d'ailes (shader) : rotation autour de l'axe du corps
        body = pts[np.abs(pts[:, 0]) < 0.03]
        axis = [0.0, -math.sin(BUTTERFLY_TILT), math.cos(BUTTERFLY_TILT)]
        write_wing_mask(pts, os.path.join(OUT, f"{name}.col"))
        update_manifest(name, {"flap": {"center": body.mean(0).round(4).tolist(), "axis": axis},
                               "idle": 0.35, "colors": True})
    preview_png(pts, os.path.join(PREV, f"{name}.png"))
    print(f"  {name:10s} {len(pts)} pts -> public/shapes/{name}.bin")


def write_wing_mask(pts, path):
    """Masque "aile" par point, stocké dans le canal R du fichier .col (alpha 0 : la couleur
    reste le dégradé holographique). Les ailes sont deux plans fins en V : un point appartient
    à une aile s'il est proche de son plan ; corps, pattes et antennes restent fixes."""
    t = BUTTERFLY_TILT
    x = pts[:, 0]
    y = pts[:, 1] * math.cos(t) + pts[:, 2] * math.sin(t)       # retour au repère de modélisation
    mask = np.zeros(len(pts))
    for s in (1, -1):
        sel = s * x > 0.25
        a, b = np.polyfit(x[sel], y[sel], 1)
        d = np.abs(y - (a * x + b)) / math.sqrt(1 + a * a)
        mask = np.where(s * x > 0, np.clip(1 - (d - 0.012) / 0.02, 0, 1), mask)
    col = np.zeros((len(pts), 4), np.uint8)
    col[:, 0] = np.round(mask * 255)
    col.tofile(path)
    print(f"  ailes : {(mask > 0.5).sum()} points mobiles, {(mask <= 0.5).sum()} fixes (corps, pattes, antennes)")


def update_manifest(name, entry):
    import json
    path = os.path.join(OUT, "manifest.json")
    man = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    man[name] = entry
    json.dump(man, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    for name in (sys.argv[1:] or SHAPES):
        build(name)
