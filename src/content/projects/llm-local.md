---
title: Une IA open source en local
tagline: "Gemma 4 et Hermes Agent dans un conteneur Docker"
summary: "Faire tourner un grand modèle de langage open source sur mon propre PC, sans cloud : Gemma 4, piloté par l'agent Hermes, dans un conteneur Docker. Un projet exigeant qui m'a fait passer par Docker, Linux, le réseau et le diagnostic de performances."
en:
  tagline: "Gemma 4 and Hermes Agent in a Docker container"
  summary: "Running an open-source large language model on my own PC, without the cloud: Gemma 4, driven by the Hermes agent, inside a Docker container. A demanding project covering Docker, Linux, networking and performance troubleshooting."
order: 3
year: "2026"
role: Installation, configuration, diagnostic
shape: network
cover: hermes-dashboard.webp
coverAlt: "Tableau de bord web de Hermes Agent, page Système (capture de la documentation officielle)"
gallery:
  - { src: hermes-tui.webp, alt: "Interface terminal de Hermes Agent : orchestrateur de sessions", caption: "L'interface terminal (TUI) de Hermes Agent. Captures : documentation officielle, Nous Research" }
stack: [Docker, Docker Compose, "WSL 2 (Linux)", Hermes Agent, Gemma 4, API REST]
skills: [Conteneurisation (Docker), Linux en ligne de commande, "Réseau : ports, API, passerelle", Gestion des ressources (RAM, CPU), Diagnostic par les journaux, Sécurité des secrets, Veille technologique IA]
stats:
  - { value: "20 min", label: "pour un premier « bonjour »" }
  - { value: "4 Go · 2 cœurs", label: alloués au conteneur }
  - { value: "2", label: "services exposés : API et tableau de bord" }
links:
  - { label: Hermes Agent sur GitHub, href: "https://github.com/NousResearch/hermes-agent" }
---

## Le défi

Faire tourner une intelligence artificielle **chez moi**, sur mon propre matériel, sans passer par un service en ligne. J'ai choisi **Gemma 4**, la famille de modèles ouverts de Google (la « petite sœur » de Gemini), pilotée par **Hermes Agent**, un agent open source de Nous Research, le tout installé dans un **conteneur Docker**.

## L'architecture

Sous Windows, Docker Desktop s'appuie sur **WSL 2**, un vrai noyau Linux. Le conteneur est décrit dans un fichier **Docker Compose** :

- l'image officielle `nousresearch/hermes-agent`, lancée en mode passerelle ;
- deux ports exposés : **8642** pour l'API de la passerelle, **9119** pour le tableau de bord web ;
- un **volume persistant** qui monte le dossier de configuration dans le conteneur : réglages, mémoire et historique survivent aux redémarrages ;
- des **limites de ressources** (4 Go de mémoire, 2 cœurs de processeur) et un redémarrage automatique ;
- les clés et secrets dans un fichier `.env`, séparé de la configuration et jamais partagé.

## Conteneur ou machine virtuelle ?

C'est l'une des choses que ce projet m'a le mieux fait comprendre :

- une **machine virtuelle** émule un ordinateur complet, avec son propre système d'exploitation : isolation forte, mais lourde à démarrer et gourmande ;
- un **conteneur** partage le noyau de la machine hôte et n'embarque que l'application et ses dépendances : il démarre en quelques secondes, se reproduit à l'identique partout et se décrit dans un simple fichier texte.

## Vingt minutes pour un « bonjour »

Mon premier message a mis une vingtaine de minutes à recevoir sa réponse. Plutôt que d'abandonner, j'ai cherché à comprendre : sur un matériel ancien, sans carte graphique assez puissante pour accueillir le modèle, les calculs se font sur le processeur, dans la limite de la mémoire et des cœurs alloués au conteneur. Les journaux de l'agent et du conteneur m'ont servi à suivre le démarrage et à repérer les goulets d'étranglement.

Les pistes identifiées pour aller plus loin : un modèle plus léger (quantifié), davantage de ressources allouées au conteneur, ou l'accès au GPU depuis Docker.

## Ce que ça démontre

- **Docker** et **Linux en ligne de commande** : des outils désormais courants en entreprise, y compris côté support et infrastructure.
- **Réseau** : ports, API, passerelle, accès au tableau de bord depuis le navigateur.
- **Diagnostic** : lire des journaux, relier une lenteur à ses causes matérielles, proposer des solutions.
- **Sécurité** : séparer les secrets de la configuration.
- **Veille** : comprendre l'écosystème de l'IA open source (modèles ouverts, agents, outils) et savoir l'installer soi-même.
