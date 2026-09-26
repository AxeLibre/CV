"""
Maquette "Place de Milan" v1.12 COMPLÈTE en vrai maillage (et non plus en particules) pour le site.

Produit dans public/shapes/ :
  milan-scene.glb   un mesh par matériau : place, gare, tours, Bâtis 2018 et voirie de toute la zone,
                    + le gabarit d'arbre low-poly de l'application. Pas de normales (le shader les
                    recalcule) : les sommets sont soudés et le fichier reste léger. Chaque sommet porte
                    l'attribut _DIST, distance (m) de son bâtiment au centre du site :
                    0 pour la maquette « de départ » (le cadrage des particules), sinon la distance à
                    laquelle l'onde de révélation le fait apparaître. Les bâtiments sont traités ENTIERS
                    (composantes connexes) : aucun n'est coupé au bord du cadrage.
  milan-city.bin/.col  particules de l'onde radiale qui construit le reste de la ville.
  milan-trees.bin   positions des arbres (Int16, décimètres).
et complète l'entrée "milan" du manifest ("solid").

    python tools/build_milan_scene.py
"""
import json
import os
import struct
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pointcloud import load_glb_triangles
from build_milan import SITE, WINDOWS, window_light

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "shapes")
V112 = r"D:\Site_Web\milan\version1.12"
SRC = os.path.join(os.path.dirname(ROOT), "ONE - Copie", "portfolio", "tools", "sources", "milan")
X0, X1, Z0, Z1 = -390.0, 190.0, -170.0, 330.0          # cadrage de la maquette de départ (particules)
N_DUST = 32768
rng = np.random.default_rng(2112)

SKIP_MATS = {"noir", "TRANSPARENT", "PLU", "tronc", "feuillage"}
SKIP_NODES = ("Detector", "Route_", "polygone_implantation", "Icosph")
GROUND = {"ROUTE", "TROTTOIRE", "gazon", "ppy", "PLACE BERAUDIER", "Matériau.004"}


def fix(s):
    return s.replace("\ufffd", "é")


def lights_of(path):
    from pointcloud import _node_matrix
    raw = open(path, "rb").read()
    jlen = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + jlen])
    out = []

    def walk(ni, parent):
        node = gltf["nodes"][ni]
        m = parent @ _node_matrix(node)
        if "KHR_lights_punctual" in node.get("extensions", {}):
            out.append(m[:3, 3].tolist())
        for c in node.get("children", []):
            walk(c, m)

    for ni in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(ni, np.eye(4))
    return out


def boundary_loops(tris):
    key = lambda p: (round(p[0], 2), round(p[2], 2))
    count = {}
    for t in tris:
        for i in range(3):
            a, b = key(t[i]), key(t[(i + 1) % 3])
            e = (a, b) if a < b else (b, a)
            count[e] = count.get(e, 0) + 1
    return [[list(a), list(b)] for (a, b), n in count.items() if n == 1]


def weld(tris, eps=0.01):
    """Sommets uniques (clé arrondie) : renvoie positions uniques et indices (T,3)."""
    keys = np.round(tris.reshape(-1, 3) / eps).astype(np.int64)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    return uniq.astype(np.float64) * eps, inv.reshape(-1, 3)


def components(tri_v, nverts):
    """Composantes connexes (bâtiments) par propagation du plus petit label + saut de pointeurs."""
    lab = np.arange(nverts)
    for _ in range(500):
        before = lab.copy()
        tl = lab[tri_v].min(1)
        for k in range(3):
            np.minimum.at(lab, tri_v[:, k], tl)
        lab = lab[lab]
        lab = lab[lab]
        if np.array_equal(lab, before):
            break
    return lab[tri_v[:, 0]]


def write_glb(meshes, path):
    """meshes : liste de (nom, matériau, positions (V,3), indices (T,3), dist (V,) ou None)."""
    bin_parts, views, accessors, gl_meshes, materials, nodes = [], [], [], [], [], []
    mat_index, offset = {}, 0

    def add(data, target, comp, count, typ, extra=None):
        nonlocal offset
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": count, "type": typ}
        if extra:
            acc.update(extra)
        accessors.append(acc)
        bin_parts.append(data)
        offset += len(data)
        pad = (-offset) % 4
        if pad:
            bin_parts.append(b"\0" * pad)
            offset += pad
        return len(accessors) - 1

    for name, mat, pos, idx, dist in meshes:
        if mat not in mat_index:
            mat_index[mat] = len(materials)
            materials.append({"name": mat})
        attrs = {"POSITION": add(pos.astype("<f4").tobytes(), 34962, 5126, len(pos), "VEC3",
                                 {"min": pos.min(0).tolist(), "max": pos.max(0).tolist()})}
        if dist is not None:
            attrs["_DIST"] = add(dist.astype("<f4").tobytes(), 34962, 5126, len(dist), "SCALAR")
        ind = add(idx.astype("<u4").reshape(-1).tobytes(), 34963, 5125, idx.size, "SCALAR")
        gl_meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": ind, "material": mat_index[mat]}]})
        nodes.append({"name": name, "mesh": len(gl_meshes) - 1})
    binary = b"".join(bin_parts)
    gltf = {"asset": {"version": "2.0", "generator": "portfolio build_milan_scene.py"},
            "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": gl_meshes,
            "materials": materials, "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(binary)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)


def main():
    parts = [
        load_glb_triangles(os.path.join(V112, "place_de_milan.glb"), with_materials=True),
        load_glb_triangles(os.path.join(V112, "global.glb"), with_materials=True),
        load_glb_triangles(os.path.join(SRC, "voirie_parcs.glb"), with_materials=True),
        load_glb_triangles(os.path.join(SRC, "batis_2018.glb"), with_materials=True),
    ]
    tris = np.concatenate([p[0] for p in parts])
    mats = np.array([fix(m) for m in np.concatenate([p[1] for p in parts]).astype(str)])
    nodes = np.array([fix(n) for n in np.concatenate([p[2] for p in parts]).astype(str)])

    tree_sel = np.char.startswith(nodes, "Icosph") & np.isin(mats, ["tronc", "feuillage"])
    tree = tris[tree_sel]
    tmin, tmax = tree.reshape(-1, 3).min(0), tree.reshape(-1, 3).max(0)
    tree = tree - np.array([(tmin[0] + tmax[0]) / 2, tmin[1], (tmin[2] + tmax[2]) / 2])
    tree_mats = mats[tree_sel]
    outline = boundary_loops(tris[np.char.startswith(nodes, "polygone_implantation")])

    keep = ~np.isin(mats, list(SKIP_MATS))
    for pre in SKIP_NODES:
        keep &= ~np.char.startswith(nodes, pre)
    tris, mats = tris[keep], mats[keep]
    print(f"  {len(tris)} triangles au total")

    # --- bâtiments entiers : composantes connexes sur les sommets soudés
    # tolérance large : dans les fichiers d'origine, les faces d'un même bâtiment ne partagent
    # pas toujours exactement leurs sommets
    # le sol relie les bâtiments entre eux : il est exclu du graphe de connexité
    ground = np.isin(mats, list(GROUND))
    vpos, tri_v = weld(tris[~ground], eps=0.25)
    comp = np.empty(len(tris), np.int64)
    comp[~ground] = components(tri_v, len(vpos))
    comp[ground] = comp[~ground].max() + 1 + np.arange(ground.sum())
    comp = np.unique(comp, return_inverse=True)[1]
    # blocs géants (ex. global.glb, bâtiments reliés par le sol) : on les redécoupe avec une
    # soudure fine, puis triangle par triangle s'ils restent trop étendus
    for eps in (0.01, None):
        cx = tris.mean(1)
        lo_x = np.full(comp.max() + 1, np.inf); hi_x = np.full(comp.max() + 1, -np.inf)
        lo_z = np.full(comp.max() + 1, np.inf); hi_z = np.full(comp.max() + 1, -np.inf)
        np.minimum.at(lo_x, comp, cx[:, 0]); np.maximum.at(hi_x, comp, cx[:, 0])
        np.minimum.at(lo_z, comp, cx[:, 2]); np.maximum.at(hi_z, comp, cx[:, 2])
        big = np.nonzero(np.maximum(hi_x - lo_x, hi_z - lo_z) > 750)[0]   # îlots et centre Part-Dieu restent entiers
        if not len(big):
            break
        sel = np.isin(comp, big)
        base = comp.max() + 1
        if eps is None:
            comp[sel] = base + np.arange(sel.sum())
        else:
            vp2, tv2 = weld(tris[sel], eps=eps)
            sub = np.unique(components(tv2, len(vp2)), return_inverse=True)[1]
            comp[sel] = base + sub
        comp = np.unique(comp, return_inverse=True)[1]
        print(f"  {len(big)} bloc(s) etendu(s) redecoupe(s) ({'triangles' if eps is None else f'soudure {eps} m'})")
    cen = tris.mean(1)
    area = 0.5 * np.linalg.norm(np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]), axis=1) + 1e-9
    ncomp = comp.max() + 1
    w = np.bincount(comp, weights=area, minlength=ncomp)
    ccx = np.bincount(comp, weights=cen[:, 0] * area, minlength=ncomp) / w
    ccz = np.bincount(comp, weights=cen[:, 2] * area, minlength=ncomp) / w
    # un bâtiment qui touche le cadrage est inclus EN ENTIER dans la maquette de départ
    tin_all = (cen[:, 0] > X0) & (cen[:, 0] < X1) & (cen[:, 2] > Z0) & (cen[:, 2] < Z1)
    inside_c = np.bincount(comp, weights=tin_all.astype(float), minlength=ncomp) > 0
    dist_c = np.where(inside_c, 0.0, np.hypot(ccx - SITE[0], ccz - SITE[2]))
    tri_dist = dist_c[comp]
    # le sol (voirie, trottoirs, parcs) est révélé triangle par triangle (pas de coupure visible à plat)
    tin = (cen[:, 0] > X0) & (cen[:, 0] < X1) & (cen[:, 2] > Z0) & (cen[:, 2] < Z1)
    tri_dist[ground] = np.where(tin[ground], 0.0, np.hypot(cen[ground, 0] - SITE[0], cen[ground, 2] - SITE[2]))
    print(f"  {ncomp} composantes ; maquette de départ : {inside_c.sum()} bâtiments entiers")

    meshes = []
    for m in sorted(set(mats)):
        sel = mats == m
        pos, idx = weld(tris[sel])
        vd = np.full(len(pos), np.inf)
        np.minimum.at(vd, idx.reshape(-1), np.repeat(tri_dist[sel], 3))
        meshes.append((f"m_{m}", m, pos, idx, vd))
        print(f"  {m:20s} {sel.sum():7d} tri")
    for m in ("tronc", "feuillage"):
        pos, idx = weld(tree[tree_mats == m], eps=0.001)
        meshes.append((f"tree_{m}", m, pos, idx, None))

    raw_path = os.path.join(OUT, "milan-scene.raw.glb")
    final = os.path.join(OUT, "milan-scene.glb")
    write_glb(meshes, raw_path)
    npx = "npx.cmd" if os.name == "nt" else "npx"
    subprocess.run([npx, "-y", "@gltf-transform/cli@4", "meshopt", raw_path, final], check=True, capture_output=True)
    os.remove(raw_path)

    # --- particules de l'onde : échantillonnées sur les bâtiments révélés, avec leurs couleurs de nuit
    outer = (tri_dist > 0) & ~ground
    ot, od, om = tris[outer], tri_dist[outer], mats[outer]
    oa = area[outer]
    pick = rng.choice(len(ot), size=N_DUST, p=oa / oa.sum())
    u, v = rng.random(N_DUST), rng.random(N_DUST)
    flip = u + v > 1
    u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    a, b, c = ot[pick, 0], ot[pick, 1], ot[pick, 2]
    pts = a + (b - a) * u[:, None] + (c - a) * v[:, None]
    nrm = np.cross(b - a, c - a)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    col = np.full((N_DUST, 3), 0.06)
    for name, prm in WINDOWS.items():
        s = om[pick] == name
        if s.any():
            col[s] = window_light(pts[s], nrm[s], prm) + 0.06
    order = np.argsort(od[pick])                       # du centre vers l'extérieur
    q = np.c_[np.round(pts[order] * 8), np.round(od[pick][order] * 4)].astype("<i2")
    q.tofile(os.path.join(OUT, "milan-city.bin"))
    rgba = np.zeros((N_DUST, 4), np.uint8)
    rgba[:, :3] = np.round(np.clip(col[order] / 1.6, 0, 1) ** (1 / 1.4) * 255)
    rgba[:, 3] = 255
    rgba.tofile(os.path.join(OUT, "milan-city.col"))

    # --- arbres (tous) et lumières (les 64 plus proches du site)
    trees = [[p["x"], 0.0, p["z"]] for p in json.load(open(os.path.join(V112, "trees.json")))]
    trees += [[p["x"], p["y"], p["z"]] for p in json.load(open(os.path.join(V112, "arbres_contexte.json")))]
    np.round(np.array(trees) * 10).astype("<i2").tofile(os.path.join(OUT, "milan-trees.bin"))
    lights = [l for f in ("place_de_milan.glb", "global.glb") for l in lights_of(os.path.join(V112, f))]
    lights += json.load(open(os.path.join(V112, "lampadaires_contexte.json")))
    lights = sorted(lights, key=lambda l: (l[0] - SITE[0]) ** 2 + (l[2] - SITE[2]) ** 2)[:64]

    print(f"  milan-scene.glb : {os.path.getsize(final) // 1024} Ko ; {len(trees)} arbres ; onde : {N_DUST} particules")
    path = os.path.join(OUT, "manifest.json")
    man = json.load(open(path, encoding="utf-8"))
    man["milan"]["solid"] = {
        "file": "milan-scene.glb",
        "trees": "milan-trees.bin",
        "dust": "milan-city",
        "lights": [[round(v, 2) for v in l] for l in lights],
        "outline": outline,
        "box": [X0, X1, Z0, Z1],
        "site": [float(SITE[0]), float(SITE[2])],
        "reach": float(np.ceil(tri_dist.max())),
        "saves": {vv["id"]: vv["source"] for vv in man["milan"]["compose"]["variants"]},
    }
    json.dump(man, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
