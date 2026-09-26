"""
Logos Android, Windows, Apple et Linux (Tux) pour l'accueil : nuages de points colorés.

Chaque GLB est échantillonné en surface ; la couleur de chaque point vient de la texture
(logos plats Android / Windows / Apple, lue via les UV) ou du matériau (Tux).
Produit public/shapes/<nom>.bin + .col et l'entrée "os" (cycle des 4 logos) du manifest.

    python tools/build_logos.py
"""
import io
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pointcloud import _COMP, _NCOMP, _node_matrix, normalize, preview_png, write_bin
from build_milan import _hilbert_perm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "shapes")
PREV = os.path.join(ROOT, "tools", "previews")
SRC = r"D:\Site_Web\ONE - Copie\modele_3D_accueil"
N = 32768
rng = np.random.default_rng(404)

LOGOS = [("android", "android.glb"), ("windows", "windows.glb"), ("apple", "apple.glb"), ("tux", "tux.glb")]


def load_textured(path):
    """Triangles monde + UV + couleur de base / texture de chaque matériau."""
    raw = open(path, "rb").read()
    jlen = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + jlen])
    boff = 20 + jlen
    blen = struct.unpack("<I", raw[boff:boff + 4])[0]
    binchunk = raw[boff + 8: boff + 8 + blen]

    def view_bytes(vi):
        v = gltf["bufferViews"][vi]
        o = v.get("byteOffset", 0)
        return binchunk[o: o + v["byteLength"]]

    def accessor(i):
        acc = gltf["accessors"][i]
        view = gltf["bufferViews"][acc["bufferView"]]
        fmt, size = _COMP[acc["componentType"]]
        n = _NCOMP[acc["type"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride", size * n)
        buf = np.frombuffer(binchunk, dtype=np.uint8, count=(acc["count"] - 1) * stride + size * n, offset=start)
        rows = np.lib.stride_tricks.as_strided(buf, shape=(acc["count"], size * n), strides=(stride, 1))
        out = np.ascontiguousarray(rows).view(np.dtype("<" + fmt)).reshape(acc["count"], n).astype(np.float64)
        if acc.get("normalized"):
            out /= float(np.iinfo(np.dtype("<" + fmt)).max)
        return out if n > 1 else out[:, 0]

    mats = []
    for m in gltf.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        factor = np.array(pbr.get("baseColorFactor", [1, 1, 1, 1])[:3])
        img = None
        if "baseColorTexture" in pbr:
            tex = gltf["textures"][pbr["baseColorTexture"]["index"]]
            im = gltf["images"][tex["source"]]
            img = np.asarray(Image.open(io.BytesIO(view_bytes(im["bufferView"]))).convert("RGB"), dtype=np.float64) / 255
        mats.append((factor, img))

    tris, uvs, mids = [], [], []

    def walk(ni, parent):
        node = gltf["nodes"][ni]
        m = parent @ _node_matrix(node)
        if "mesh" in node:
            for prim in gltf["meshes"][node["mesh"]]["primitives"]:
                p = accessor(prim["attributes"]["POSITION"])
                p = (np.c_[p, np.ones(len(p))] @ m.T)[:, :3]
                uv = accessor(prim["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in prim["attributes"] else np.zeros((len(p), 2))
                idx = accessor(prim["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in prim else np.arange(len(p)).reshape(-1, 3)
                tris.append(p[idx])
                uvs.append(uv[idx])
                mids.append(np.full(len(idx), prim.get("material", 0)))
        for c in node.get("children", []):
            walk(c, m)

    for ni in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(ni, np.eye(4))
    return np.concatenate(tris), np.concatenate(uvs), np.concatenate(mids), mats


def sample_logo(path):
    tris, uvs, mids, mats = load_textured(path)
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    pick = rng.choice(len(area), size=N, p=area / area.sum())
    u, v = rng.random(N), rng.random(N)
    flip = u + v > 1
    u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    pts = a[pick] + (b[pick] - a[pick]) * u[:, None] + (c[pick] - a[pick]) * v[:, None]
    uv = uvs[pick, 0] + (uvs[pick, 1] - uvs[pick, 0]) * u[:, None] + (uvs[pick, 2] - uvs[pick, 0]) * v[:, None]
    col = np.zeros((N, 3))
    for k, (factor, img) in enumerate(mats):
        s = mids[pick] == k
        if not s.any():
            continue
        if img is None:
            col[s] = factor
        else:
            h, w, _ = img.shape
            x = np.clip((uv[s, 0] % 1.0) * (w - 1), 0, w - 1).astype(int)
            y = np.clip((uv[s, 1] % 1.0) * (h - 1), 0, h - 1).astype(int)
            col[s] = img[y, x] * factor
    # sur fond sombre en mélange additif, le noir disparaît : on le passe en gris acier bleuté
    lum = col @ np.array([0.3, 0.55, 0.15])
    dark = lum < 0.18
    if dark.any():
        col[dark] = np.array([0.26, 0.3, 0.42])
    return pts, col


def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255.0


def brand_colors(name, pts, col):
    """Les textures des logos plats sont blanches : on applique les couleurs officielles."""
    c = pts - (pts.min(0) + pts.max(0)) / 2
    if name == "android":
        return np.tile(hexc("#3DDC84"), (len(pts), 1))
    if name == "windows":
        # 4 carreaux séparés par des interstices : zones de points connectées sur une grille
        # (les k-moyennes débordaient d'un carreau sur l'autre au niveau des coins)
        xy = c[:, :2]
        G = 220
        lo, hi = xy.min(0), xy.max(0)
        ij = np.clip(((xy - lo) / (hi - lo) * (G - 1)).astype(int), 0, G - 1)
        occ = np.zeros((G, G), bool)
        occ[ij[:, 0], ij[:, 1]] = True
        lab = np.zeros((G, G), int)
        n = 0
        for i0, j0 in zip(*np.nonzero(occ)):
            if lab[i0, j0]:
                continue
            n += 1
            stack = [(i0, j0)]
            lab[i0, j0] = n
            while stack:
                i, j = stack.pop()
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    a, b = i + di, j + dj
                    if 0 <= a < G and 0 <= b < G and occ[a, b] and not lab[a, b]:
                        lab[a, b] = n
                        stack.append((a, b))
        plab = lab[ij[:, 0], ij[:, 1]]
        sizes = np.bincount(plab)
        tiles = np.argsort(sizes)[::-1][:4]
        palette = {}
        for t in tiles:
            m = xy[plab == t].mean(0)
            palette[t] = hexc({(True, True): "#F25022", (False, True): "#7FBA00",
                               (True, False): "#00A4EF", (False, False): "#FFB900"}[(m[0] < 0, m[1] > 0)])
        out = np.empty_like(col)
        # fragments détachés (pointes fines des carreaux) : rattachés au carreau dont un POINT
        # est le plus proche (et non le centre, qui peut être celui du carreau voisin)
        samples = {t: xy[plab == t][::7] for t in tiles}
        for k in range(len(xy)):
            t = plab[k]
            if t not in palette:
                t = min(tiles, key=lambda tt: ((samples[tt] - xy[k]) ** 2).sum(1).min())
            out[k] = palette[t]
        return out
    if name == "apple":
        return np.tile(hexc("#D8DCE6"), (len(pts), 1))
    return col


def main():
    os.makedirs(PREV, exist_ok=True)
    for name, fname in LOGOS:
        pts, col = sample_logo(os.path.join(SRC, fname))
        col = brand_colors(name, pts, col)
        pts = normalize(pts)
        perm = _hilbert_perm(pts)
        pts, col = pts[perm], col[perm]
        write_bin(pts, os.path.join(OUT, f"{name}.bin"))
        rgba = np.zeros((N, 4), np.uint8)
        rgba[:, :3] = np.round(np.clip(col, 0, 1) ** (1 / 1.4) * 255)   # même encodage que la maquette
        rgba[:, 3] = 255
        rgba.tofile(os.path.join(OUT, f"{name}.col"))
        prev_img = np.zeros((360, 720, 3))
        for kk, (ax, ay) in enumerate([(0, 1), (2, 1)]):
            sx = (kk * 360 + 180 + pts[:, ax] * 160).astype(int)
            sy = (180 - pts[:, ay] * 160).astype(int)
            prev_img[sy.clip(0, 359), sx.clip(0, 719)] = col
        Image.fromarray((prev_img * 255).astype(np.uint8)).save(os.path.join(PREV, f"{name}.png"))
        print(f"  {name:8s} {N} pts -> public/shapes/{name}.bin/.col")

    # poignée de main (section Parcours) : dégradé holographique du site, en alternance avec le cube
    tris, uvs, mids, mats = load_textured(os.path.join(SRC, "poigner.glb"))
    from pointcloud import sample_triangles
    pts = normalize(sample_triangles(tris, N, rng))
    pts = pts[_hilbert_perm(pts)]
    write_bin(pts, os.path.join(OUT, "poignee.bin"))
    preview_png(pts, os.path.join(PREV, "poignee.png"))
    print("  poignee  32768 pts -> public/shapes/poignee.bin")

    path = os.path.join(OUT, "manifest.json")
    man = json.load(open(path, encoding="utf-8"))
    man["poignee"] = {"idle": 0.5}
    man["parcours"] = {"cycle": ["cube", "poignee"], "hold": 3.2, "move": 2.0, "idle": 0.6}
    for name, _ in LOGOS:
        man[name] = {"colors": True, "idle": 0.6}
    man["os"] = {"cycle": [name for name, _ in LOGOS], "hold": 3.0, "move": 1.9, "idle": 0.6}
    json.dump(man, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print("  manifest : forme 'os' = cycle", [n for n, _ in LOGOS])


if __name__ == "__main__":
    main()
