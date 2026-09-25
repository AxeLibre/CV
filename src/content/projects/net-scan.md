---
title: NET Scan
tagline: Scanner réseau avec cartographie de la topologie
summary: Un outil Python avec interface graphique qui découvre les appareils d'un réseau local, identifie leur fabricant et leurs services, puis dessine la topologie.
en:
  tagline: Network scanner with topology mapping
  summary: A Python GUI tool that discovers devices on a local network, identifies vendors and services, then draws the topology.
order: 3
role: Conception et développement
shape: network
cover: cover-netscan.webp
coverAlt: Globe réseau holographique relié par des arcs de connexion
stack: [Python, Scapy, Tkinter, Threading, PyInstaller]
skills: [Diagnostic réseau, Protocoles ARP / TCP / ICMP, Développement d'outils, Interface graphique, Packaging Windows]
stats:
  - { value: "9", label: versions itératives }
  - { value: "ARP", label: découverte des hôtes }
  - { value: ".exe", label: exécutable autonome }
---

## Pourquoi

En support, la première question est souvent : *qu'y a-t-il sur ce réseau ?* NET Scan y répond en un clic, sans ligne de commande.

## Fonctionnement

- Détection automatique de l'interface, de la passerelle et du masque de sous-réseau.
- **Scan ARP** (Scapy) pour découvrir les hôtes, puis résolution du nom d'hôte et du **fabricant** à partir de l'adresse MAC.
- Test des ports courants (SSH 22, HTTP 80, HTTPS 443, RDP 3389) et estimation du système d'exploitation.
- **Dessin de la topologie** du réseau, avec un menu contextuel pour pinguer un hôte.
- Scan exécuté dans un thread séparé : l'interface reste réactive.
- Empaqueté en exécutable Windows avec PyInstaller.

## Ce que j'en retiens

Neuf versions successives, chacune née d'un besoin réel sur le terrain. C'est ma manière de travailler : un outil simple d'abord, puis des améliorations au fil de l'usage.
