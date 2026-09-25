"""
Rend des couvertures "hologramme" (WebP) à partir des formes .bin,
pour les projets qui n'ont pas encore de capture d'écran.

    python tools/render_covers.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAPES = os.path.join(ROOT, "public", "shapes")
OUT = os.path.join(ROOT, "public", "media")

CYAN = np.array([34, 228, 255], dtype=np.float64)
VIOLET = np.array([123, 92, 255], dtype=np.float64)
MAGENTA = np.array([255, 63, 216], dtype=np.float64)

COVERS = {
    # nom du fichier : (forme, rotation Y en degrés, rotation X, zoom)
    "cover-netscan": ("network", 20, 10, 1.4),
    "cover-morph": ("head", -28, 4, 1.4),
}


def load(name):
    q = np.fromfile(os.path.join(SHAPES, f"{name}.bin"), dtype="<i2").reshape(-1, 3)
    return q.astype(np.float64) / 32767


def render(name, ry, rx, zoom, w=1600, h=1000, dist=3.2):
    """dist : distance de la caméra. Plus elle est grande, moins la perspective déforme."""
    p = load(name)
    a, b = math.radians(ry), math.radians(rx)
    Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    p = p @ (Rx @ Ry).T
    z = p[:, 2] + dist
    f = h * 0.95 * zoom * dist / 3.2
    sx = (w / 2 + p[:, 0] * f / z * 1.0).astype(int)
    sy = (h / 2 - p[:, 1] * f / z).astype(int)

    t = np.clip((p[:, 0] + p[:, 1]) * 0.35 + 0.5, 0, 1)[:, None]
    col = np.where(t < 0.5, CYAN + (VIOLET - CYAN) * (t * 2), VIOLET + (MAGENTA - VIOLET) * ((t - 0.5) * 2))
    depth = np.clip(1.25 - (z - dist + 1.0) / 2.2, 0.35, 1.2)[:, None]

    acc = np.zeros((h, w, 3))
    ok = (sx >= 0) & (sx < w) & (sy >= 0) & (sy < h)
    np.add.at(acc, (sy[ok], sx[ok]), col[ok] * depth[ok] * 0.55)

    base = Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8))
    glow1 = np.asarray(base.filter(ImageFilter.GaussianBlur(3)), dtype=np.float64)
    glow2 = np.asarray(base.filter(ImageFilter.GaussianBlur(18)), dtype=np.float64)

    # fond : dégradé radial profond + grille fine
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot((xx - w / 2) / w, (yy - h / 2) / h)
    bg = np.zeros((h, w, 3))
    bg[..., 0] = 7 + 10 * np.exp(-r * r * 6)
    bg[..., 1] = 8 + 10 * np.exp(-r * r * 6)
    bg[..., 2] = 16 + 26 * np.exp(-r * r * 6)
    grid = ((xx % 64 == 0) | (yy % 64 == 0)) * 7.0
    bg += grid[..., None] * np.exp(-r * r * 3)[..., None]

    img = bg + acc * 1.6 + glow1 * 2.2 + glow2 * 3.5
    img = 255 * (1 - np.exp(-img / 170))          # tone mapping doux
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def render_og():
    """Image de partage (Open Graph, 1200x630) : la tête de face, caméra éloignée
    pour des proportions naturelles. En JPG : reconnu par toutes les plateformes."""
    im = render("head", 0, 0, 1.36, w=1200, h=630, dist=11)
    path = os.path.join(OUT, "og-image.jpg")
    im.save(path, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"  og-image.jpg ({os.path.getsize(path) // 1024} KB)")


if __name__ == "__main__":
    render_og()
    for out, (shape, ry, rx, zoom) in COVERS.items():
        im = render(shape, ry, rx, zoom)
        path = os.path.join(OUT, f"{out}.webp")
        im.save(path, "WEBP", quality=82, method=6)
        print(f"  {out}.webp ({os.path.getsize(path) // 1024} KB)")
