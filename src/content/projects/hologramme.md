---
title: Hologramme de particules
tagline: Le moteur de morphing de ce site, de Blender au GPU
summary: 32 768 particules qui passent d'un modèle 3D à l'autre au fil du scroll et réagissent à la souris, alimentées par un addon Blender maison.
en:
  tagline: This site's morphing engine, from Blender to the GPU
  summary: 32,768 particles morphing between 3D models as you scroll and reacting to the pointer, fed by a custom Blender add-on.
order: 4
year: "2026"
role: R&D 3D, outils, développement
shape: head
cover: site-accueil.webp
coverAlt: "Page d'accueil du site : un ordinateur portable en particules affiche WELCOME"
slides:
  - { src: site-accueil.webp, alt: "Accueil : l'ordinateur en particules écrit BIENVENUE puis WELCOME" }
  - { src: site-logos.webp, alt: "Compétences : les logos des systèmes d'exploitation se transforment l'un en l'autre" }
  - { src: site-ville.webp, alt: "Projets : la maquette de nuit de Place de Milan et ses propositions de tours" }
  - { src: site-papillon.webp, alt: "3D et Blender : un papillon en particules qui bat des ailes" }
  - { src: site-coeur.webp, alt: "Contact : un cœur en particules qui bat derrière le titre" }
stack: [Three.js, GLSL, Blender + Python, Astro, GSAP]
skills: [Shaders GPU, Pipeline d'assets 3D, Optimisation des données, Animation d'interface, Accessibilité]
stats:
  - { value: "×32", label: plus de particules que la v1 }
  - { value: "11 Mo → 196 Ko", label: par modèle }
  - { value: "1", label: appel de rendu }
links:
  - { label: Code source sur GitHub, href: "https://github.com/AxeLibre/CV" }
---

## La première version

Mon premier site CV faisait déjà morpher 1 000 cubes au scroll : ordinateur, routeur, symbole de code, cœur. Chaque cube était un objet 3D distinct, et chaque forme était calculée à la main en trigonométrie. C'était joli, mais lourd et peu précis.

## La refonte

**Un addon Blender.** Il tire des points uniformément sur la *surface* du modèle, pondérés par l'aire des faces : les silhouettes restent nettes quelle que soit la topologie.

**Des données compactes.** Les points sont normalisés, triés le long d'une courbe de Hilbert 3D puis stockés en entiers 16 bits. Une tête passe de 11 Mo de JSON à 196 Ko.

**Un morph cohérent.** Grâce au tri de Hilbert, deux formes ont leurs points voisins au même index : la matière glisse naturellement d'un modèle à l'autre au lieu de s'éparpiller. Le même tri permet un sous-échantillonnage uniforme pour les mobiles.

**Tout sur le GPU.** Un seul appel de rendu, des positions permutées sans nouveau transfert, avec turbulence, balayage holographique et réaction au pointeur calculés dans le vertex shader.

**Couleurs réelles et variantes.** Une forme peut porter ses propres couleurs. La maquette de Place de Milan reprend l'éclairage de nuit du simulateur : même grille de fenêtres, même hachage, même proportion de baies allumées. Les propositions de bâtiments sont reconstruites depuis les sauvegardes JSON du simulateur, s'élèvent depuis leur emprise au sol puis cèdent la place à la suivante. Le papillon, lui, bat des ailes grâce à une rotation calculée dans le shader.

**Pensé pour tous.** Scroll vertical naturel sur mobile, qualité adaptative, respect de `prefers-reduced-motion`, et contenu lisible même sans WebGL.
