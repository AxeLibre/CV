---
title: Place de Milan — Building Simulator
tagline: Simulateur d'urbanisme 3D temps réel, Lyon Part-Dieu
summary: Imaginer l'avenir de la place de Milan en posant et en modifiant des bâtiments dans une maquette 3D du quartier, de jour comme de nuit, directement dans le navigateur.
en:
  tagline: Real-time 3D urban planning simulator, Lyon Part-Dieu
  summary: Design the future of Place de Milan by placing and editing buildings in a 3D model of the district, by day or night, right in the browser.
order: 2
featured: true
year: "2026"
role: Modélisation 3D, développement, optimisation
shape: milan
cover: yt-milan.webp
coverAlt: Visuel d'annonce du Place de Milan Building Simulator
video: lpsiViUeups
videoThumb: yt-milan.webp
gallery:
  - { src: milan-nuit-ensemble.webp, alt: "Vue de nuit d'ensemble de la Part-Dieu, façades éclairées et nouvelles tours", caption: "Version 1.12, vue de nuit d'ensemble" }
  - { src: milan-jour-usages.webp, alt: "Vue de jour du quartier avec les nouveaux bâtiments colorés selon leur usage", caption: "Version 1.12, le quartier de jour et la légende des usages" }
  - { src: milan-jour-rue.webp, alt: Vue de jour au niveau de la rue avec piétons, trams et bus, caption: Version 1.12, la vie du quartier en journée }
  - { src: milan-architecte.webp, alt: Planche du mode architecte en élévation, caption: Mode architecte, élévations et vue axonométrique }
stack: [Three.js, Blender, Python, glTF / Meshopt, Open data Grand Lyon]
skills: [3D temps réel, Optimisation des performances, Baking de lumière, Données géographiques (SIG), Conception d'interface]
stats:
  - { value: "2018", label: millésime du bâti 3D Grand Lyon }
  - { value: "Jour / nuit", label: éclairage baké dans Blender }
  - { value: "JSON", label: sauvegarde des projets }
links:
  - { label: Ouvrir le simulateur, href: "https://axelibre.github.io/place_de_milan-preprod/" }
---

## Le projet

La place de Milan, à la Part-Dieu, est un quartier en pleine mutation. Le simulateur permet à chacun de proposer sa vision : poser des bâtiments, les empiler en volumes, les nommer, puis comparer le résultat avec la skyline existante.

## Fonctionnalités

- Construction et édition de bâtiments directement dans la maquette, avec liste des projets et fenêtre d'édition.
- **Mode jour / nuit** avec lampadaires, façades éclairées et vie du quartier : piétons, véhicules, trams et trains animés.
- **Mode architecte** : élévations nord, sud, est, ouest et vue axonométrique, avec étiquettes et export.
- Aménagements (arbres, mobilier), export PNG des propositions et **sauvegarde du projet au format JSON**.

## Les défis techniques

**Une maquette fidèle.** Le contexte urbain vient des *Bâtis 3D 2018* de la Métropole de Lyon et de la trame viaire en open data. J'ai converti ces jeux de données en glTF compressé (Meshopt), puis retiré les bâtiments de l'emprise du projet.

**La fluidité, même de nuit.** Des dizaines de sources lumineuses font vite chuter les FPS. J'ai *baké* l'éclairage dans Blender en matériaux émissifs légers, puis ajouté des niveaux de détail (LOD) pour les piétons et les lampadaires lointains. La nuit reste ainsi fluide.

**Une interface pour tous.** Des aides illustrées, des outils de dessin et une caméra guidée rendent la conception d'un bâtiment accessible sans connaissances en 3D.
