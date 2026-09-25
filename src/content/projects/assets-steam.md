---
title: Assets 3D pour le jeu vidéo
tagline: "Bâtiments et décors pour Cities: Skylines, publiés sur Steam"
summary: "Modélisation dans Blender, textures et niveaux de détail, puis import dans Cities: Skylines (moteur Unity) en suivant à la lettre un pipeline d'import très exigeant."
en:
  tagline: "Buildings and props for Cities: Skylines, published on Steam"
  summary: "Modeled in Blender, textured with levels of detail, then imported into Cities: Skylines (Unity engine) by strictly following a demanding asset pipeline."
order: 6
role: Modélisation, texturing, intégration dans le jeu
shape: butterfly
cover: cs-dome.webp
coverAlt: "Bâtiment en forme de dôme, modélisé dans Blender, affiché dans Cities: Skylines"
slides:
  - { src: cs-rue.webp, alt: "Rue commerçante de nuit avec façades éclairées, dans Cities: Skylines", badge: cities-skylines-logo.webp, badgeAlt: "Cities: Skylines" }
  - { src: cs-galerie.webp, alt: "Galerie commerçante sur plusieurs niveaux avec passants, dans Cities: Skylines", badge: cities-skylines-logo.webp, badgeAlt: "Cities: Skylines" }
  - { src: asset-wireframe.webp, alt: "Maillage filaire du bâtiment en forme de dôme dans Blender" }
  - { src: cs-dome.webp, alt: "Le même bâtiment en forme de dôme importé dans Cities: Skylines", badge: cities-skylines-logo.webp, badgeAlt: "Cities: Skylines" }
  - { src: cs-residence.webp, alt: "Résidence de nuit avec aire de jeux et fenêtres éclairées, dans Cities: Skylines", badge: cities-skylines-logo.webp, badgeAlt: "Cities: Skylines" }
  - { src: asset-crane.webp, alt: "Crâne chromé posé dans l'océan au coucher du soleil, rendu Blender" }
  - { src: asset-neon.webp, alt: "Scène néon nocturne avec une voiture, un robot et un personnage" }
  - { src: asset-ville.webp, alt: "Tours futuristes d'une ville vue en plongée" }
  - { src: asset-salle-tai.webp, alt: "Salle de formation de Villeurbanne modélisée en vue isométrique" }
stack: [Blender, "Cities: Skylines (Unity)", Asset Editor, Textures PNG, LOD]
skills: [Modélisation 3D, Optimisation temps réel, Respect d'un cahier des charges technique, Rigueur et persévérance, Direction artistique]
stats:
  - { value: "65 536", label: sommets maximum par mesh }
  - { value: "6", label: types de textures par asset }
  - { value: "2", label: "meshes par bâtiment (principal + LOD)" }
links:
  - { label: Profil Steam, href: "https://steamcommunity.com/profiles/76561198331605302/" }
---

## Le travail

Des bâtiments et des décors pensés pour le temps réel, modélisés dans Blender puis intégrés dans **Cities: Skylines**, le jeu de construction de villes de Colossal Order, qui tourne sur le moteur **Unity**. Les assets sont partagés avec la communauté sur Steam.

## Une recette à suivre à la lettre

Le jeu n'accepte un asset que s'il respecte scrupuleusement un pipeline d'import, documenté par la communauté sur [cslmodding.info](https://cslmodding.info/). La moindre erreur se paie par des textures corrompues, un modèle invisible ou un import refusé.

- **Deux meshes par bâtiment.** Le modèle principal, sous 65 536 sommets, et un **LOD** très simplifié pour la vue lointaine. Les textures du LOD sont « bakées » depuis le modèle principal.
- **Des UV sous contrainte.** Ceux du LOD doivent tenir dans la tuile 0-1 sans se chevaucher, car le jeu les regroupe dans un atlas unique.
- **Une géométrie propre.** Pivot au centre du terrain et au niveau du sol, rotations et échelles appliquées, export FBX d'un objet unique.
- **Le vertex paint.** Le canal bleu des couleurs de sommets pilote le comportement de la neige sur les cartes d'hiver.
- **Six textures, un nommage strict.** Diffuse, alpha, couleur, illumination, spéculaire et normal map (`_d`, `_a`, `_c`, `_i`, `_s`, `_n`), toutes à la même résolution en puissance de 2, en PNG 8 bits.
- **Des valeurs précises au pixel près.** Diffuse limitée à 140 RGB, fenêtres de nuit encodées entre 128 et 255 autour d'une valeur neutre de 192, spéculaire au-dessus de 205 pour faire apparaître les faux intérieurs, normal map en +X +Y.

## Ce que ça démontre

Suivre une procédure technique exigeante jusqu'au bout, recommencer tant que le résultat n'est pas conforme, et diagnostiquer pourquoi un import échoue. C'est exactement la rigueur et la persévérance qu'attend le support informatique : appliquer une procédure à la lettre, sans raccourci.

Cette exigence se retrouve dans mes projets web 3D, où chaque kilo-octet et chaque image par seconde comptent.
