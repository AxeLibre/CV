"""
Outils de nuage de points pour le moteur de morphing du portfolio.

Format de sortie (.bin) : N points * 3 composantes Int16 (little-endian),
coordonnées normalisées dans [-1, 1] (la plus grande dimension vaut 2).
Les points sont triés le long d'une courbe de Hilbert 3D : deux formes
différentes ont ainsi leurs points "voisins" au même index, ce qui donne
un morph cohérent. Un sous-échantillonnage par pas (stride) reste uniforme,
ce qui sert de LOD mobile côté navigateur.
"""
import json
import math
import random
import struct

import numpy as np

# ---------------------------------------------------------------------------
# Lecture des sources
# ---------------------------------------------------------------------------

def load_json_points(path):
    """Accepte l'ancien format Blender ({positions:[{x,y,z,...}]})
    et le nouveau ({format:'points-v2', positions:[x,y,z,x,y,z,...]})."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    pos = data["positions"]
    if pos and isinstance(pos[0], dict):
        return np.array([[p["x"], p["y"], p["z"]] for p in pos], dtype=np.float64)
    return np.array(pos, dtype=np.float64).reshape(-1, 3)


def _quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
        [0, 0, 0, 1],
    ])


def _node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if "scale" in node:
        m = np.diag([*node["scale"], 1.0]) @ m
    if "rotation" in node:
        m = _quat_to_mat(node["rotation"]) @ m
    if "translation" in node:
        t = np.eye(4)
        t[:3, 3] = node["translation"]
        m = t @ m
    return m


_COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def load_glb_triangles(path, mesh_filter=None, with_materials=False):
    """Lit un .glb non compressé et renvoie les triangles (T,3,3) en espace monde.
    Avec with_materials=True, renvoie aussi le nom du matériau de chaque triangle
    et le nom du nœud d'origine."""
    raw = open(path, "rb").read()
    jlen = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + jlen])
    if gltf.get("extensionsUsed") and any("compression" in e or "draco" in e.lower() for e in gltf["extensionsUsed"]):
        raise ValueError(f"{path} est compressé ({gltf['extensionsUsed']}), décompresse-le (gltf-transform copy + dequantize).")
    boff = 20 + jlen
    blen = struct.unpack("<I", raw[boff:boff + 4])[0]
    binchunk = raw[boff + 8: boff + 8 + blen]

    def accessor(i):
        acc = gltf["accessors"][i]
        view = gltf["bufferViews"][acc["bufferView"]]
        fmt, size = _COMP[acc["componentType"]]
        n = _NCOMP[acc["type"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride", size * n)
        dt = np.dtype("<" + fmt)
        count = acc["count"]
        buf = np.frombuffer(binchunk, dtype=np.uint8, count=(count - 1) * stride + size * n, offset=start)
        rows = np.lib.stride_tricks.as_strided(buf, shape=(count, size * n), strides=(stride, 1))
        out = np.ascontiguousarray(rows).view(dt).reshape(count, n).astype(np.float64)
        if acc.get("normalized"):
            out /= float(np.iinfo(dt).max)
        return out if n > 1 else out[:, 0]

    mats = [m.get("name", f"mat{i}") for i, m in enumerate(gltf.get("materials", []))]
    tris, tri_mat, tri_node = [], [], []

    def walk(ni, parent):
        node = gltf["nodes"][ni]
        m = parent @ _node_matrix(node)
        if "mesh" in node:
            mesh = gltf["meshes"][node["mesh"]]
            if mesh_filter is None or mesh_filter(mesh.get("name", ""), node.get("name", "")):
                for prim in mesh["primitives"]:
                    if prim.get("mode", 4) != 4:
                        continue
                    p = accessor(prim["attributes"]["POSITION"])
                    p = (np.c_[p, np.ones(len(p))] @ m.T)[:, :3]
                    idx = accessor(prim["indices"]).astype(np.int64) if "indices" in prim else np.arange(len(p))
                    t = p[idx.reshape(-1, 3)]
                    tris.append(t)
                    mi = prim.get("material")
                    tri_mat.extend([mats[mi] if mi is not None else ""] * len(t))
                    tri_node.extend([node.get("name", "")] * len(t))
        for c in node.get("children", []):
            walk(c, m)

    scene = gltf["scenes"][gltf.get("scene", 0)]
    for ni in scene["nodes"]:
        walk(ni, np.eye(4))
    all_tris = np.concatenate(tris, axis=0)
    if with_materials:
        return all_tris, np.array(tri_mat), np.array(tri_node)
    return all_tris


# ---------------------------------------------------------------------------
# Échantillonnage de surfaces
# ---------------------------------------------------------------------------

def sample_triangles(tris, n, rng=None, return_index=False, weights=None):
    """Tirage uniforme de n points sur des triangles, pondéré par l'aire
    (éventuellement multipliée par un poids par triangle)."""
    rng = rng or np.random.default_rng(7)
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    if weights is not None:
        area = area * weights
    keep = np.nonzero(area > 1e-12)[0]
    a, b, c, area = a[keep], b[keep], c[keep], area[keep]
    pick = rng.choice(len(area), size=n, p=area / area.sum())
    u = rng.random(n)
    v = rng.random(n)
    flip = u + v > 1
    u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    pts = a[pick] + (b[pick] - a[pick]) * u[:, None] + (c[pick] - a[pick]) * v[:, None]
    return (pts, keep[pick]) if return_index else pts


def box_tris(cx, cy, cz, sx, sy, sz):
    """12 triangles d'une boîte centrée (utile pour les formes procédurales)."""
    x0, x1 = cx - sx / 2, cx + sx / 2
    y0, y1 = cy - sy / 2, cy + sy / 2
    z0, z1 = cz - sz / 2, cz + sz / 2
    v = np.array([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
                  [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])
    f = [(0, 1, 2), (0, 2, 3), (4, 6, 5), (4, 7, 6), (0, 4, 5), (0, 5, 1),
         (3, 2, 6), (3, 6, 7), (0, 3, 7), (0, 7, 4), (1, 5, 6), (1, 6, 2)]
    return np.array([[v[i], v[j], v[k]] for i, j, k in f])


# ---------------------------------------------------------------------------
# Normalisation, rééchantillonnage, tri Hilbert, écriture
# ---------------------------------------------------------------------------

def normalize(pts):
    lo, hi = pts.min(0), pts.max(0)
    center = (lo + hi) / 2
    scale = 2.0 / max(hi - lo)
    return (pts - center) * scale


def resample(pts, n, rng=None, sigma=None):
    """Ramène le nuage à exactement n points (sous-échantillonne ou duplique avec jitter).
    sigma : amplitude du jitter imposée (utile pour les surfaces très fines)."""
    rng = rng or np.random.default_rng(11)
    m = len(pts)
    if m >= n:
        return pts[rng.choice(m, size=n, replace=False)]
    extra = pts[rng.choice(m, size=n - m, replace=True)]
    # jitter proportionnel à l'espacement moyen estimé
    spacing = (np.prod(np.maximum(pts.max(0) - pts.min(0), 1e-3)) / m) ** (1 / 3)
    extra = extra + rng.normal(0, spacing * 0.35 if sigma is None else sigma, extra.shape)
    return np.concatenate([pts, extra])


def _hilbert_index(x, y, z, bits):
    """Algorithme de Skilling (transposition) -> index de Hilbert 3D."""
    X = [int(x), int(y), int(z)]
    M = 1 << (bits - 1)
    Q = M
    while Q > 1:
        P = Q - 1
        for i in range(3):
            if X[i] & Q:
                X[0] ^= P
            else:
                t = (X[0] ^ X[i]) & P
                X[0] ^= t
                X[i] ^= t
        Q >>= 1
    for i in range(1, 3):
        X[i] ^= X[i - 1]
    t = 0
    Q = M
    while Q > 1:
        if X[2] & Q:
            t ^= Q - 1
        Q >>= 1
    for i in range(3):
        X[i] ^= t
    h = 0
    for b in range(bits - 1, -1, -1):
        for i in range(3):
            h = (h << 1) | ((X[i] >> b) & 1)
    return h


def hilbert_sort(pts, bits=10):
    lo, hi = pts.min(0), pts.max(0)
    q = ((pts - lo) / np.maximum(hi - lo, 1e-9) * ((1 << bits) - 1)).astype(np.int64)
    keys = np.array([_hilbert_index(a, b, c, bits) for a, b, c in q])
    return pts[np.argsort(keys, kind="stable")]


def write_bin(pts, path):
    q = np.clip(np.round(pts * 32767), -32767, 32767).astype("<i2")
    q.tofile(path)


def preview_png(pts, path, size=360):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (size * 2, size), (5, 6, 12))
    d = ImageDraw.Draw(img)
    for k, (a, b) in enumerate([(0, 1), (2, 1)]):
        for i, p in enumerate(pts[::2]):
            t = i / (len(pts) / 2)
            col = (int(255 * t), int(229 * (1 - t) + 43 * t), int(255 * (1 - t) + 214 * t))
            d.point((k * size + size / 2 + p[a] * size * 0.45, size / 2 - p[b] * size * 0.45), col)
    img.save(path)
