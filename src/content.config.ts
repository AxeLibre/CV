import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    summary: z.string(),
    en: z.object({ tagline: z.string(), summary: z.string() }),
    order: z.number(),
    featured: z.boolean().default(false),
    year: z.string().optional(),
    role: z.string(),
    shape: z.string(),                       // forme du morph (public/shapes/*.bin)
    cover: z.string(),                       // fichier dans public/media
    coverAlt: z.string(),
    gallery: z.array(z.object({ src: z.string(), alt: z.string(), caption: z.string().optional() })).default([]),
    slides: z.array(z.object({ src: z.string(), alt: z.string(), badge: z.string().optional(), badgeAlt: z.string().optional() })).default([]),   // fondu d'images (remplace l'image fixe)
    logo: z.string().optional(),             // logo du projet (public/media), affiché dans l'en-tête
    video: z.string().optional(),            // identifiant YouTube : remplace l'image en tête de page
    videoThumb: z.string().optional(),       // miniature locale de la vidéo (public/media)
    stack: z.array(z.string()),
    skills: z.array(z.string()),
    stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
  }),
});

export const collections = { projects };
