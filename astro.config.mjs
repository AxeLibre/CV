// @ts-check
import { defineConfig } from 'astro/config';

// Déploiement GitHub Pages :
//  - dépôt "AxeLibre/CV"            → site: https://axelibre.github.io, base: '/CV'
//  - dépôt "AxeLibre/axelibre.github.io" ou domaine perso → base: '/'
// Les deux valeurs peuvent être surchargées par les variables SITE / BASE.
export default defineConfig({
  site: process.env.SITE ?? 'https://axelibre.github.io',
  base: process.env.BASE ?? '/CV',
  trailingSlash: 'ignore',
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'auto' },
});
