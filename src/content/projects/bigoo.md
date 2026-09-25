---
title: Bigoo
tagline: Application web de gestion locative pour SCI
summary: Loyers, quittances, baux, comptabilité et échéances fiscales réunis dans une seule application en ligne, avec une démo publique prête à l'emploi.
en:
  tagline: Property management web app for real-estate companies (SCI)
  summary: Rents, receipts, leases, accounting and tax deadlines in one online application, with a public demo ready to try.
order: 1
featured: true
year: "2026"
role: Conception, développement, déploiement
shape: house
logo: bigoo-logo.webp
cover: bigoo-compta.webp
coverAlt: Page Comptabilité Bailleur de Bigoo avec le graphique des recettes sur 12 mois
gallery:
  - { src: bigoo-dashboard.webp, alt: Tableau de bord de Bigoo avec taux d'occupation, loyers et échéances fiscales, caption: Tableau de bord de la démo (SCI fictive) }
stack: [Application web (SPA), API REST, SQLite, Authentification, Génération de documents, Hébergement & nom de domaine]
skills: [Analyse du besoin métier, Développement web full-stack, Modélisation de données, Automatisation documentaire, Mise en production]
stats:
  - { value: "16", label: modules métier }
  - { value: "5 ans", label: d'historique dans la démo }
  - { value: "0", label: inscription pour tester }
links:
  - { label: Essayer la démo, href: "https://bigoo.fr" }
---

## Le besoin

Gérer une SCI, c'est jongler entre les loyers, les quittances, les baux, les assurances des locataires, les travaux, les sinistres et un calendrier fiscal qui ne pardonne pas (taxe foncière, CFE, déclaration des revenus fonciers). Ces informations vivaient dans des tableurs et des documents Word dispersés.

## D'un script à un logiciel

Bigoo est l'aboutissement d'une démarche progressive :

1. **VBA** : une macro de publipostage Word/Excel générait et exportait une quittance PDF par locataire.
2. **Web** : Bigoo réunit toute la gestion dans une application en ligne multi-SCI, accessible partout.

## Ce que fait l'application

- **Tableau de bord** : taux d'occupation, loyers en attente, prochaines échéances fiscales, suivi mensuel des loyers par bien, avec les événements (travaux, visites, états des lieux, sinistres, fins de contrat d'assurance).
- **Bailleur** : profil, comptabilité, rapport pour l'expert-comptable.
- **Biens** : inventaire, comptabilité par bien, sinistres, travaux.
- **Locataires** : profils, paiements, comptabilité, assurances habitation, baux, appels de loyer et quittances.
- **Archives et historique** complet des opérations.

## Une démo sans friction

Le bouton *Essayer la démo* ouvre deux SCI fictives avec cinq ans d'historique. Les données sont réinitialisées à chaque chargement : un recruteur ou un curieux peut tout manipuler sans créer de compte ni rien casser.
