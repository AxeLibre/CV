bl_info = {
    "name": "Export nuage de points (Portfolio morph)",
    "author": "Axel Lasalvia",
    "version": (2, 0, 0),
    "blender": (3, 6, 0),
    "location": "Fichier > Exporter > Nuage de points portfolio (.json)",
    "description": "Échantillonne la surface des objets sélectionnés et exporte un nuage de points pour le morph du site",
    "category": "Import-Export",
}

"""
Installation : Édition > Préférences > Modules complémentaires > Installer... > ce fichier.

Pourquoi échantillonner la surface plutôt qu'exporter les sommets ?
Les sommets suivent la topologie (denses là où le maillage est fin, vides sur les
grandes faces). Un tirage pondéré par l'aire répartit les points uniformément sur
la surface visible : la silhouette est nette quel que soit le modèle.

Le JSON produit ({"format": "points-v2", "positions": [x, y, z, ...]}) va dans
tools/sources/, puis `npm run shapes` le convertit en .bin trié et compressé.
"""

import json
import random

import bpy
import bmesh
from bpy.props import BoolProperty, IntProperty, StringProperty
from bpy_extras.io_utils import ExportHelper


def collect_triangles(context, apply_modifiers):
    depsgraph = context.evaluated_depsgraph_get()
    tris = []
    for obj in context.selected_objects:
        if obj.type not in {"MESH", "CURVE", "FONT", "SURFACE", "META"}:
            continue
        src = obj.evaluated_get(depsgraph) if apply_modifiers else obj
        mesh = src.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        mw = obj.matrix_world
        for f in bm.faces:
            a, b, c = (mw @ v.co for v in f.verts)
            area = (b - a).cross(c - a).length * 0.5
            if area > 1e-12:
                tris.append((a, b, c, area))
        bm.free()
        src.to_mesh_clear()
    return tris


def sample(tris, count, seed):
    rnd = random.Random(seed)
    total = sum(t[3] for t in tris)
    # table cumulative pour un tirage pondéré par l'aire
    cumul, acc = [], 0.0
    for t in tris:
        acc += t[3] / total
        cumul.append(acc)
    import bisect
    pts = []
    for _ in range(count):
        a, b, c, _area = tris[min(bisect.bisect_left(cumul, rnd.random()), len(tris) - 1)]
        u, v = rnd.random(), rnd.random()
        if u + v > 1:
            u, v = 1 - u, 1 - v
        p = a + (b - a) * u + (c - a) * v
        pts.append(p)
    return pts


class EXPORT_OT_portfolio_points(bpy.types.Operator, ExportHelper):
    bl_idname = "export_scene.portfolio_points"
    bl_label = "Exporter le nuage de points"
    filename_ext = ".json"
    filter_glob: StringProperty(default="*.json", options={"HIDDEN"})

    count: IntProperty(name="Nombre de points", default=32768, min=1024, max=262144,
                       description="Toutes les formes du site doivent avoir le même nombre (32768 par défaut)")
    apply_modifiers: BoolProperty(name="Appliquer les modificateurs", default=True)
    y_up: BoolProperty(name="Convertir en Y-up (Three.js)", default=True)
    seed: IntProperty(name="Graine aléatoire", default=2026)

    def execute(self, context):
        tris = collect_triangles(context, self.apply_modifiers)
        if not tris:
            self.report({"ERROR"}, "Sélectionne au moins un objet maillé")
            return {"CANCELLED"}
        pts = sample(tris, self.count, self.seed)
        flat = []
        for p in pts:
            x, y, z = (p.x, p.z, -p.y) if self.y_up else (p.x, p.y, p.z)
            flat += [round(x, 5), round(y, 5), round(z, 5)]
        data = {
            "format": "points-v2",
            "source": ", ".join(o.name for o in context.selected_objects),
            "count": self.count,
            "positions": flat,
        }
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        self.report({"INFO"}, f"{self.count} points exportés")
        return {"FINISHED"}


def menu_func(self, context):
    self.layout.operator(EXPORT_OT_portfolio_points.bl_idname, text="Nuage de points portfolio (.json)")


def register():
    bpy.utils.register_class(EXPORT_OT_portfolio_points)
    bpy.types.TOPBAR_MT_file_export.append(menu_func)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu_func)
    bpy.utils.unregister_class(EXPORT_OT_portfolio_points)


if __name__ == "__main__":
    register()
