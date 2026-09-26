"""
Ordinateur portable de l'accueil, dont l'écran affiche « BIENVENUE » puis « WELCOME ».

Forme composée (comme la maquette de Milan) : un corps fixe (base, clavier, écran)
et un bloc de particules pour le texte de l'écran, une variante par mot. Les points du
texte sont triés de gauche à droite : la transition, décalée selon x dans le shader,
fait apparaître le mot comme s'il s'écrivait.

    python tools/build_welcome.py
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from pointcloud import box_tris, hilbert_sort, preview_png, sample_triangles
from build_milan import _hilbert_perm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "shapes")
PREV = os.path.join(ROOT, "tools", "previews")
N = 32768
N_TEXT = 8192
N_BASE = N - N_TEXT
FONT = r"C:\Windows\Fonts\bahnschrift.ttf"
WORDS = [("fr", "BIENVENUE"), ("en", "WELCOME")]
rng = np.random.default_rng(777)

ANG = math.radians(-12)
ROT = np.array([[1, 0, 0], [0, math.cos(ANG), -math.sin(ANG)], [0, math.sin(ANG), math.cos(ANG)]])


def on_screen(p):
    """Du plan de l'écran (x, y, z local) vers la position du portable (écran incliné, à l'arrière)."""
    p = p @ ROT.T
    p[:, 2] -= 1.0
    return p


def laptop_body():
    tris = [box_tris(0, -0.04, 0, 3.0, 0.08, 2.0)]
    for r in range(5):
        for c in range(12):
            tris.append(box_tris(-1.32 + c * 0.24, 0.02, -0.72 + r * 0.24, 0.19, 0.03, 0.19))
    tris.append(box_tris(0, 0.005, 0.62, 0.9, 0.01, 0.5))
    screen = box_tris(0, 0.95, 0, 3.0, 1.9, 0.06)
    tris.append(on_screen(screen.reshape(-1, 3)).reshape(-1, 3, 3))
    return sample_triangles(np.concatenate(tris), N_BASE, rng)


def word_points(word):
    """Texte rastérisé puis échantillonné sur le plan de l'écran (légèrement devant la dalle)."""
    font = ImageFont.truetype(FONT, 300)
    bb = font.getbbox(word)
    w, h = bb[2] - bb[0] + 40, bb[3] - bb[1] + 40
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((20 - bb[0], 20 - bb[1]), word, fill=255, font=font)
    ys, xs = np.nonzero(np.array(img) > 127)
    k = rng.integers(0, len(xs), N_TEXT)
    x = xs[k] + rng.random(N_TEXT) - 0.5
    y = ys[k] + rng.random(N_TEXT) - 0.5
    # mise à l'échelle dans la dalle (largeur utile 2.5, centré à mi-hauteur de l'écran)
    s = 2.5 / w
    px = (x - w / 2) * s
    py = 0.95 - (y - h / 2) * s
    pts = np.c_[px, py, np.full(N_TEXT, 0.045) + rng.normal(0, 0.004, N_TEXT)]
    return on_screen(pts)


def main():
    body = laptop_body()
    words = [(wid, word, word_points(word)) for wid, word in WORDS]
    allp = np.concatenate([body] + [p for _, _, p in words])
    lo, hi = allp.min(0), allp.max(0)
    center = (lo + hi) / 2
    scale = 2.0 / max(hi - lo)
    norm = lambda p: (p - center) * scale

    b = norm(body)
    b = b[_hilbert_perm(b)]
    q = lambda p: np.clip(np.round(p * 32767), -32767, 32767).astype("<i2")
    q(b).tofile(os.path.join(OUT, "accueil-base.bin"))
    np.zeros((N_BASE, 4), np.uint8).tofile(os.path.join(OUT, "accueil-base.col"))   # dégradé du site

    variants = []
    for wid, word, p in words:
        t = norm(p)
        t = t[np.argsort(t[:, 0], kind="stable")]          # de gauche à droite : effet d'écriture
        q(t).tofile(os.path.join(OUT, f"accueil-{wid}.bin"))
        col = np.zeros((N_TEXT, 4), np.uint8)
        col[:, :3] = (np.array([0.62, 0.95, 1.0]) ** (1 / 1.4) * 255).astype(np.uint8)   # texte d'écran lumineux
        col[:, 3] = 255
        col.tofile(os.path.join(OUT, f"accueil-{wid}.col"))
        variants.append({"id": wid, "file": f"accueil-{wid}", "label": word, "source": "", "buildings": 0, "floors": 0})
        preview_png(np.concatenate([b, t]), os.path.join(PREV, f"accueil-{wid}.png"))
    print(f"  accueil : corps {N_BASE} pts + texte {N_TEXT} pts x {len(words)} ({', '.join(w for _, w in WORDS)})")

    path = os.path.join(OUT, "manifest.json")
    man = json.load(open(path, encoding="utf-8"))
    man["accueil"] = {
        "colors": True,
        "compose": {"kind": "text", "base": "accueil-base", "count": N_BASE, "blockCount": N_TEXT,
                    "ground": 0, "footColor": [0, 0, 0], "variants": variants, "hold": 2.8, "move": 1.6},
    }
    json.dump(man, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
