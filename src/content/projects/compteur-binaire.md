---
title: Compteur binaire / hexadécimal
tagline: Visualisation pédagogique animée avec Blender et Python
summary: Un script Python pour Blender qui anime un compteur binaire et hexadécimal, pour rendre visible ce qui se passe dans les bits.
en:
  tagline: Animated teaching visual built with Blender and Python
  summary: A Blender Python script animating a binary and hexadecimal counter, to make bits visible.
order: 5
role: Script, animation, rendu
shape: code
cover: yt-compteur.webp
coverAlt: Compteur affichant 0143 en décimal, 1000 1111 en binaire et 008F en hexadécimal
video: VNFjnPUGfRc
videoThumb: yt-compteur.webp
stack: [Blender, Python (bpy), Animation procédurale]
skills: [Automatisation Blender, Pédagogie visuelle, Numération binaire et hexadécimale]
links:
  - { label: Script sur GitHub, href: "https://github.com/AxeLibre/Compteur-Binaire-Hexa-pour-Blender" }
---

## L'idée

Le binaire et l'hexadécimal sont des bases incontournables en réseau (masques, adresses MAC, IPv6), mais restent abstraits pour beaucoup. Ce projet les met en mouvement.

## La réalisation

Le script génère et anime la scène dans Blender : chaque incrément fait basculer les bits concernés, et l'équivalent hexadécimal s'affiche en regard. Toute l'animation est procédurale : changer la plage ou le rythme ne demande qu'un paramètre.
