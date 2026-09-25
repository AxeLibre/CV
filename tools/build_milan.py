"""
Maquette "Place de Milan" de nuit (version 1.12) pour le morph du site.

Produit dans public/shapes/ :
  milan.bin / milan.col          contexte : positions Int16 + couleurs RGBA (nuit)
  milan-<id>.bin / .col          nouveaux bâtiments d'une sauvegarde JSON du simulateur
et complète public/shapes/manifest.json (entrée "milan").

Le moteur assemble [contexte | bâtiments] et fait alterner les propositions :
emprise au sol sur le polygone d'implantation → le bâtiment s'élève → il redescend
→ l'emprise glisse vers la proposition suivante.

Les couleurs reproduisent le shader de nuit de l'application (makeStaticNightWindowMaterial :
même grille de baies, même hash, même proportion de fenêtres allumées), le dégradé
chaud en pied de façade et les matériaux émissifs.

    python tools/build_milan.py
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pointcloud import load_glb_triangles, sample_triangles

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "shapes")
PREV = os.path.join(ROOT, "tools", "previews")
V112 = r"D:\Site_Web\milan\version1.12"
SRC = os.path.join(ROOT, "tools", "sources", "milan")      # GLB décompressés (gltf-transform)
SAVES = r"D:\Site_Web\milan"

N = 32768
N_BLD = 8192                 # points réservés aux nouveaux bâtiments
N_CTX = N - N_BLD
rng = np.random.default_rng(1112)

# cadrage : la place, la gare, le Crayon, To-Lyon
X0, X1, Z0, Z1 = -390.0, 190.0, -170.0, 330.0
SITE = np.array([50.0, 0.0, 42.0])      # centre du polygone d'implantation

PROJECTS = [
    ("futuriste", "exemple_futuriste.json", "Futuriste"),
    ("spirales", "exemple_tours_spirales2.json", "Tours spirales"),
    ("quatre-tours", "exemple_4_tours_2.json", "Quatre tours"),
    ("ensemble", "exemple6.json", "Ensemble mixte"),
]

# --- constantes reprises de src/config.js -----------------------------------
FLOOR_HEIGHTS = {"residentiel": 3.0, "hotel": 3.5, "bureaux": 4.0, "commerces": 4.0, "services": 4.0}
USAGE_COLORS = {"residentiel": 0xE0A24A, "bureaux": 0x5B8AB0, "commerces": 0xD95A6C,
                "hotel": 0xA06BD9, "services": 0x4FAE8F, "nondefini": 0x9AA0A6}
NEON_BLUE = np.array([0x2E, 0xE8, 0xFF]) / 255.0

# --- paramètres des fenêtres de nuit (index.html, setupStaticWindowMaterials) --
WINDOWS = {
    "glass":             dict(pitch=1, floorH=3, winW=0.72, winH=1.5, lit=1.0, col=(1.0, 0.86, 0.58), glow=True),
    "glass_fenetre":     dict(pitch=1, floorH=3, winW=0.65, winH=1.3, lit=0.38, col=(1.0, 0.86, 0.58), glow=False),
    "BATIMENTS_fenetre": dict(pitch=2, floorH=2.5, winW=0.65, winH=0.85, lit=0.38, col=(1.0, 0.82, 0.5), glow=True),
    "glass_carre":       dict(pitch=3, floorH=3, winW=2.5, winH=2.5, lit=1.0, col=(1.0, 1.0, 1.0), glow=False),
}
GLOW_MATS = {"BATIMENTS", "BATIMENTS_fenetre", "glass"}
EMISSIVE = {                     # matériaux lumineux de la maquette
    "pyramide": (1.0, 0.35, 0.05), "light": (0.45, 0.7, 1.0), "westfield": (1.0, 0.95, 0.95),
    "Matériau.003": (1.0, 0.1, 0.05), "Crayon": (0.55, 0.22, 0.12),
}
SKIP = {"noir", "TRANSPARENT", "PLU", "ppy", "tronc", "feuillage", "rails", "ROUTE"}


def hash12(p):
    """hash12NW du shader (Dave Hoskins), vectorisé."""
    p3 = np.stack([p[:, 0], p[:, 1], p[:, 0]], 1) * 0.1031
    p3 = p3 - np.floor(p3)
    d = (p3 * (p3[:, [1, 2, 0]] + 33.33)).sum(1, keepdims=True)
    p3 = p3 + d
    v = (p3[:, 0] + p3[:, 1]) * p3[:, 2]
    return v - np.floor(v)


def window_light(pts, normals, prm):
    """Émissif des baies (0 hors fenêtre / éteinte) — même calcul que le shader."""
    along = np.where(np.abs(normals[:, 0]) > np.abs(normals[:, 2]), pts[:, 2], pts[:, 0])
    cell = np.stack([along / prm["pitch"], pts[:, 1] / prm["floorH"]], 1)
    cid = np.floor(cell)
    uv = cell - cid
    lit = (hash12(cid) <= prm["lit"]).astype(float)
    warm_range = 0.0 if prm["lit"] >= 1 else 0.35
    warmth = 1 - warm_range * 0.5 + warm_range * hash12(cid + 17.0)
    floor_id = np.floor(pts[:, 1] / prm["floorH"])
    fb = hash12(np.stack([floor_id, np.full_like(floor_id, 91.7)], 1))
    fh = hash12(np.stack([floor_id, np.full_like(floor_id, 5.3)], 1))
    fbv = 0.3 if prm["lit"] >= 1 else 0.12
    fhv = 0.5 if prm["lit"] >= 1 else 0.2
    bright = 1 - fbv * 0.5 + fbv * fb
    col = np.array(prm["col"])[None] * (1 - (fh * fhv)[:, None]) + np.array([0.75, 0.85, 1.0])[None] * (fh * fhv)[:, None]
    frac = np.array([prm["winW"] / prm["pitch"], prm["winH"] / prm["floorH"]])
    inside = np.all(np.abs(uv - 0.5) <= frac / 2, axis=1).astype(float)
    vertical = (np.abs(normals[:, 1]) < 0.5).astype(float)
    return col * (lit * warmth * bright * inside * vertical)[:, None] * 1.6


def srgb(hexv):
    return np.array([(hexv >> 16) & 255, (hexv >> 8) & 255, hexv & 255]) / 255.0


# ---------------------------------------------------------------------------
# Contexte
# ---------------------------------------------------------------------------

def load_context():
    parts = [
        load_glb_triangles(os.path.join(V112, "place_de_milan.glb"), with_materials=True),
        load_glb_triangles(os.path.join(V112, "global.glb"), with_materials=True),
        load_glb_triangles(os.path.join(SRC, "batis_2018.glb"), with_materials=True),
        load_glb_triangles(os.path.join(SRC, "voirie_parcs.glb"), with_materials=True),
    ]
    tris = np.concatenate([p[0] for p in parts])
    mats = np.concatenate([p[1] for p in parts]).astype(str)
    nodes = np.concatenate([p[2] for p in parts]).astype(str)
    mats = np.array([m.encode("latin-1", "ignore").decode("utf-8", "ignore") if "\ufffd" not in m else m.replace("\ufffd", "é") for m in mats])
    c = tris.mean(1)
    keep = (c[:, 0] > X0) & (c[:, 0] < X1) & (c[:, 2] > Z0) & (c[:, 2] < Z1)
    keep &= ~np.isin(mats, list(SKIP))
    keep &= ~np.char.startswith(nodes, "polygone_implantation")
    return tris[keep], mats[keep]


def build_context():
    tris, mats = load_context()
    # poids d'échantillonnage : on densifie les façades et l'abord du site, on allège le sol
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    vertical = np.abs(n[:, 1]) < 0.5
    ground = np.isin(mats, ["TROTTOIRE", "gazon", "PLACE BERAUDIER", "Matériau.004"])
    dist = np.linalg.norm((tris.mean(1) - SITE)[:, [0, 2]], axis=1)
    w = np.where(vertical, 1.6, 0.5) * np.where(ground, 0.12, 1.0) * (0.35 + 1.4 * np.exp(-dist / 160))
    w *= np.where(np.isin(mats, list(EMISSIVE)), 3.0, 1.0)

    # sur-échantillonnage puis tri par importance lumineuse : les baies allumées ressortent
    cand = N_CTX * 6
    pts, ti = sample_triangles(tris, cand, rng, return_index=True, weights=w)
    nrm, mat = n[ti], mats[ti]
    col = np.zeros((cand, 3))
    for name, prm in WINDOWS.items():
        s = mat == name
        if s.any():
            col[s] = window_light(pts[s], nrm[s], prm)
    base = {"BATIMENTS": 0.36, "BATIMENTS_fenetre": 0.36, "BATIS_TOIT": 0.36, "glass": 0.34, "glass_fenetre": 0.34,
            "glass_carre": 0.34, "aluminium": 0.5, "TROTTOIRE": 0.12, "gazon": 0.2, "PLACE BERAUDIER": 0.22, "tolyon": 0.05}
    for name, v in base.items():
        s = (mat == name) & (col.sum(1) == 0)
        col[s] = v * 0.16                                  # ambiance de nuit : très sombre
    # dégradé chaud au pied des façades (FACADE_GLOW)
    s = np.isin(mat, list(GLOW_MATS)) & (np.abs(nrm[:, 1]) < 0.5)
    h = np.clip(pts[s, 1] / 20.0, 0, 1)
    col[s] += np.array([1.0, 0.66, 0.36]) * (0.5 * (1 - h) ** 1.6)[:, None]
    for name, e in EMISSIVE.items():
        col[mat == name] = np.array(e) * 1.2

    lum = col @ np.array([0.3, 0.55, 0.15])
    p = 0.08 + np.clip(lum, 0, 1.5)                      # garde une silhouette sombre
    pick = rng.choice(cand, size=N_CTX, replace=False, p=p / p.sum())
    return pts[pick], col[pick]


# ---------------------------------------------------------------------------
# Nouveaux bâtiments (sauvegardes JSON du simulateur)
# ---------------------------------------------------------------------------

def floor_h(b, f):
    for band in b["bands"]:
        if band["from"] <= f <= band["to"]:
            return FLOOR_HEIGHTS.get(band.get("usage"), 3.0)
    return 3.0


def point_in_poly(px, pz, poly):
    inside = np.zeros(len(px), bool)
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        cond = ((z1 > pz) != (z2 > pz)) & (px < (x2 - x1) * (pz - z1) / np.where(z2 - z1 == 0, 1e-9, z2 - z1) + x1)
        inside ^= cond
    return inside


def building_tris_and_meta(data):
    """Volumes (murs + toits) de chaque tranche, avec l'usage pour la couleur."""
    walls, roofs = [], []
    for b in data["buildings"]:
        y = 0.0
        offs = {}
        for f in range(1, b["floors"] + 2):
            offs[f] = y
            y += floor_h(b, f)
        for band in b["bands"]:
            pts = band.get("points") if band.get("points") and len(band["points"]) >= 3 else b["points"]
            poly = np.array([[p["x"], p["z"]] for p in pts])
            y0, y1 = offs[band["from"]], offs[band["to"] + 1]
            walls.append((poly, y0, y1, band.get("usage", "nondefini")))
            roofs.append((poly, y1, band.get("usage", "nondefini")))
    return walls, roofs


def sample_building(data, n):
    walls, roofs = building_tris_and_meta(data)
    # aires
    items = []
    for poly, y0, y1, usage in walls:
        e = np.roll(poly, -1, 0) - poly
        L = np.linalg.norm(e, axis=1)
        for k in range(len(poly)):
            if L[k] > 1e-6:
                items.append(("w", L[k] * (y1 - y0), (poly[k], poly[(k + 1) % len(poly)], y0, y1), usage))
    for poly, y1, usage in roofs:
        x = poly[:, 0]
        z = poly[:, 1]
        area = abs(np.dot(x, np.roll(z, -1)) - np.dot(z, np.roll(x, -1))) / 2
        items.append(("r", area * 0.6, (poly, y1), usage))
    areas = np.array([it[1] for it in items])
    counts = rng.multinomial(n, areas / areas.sum())
    P, C, NRM = [], [], []
    for (kind, _a, geo, usage), k in zip(items, counts):
        if k == 0:
            continue
        ucol = srgb(USAGE_COLORS.get(usage, USAGE_COLORS["nondefini"]))
        if kind == "w":
            a, b, y0, y1 = geo
            t = rng.random(k)
            y = y0 + rng.random(k) * (y1 - y0)
            xz = a + (b - a) * t[:, None]
            p = np.c_[xz[:, 0], y, xz[:, 1]]
            d = b - a
            nrm = np.tile(np.array([d[1], 0, -d[0]]) / max(np.linalg.norm(d), 1e-9), (k, 1))
        else:
            poly, y1 = geo
            lo, hi = poly.min(0), poly.max(0)
            got = []
            while sum(len(g) for g in got) < k:
                c = lo + rng.random((k * 3, 2)) * (hi - lo)
                got.append(c[point_in_poly(c[:, 0], c[:, 1], poly)])
            c = np.concatenate(got)[:k]
            p = np.c_[c[:, 0], np.full(k, y1), c[:, 1]]
            nrm = np.tile([0, 1, 0], (k, 1)).astype(float)
        # nuit : structure teintée par l'usage + baies allumées (vitrage des nouveaux bâtiments)
        win = window_light(p, nrm, dict(pitch=1.5, floorH=3.5, winW=1.0, winH=2.0, lit=0.55, col=(1.0, 0.86, 0.58)))
        tint = 0.5 + 0.5 * hash12(np.floor(np.c_[p[:, 0] / 1.5 + p[:, 2] / 1.5, p[:, 1] / 3.5]) + 3.0)[:, None]
        col = ucol * 0.32 + win * (0.55 + 0.45 * ucol * tint)
        P.append(p)
        C.append(col)
        NRM.append(nrm)
    return np.concatenate(P), np.concatenate(C)


# ---------------------------------------------------------------------------

def to_u8(col, alpha=255):
    c = np.clip(col / 1.6, 0, 1) ** (1 / 1.4)            # compresse la dynamique (l'émissif peut dépasser 1)
    out = np.zeros((len(col), 4), np.uint8)
    out[:, :3] = np.round(c * 255)
    out[:, 3] = alpha
    return out


def write(name, pts, col, center, scale):
    q = (pts - center) * scale
    np.clip(np.round(q * 32767), -32767, 32767).astype("<i2").tofile(os.path.join(OUT, f"{name}.bin"))
    to_u8(col).tofile(os.path.join(OUT, f"{name}.col"))


def preview(pts, col, path, size=900):
    from PIL import Image
    img = np.zeros((size, size, 3))
    ang = math.radians(-25)
    x = pts[:, 0] * math.cos(ang) - pts[:, 2] * math.sin(ang)
    z = pts[:, 0] * math.sin(ang) + pts[:, 2] * math.cos(ang)
    y = pts[:, 1] * math.cos(0.35) - z * math.sin(0.35)
    sx = (size / 2 + x * size * 0.46).astype(int)
    sy = (size / 2 - y * size * 0.46).astype(int)
    ok = (sx >= 0) & (sx < size) & (sy >= 0) & (sy < size)
    np.add.at(img, (sy[ok], sx[ok]), np.clip(col[ok], 0, 3) * 120)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    ctx, ccol = build_context()
    lo, hi = ctx.min(0), ctx.max(0)
    center = (lo + hi) / 2
    center[1] = lo[1] + (hi[1] - lo[1]) * 0.35           # recentrage vertical : laisse de la place aux tours
    scale = 2.0 / max(hi - lo)

    ctxn = (ctx - center) * scale
    perm = _hilbert_perm(ctxn)
    write("milan", ctx[perm], ccol[perm], center, scale)
    allp, allc = [ctxn[perm]], [ccol[perm]]

    variants = []
    for vid, fname, label in PROJECTS:
        data = json.load(open(os.path.join(SAVES, fname), encoding="utf-8"))
        p, c = sample_building(data, N_BLD)
        perm_b = _hilbert_perm((p - center) * scale)
        write(f"milan-{vid}", p[perm_b], c[perm_b], center, scale)
        floors = max(b["floors"] for b in data["buildings"])
        variants.append({"id": vid, "file": f"milan-{vid}", "label": label, "source": fname,
                         "buildings": len(data["buildings"]), "floors": floors})
        preview(np.concatenate([ctxn[perm], (p[perm_b] - center) * scale]), np.concatenate([ccol[perm], c[perm_b]]),
                os.path.join(PREV, f"milan-{vid}.png"))
        print(f"  milan-{vid:13s} {len(data['buildings'])} bâtiments, R+{floors}")

    ground = (0.25 - center[1]) * scale                   # altitude du polygone (y = 0) normalisée
    man_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    manifest["milan"] = {
        "colors": True,
        "tilt": 0.5,                                      # vue plongeante sur la maquette
        "scale": 1.2,
        "compose": {"base": "milan", "count": N_CTX, "blockCount": N_BLD, "ground": ground,
                    "footColor": NEON_BLUE.tolist(), "variants": variants},
    }
    json.dump(manifest, open(man_path, "w"), indent=2, ensure_ascii=False)
    print(f"  milan (contexte) {N_CTX} pts + {N_BLD} pts/variante -> public/shapes/")


def _hilbert_perm(pts, bits=10):
    from pointcloud import _hilbert_index
    lo, hi = pts.min(0), pts.max(0)
    q = ((pts - lo) / np.maximum(hi - lo, 1e-9) * ((1 << bits) - 1)).astype(np.int64)
    keys = np.array([_hilbert_index(a, b, c, bits) for a, b, c in q])
    return np.argsort(keys, kind="stable")


if __name__ == "__main__":
    main()
