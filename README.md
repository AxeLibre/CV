# Axel Lasalvia · Portfolio v2

Site vitrine et CV : hologramme de particules qui se transforme au scroll et réagit à la souris (ou au doigt), études de cas des projets, version FR et EN.

**Stack** : Astro 5 (pages statiques), Three.js (shaders GLSL), GSAP + ScrollTrigger + SplitText, Lenis (scroll fluide à la souris), Python (outils de conversion), addon Blender.

## Commandes

```bash
npm install          # une seule fois
npm run dev          # site local : http://localhost:4321/CV/
npm run build        # génère le site final dans dist/
npm run preview      # teste le build final
npm run shapes       # régénère les formes 3D (Python + numpy + Pillow)
```

## Arborescence

```
src/
  content/projects/*.md   ← une étude de cas par fichier (texte + fiche technique en en-tête)
  data/site.ts            ← textes de l'accueil (FR / EN), parcours, liens
  components/Home.astro   ← page d'accueil (sections et formes associées)
  pages/                  ← index (FR), en/ (EN), projets/[slug], 404
  morph/engine.ts         ← moteur de particules (GPU)
  morph/shaders.ts        ← shaders holographiques (morph, survol, scan, glitch)
  morph/stage.ts          ← lien scroll ↔ morph (placement, parallaxe verticale)
  scripts/motion.ts       ← animations d'interface, menu, curseur, e-mail
  styles/global.css       ← design system
public/
  shapes/*.bin            ← formes du morph (32 768 points, Int16, triées Hilbert)
  media/                  ← images des projets (WebP)
  cv/                     ← CV en PDF
tools/
  blender/export_points.py ← addon Blender d'export de nuage de points
  build_shapes.py          ← conversion JSON / GLB / formes procédurales → .bin
  render_covers.py         ← couvertures "hologramme" des projets
```

## Ajouter une forme depuis Blender

1. Dans Blender : *Édition > Préférences > Modules complémentaires > Installer*, puis choisir `tools/blender/export_points.py`.
2. Sélectionner le ou les objets, puis *Fichier > Exporter > Nuage de points portfolio (.json)*. Garder **32768 points**.
3. Enregistrer le fichier dans `tools/sources/ma_forme.json`.
4. Dans `tools/build_shapes.py`, ajouter une ligne au dictionnaire `SHAPES` :
   `"ma_forme": ("json", os.path.join(ROOT, "tools", "sources", "ma_forme.json")),`
5. Lancer `npm run shapes ma_forme`. Un aperçu PNG est créé dans `tools/previews/`.
6. Utiliser la forme dans une section avec `data-shape="ma_forme"`, ou dans le champ `shape:` d'un projet.

Les anciens exports (format `{positions:[{x,y,z,...}]}`) sont aussi acceptés.

Options par forme dans `public/shapes/manifest.json` : `tilt` (inclinaison de présentation), `scale`, `idle` (amplitude de l'oscillation), `flap` (battement d'ailes), `colors` (fichier `.col` de couleurs RGBA).

## Maquette Place de Milan (nuit + propositions)

`tools/build_milan.py` génère la maquette de nuit de la version 1.12 et les propositions de bâtiments :

1. Les GLB compressés en Meshopt (`batis_2018.glb`, `voirie_parcs.glb`) doivent d'abord être décompressés dans `tools/sources/milan/` :
   `npx @gltf-transform/cli copy batis_2018.glb tmp.glb` puis `npx @gltf-transform/cli dequantize tmp.glb tools/sources/milan/batis_2018.glb`
2. Les propositions sont listées dans `PROJECTS` (fichiers de sauvegarde JSON du simulateur, dossier `D:\Site_Web\milan`). Pour en ajouter une, ajoute une ligne, puis lance `python tools/build_milan.py`.

## Ajouter un projet

Copier un fichier de `src/content/projects/`, puis modifier l'en-tête : titre, résumé, `shape`, `cover`, liens… Le champ `order` fixe la position du projet dans la grille, et `featured: true` l'affiche en grand.

## Déploiement sur GitHub Pages

Le site est configuré pour le dépôt **AxeLibre/CV** (adresse : `https://axelibre.github.io/CV/`).
Pour un autre dépôt, change `base` dans `astro.config.mjs` (par exemple `'/'` pour un dépôt `axelibre.github.io` ou un nom de domaine).

1. Pousser **le contenu de ce dossier `portfolio/`** à la racine du dépôt (avec GitHub Desktop : *Add local repository* ou copier les fichiers dans le clone, puis *Commit* et *Push*). Ne pas pousser `node_modules/` ni `dist/`, le `.gitignore` s'en charge.
2. Sur GitHub : *Settings > Pages > Build and deployment > Source* : **GitHub Actions**.
3. À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` construit et publie le site automatiquement (onglet *Actions*).
