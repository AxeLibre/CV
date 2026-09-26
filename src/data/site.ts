// Contenus de la page d'accueil, en français et en anglais.
// Les études de cas (src/content/projects) sont rédigées en français.

export type Lang = 'fr' | 'en';

export const profile = {
  name: 'Axel Lasalvia',
  email: ['axelasalvia', 'gmail.com'] as const,   // assemblé côté client (anti-robots)
  github: 'https://github.com/AxeLibre',
  steam: 'https://steamcommunity.com/profiles/76561198331605302/',
  cv: 'cv/CV_Axel_LASALVIA_2026.pdf',
};

interface Chapter {
  id: string;
  shape: string;
  label: string;
  title: string;
  text: string;
  skills: string[];
  proof: string[];          // identifiants de projets (src/content/projects/*.md)
}

interface Step {
  when: string;
  title: string;
  place: string;
  text: string;
}

const fr = {
  meta: {
    title: 'Axel Lasalvia · Technicien IT & créateur 3D',
    description:
      "Technicien d'assistance informatique à Lyon, passionné de 3D et développeur à ses heures : support, réseau, Blender, Three.js et applications web.",
  },
  nav: { skills: 'Compétences', projects: 'Projets', path: 'Parcours', contact: 'Contact', cv: 'CV', menu: 'Menu', close: 'Fermer' },
  hero: {
    eyebrow: "Technicien d'assistance informatique · Lyon",
    lead: "L'IT est mon métier, la 3D ma passion, le code mon terrain de jeu. Je dépanne, je déploie, je modélise et je construis des expériences web interactives.",
    primary: 'Voir les projets',
    secondary: 'Télécharger le CV',
    scroll: 'Défiler',
    hint: 'Survolez le modèle',
    hintTouch: 'Touchez le modèle',
  },
  proofLabel: 'Vu dans',
  chapters: [
    {
      id: 'support',
      shape: 'os',
      label: 'Support & matériel',
      title: 'Diagnostiquer, réparer, remettre en service.',
      text: "Formé au métier de Technicien d'Assistance Informatique après quinze ans de relation client, je sais résoudre une panne et rassurer l'utilisateur qui la subit.",
      skills: [
        'Montage et installation de postes',
        'Diagnostic et réparation N1 / N2',
        'Gestion des incidents et suivi de parc',
        'Administration Active Directory',
        'Outils collaboratifs et bureautiques',
        'Accompagnement des utilisateurs',
      ],
      proof: ['llm-local'],
    },
    {
      id: 'reseau',
      shape: 'network',
      label: 'Réseau & sécurité',
      title: 'Des réseaux qui tiennent, des données protégées.',
      text: 'Déploiement de réseaux locaux, adressage IP, configuration des routeurs et switchs, sécurisation des postes et des accès. Certifications Cisco Networking Academy.',
      skills: [
        'Déploiement LAN et adressage IP',
        'Routeurs et switchs',
        'Sécurisation des postes et des données',
        'Sauvegardes',
        'Intervention sur réseau sécurisé',
        'Diagnostic : ARP, ports, ICMP',
      ],
      proof: ['llm-local', 'compteur-binaire'],
    },
    {
      id: '3d',
      shape: 'butterfly',
      label: '3D & Blender',
      title: 'Modéliser, optimiser, donner vie.',
      text: "Blender est mon atelier : modélisation, lumière bakée, optimisation low-poly pour le temps réel, scripts Python et assets publiés sur Steam.",
      skills: [
        'Modélisation et mise en scène',
        'Baking de lumière, matériaux émissifs',
        'Optimisation temps réel (LOD, low-poly)',
        'Automatisation Blender en Python',
        'Assets de jeu vidéo',
        'Visuels publicitaires pour les réseaux sociaux',
      ],
      proof: ['place-de-milan', 'assets-steam', 'hologramme'],
    },
    {
      id: 'code',
      shape: 'code',
      label: 'Code & web',
      title: "Automatiser ce qui peut l'être, construire ce qui manque.",
      text: "Développeur à mes heures perdues : des scripts qui font gagner du temps jusqu'aux applications web complètes et à la 3D temps réel dans le navigateur.",
      skills: [
        'Python : outils, interfaces, réseau',
        'JavaScript et Three.js',
        'Applications web et API',
        'VBA / Excel',
        'Batch et automatisation Windows',
        'Données ouvertes et SIG',
      ],
      proof: ['bigoo', 'place-de-milan', 'hologramme'],
    },
  ] as Chapter[],
  projects: {
    label: 'Projets',
    title: 'Des outils du quotidien aux expériences 3D.',
    text: 'Chaque projet raconte les compétences qu’il a demandées. Cliquez pour lire l’étude de cas.',
    more: 'Lire l’étude de cas',
    note: '',
  },
  path: {
    label: 'Parcours',
    title: 'Quinze ans de relation client, une vocation devenue métier.',
    steps: [
      {
        when: '2025 – 2026',
        title: "Technicien d'Assistance Informatique",
        place: 'Arkesys · Villeurbanne',
        text: 'Formation professionnelle de mars à décembre 2025, examen du titre en février 2026. Support, réseau, Active Directory, sécurité.',
      },
      {
        when: '2018 – 2024',
        title: 'Vendeur, responsable stocks et logistique',
        place: 'Superdry · Lyon',
        text: "Déploiement d'outils informatiques au service de la logistique, formation des équipes aux outils et procédures, résolution des incidents du quotidien.",
      },
      {
        when: '2009 – 2017',
        title: 'Vendeur polyvalent',
        place: 'G-Star Raw Denim · Lyon',
        text: 'Conseil client, événements promotionnels, merchandising et formation des nouveaux collaborateurs.',
      },
      {
        when: '2005 – 2006',
        title: 'BEP Vente Action Marchande',
        place: 'Institut Carrel · Lyon',
        text: "Complété par le diplôme d'étalagiste et de marchandisage visuel : le goût de la mise en scène ne date pas d'hier.",
      },
    ] as Step[],
    qualities: 'Rapide à comprendre, coopératif, persévérant, empathique.',
  },
  contact: {
    label: 'Contact',
    title: 'Travaillons ensemble.',
    text: 'Un poste en support IT, une mission 3D ou un projet web ? Écrivez-moi, je réponds vite.',
    email: 'M’écrire',
    copy: 'Copier l’adresse',
    copied: 'Adresse copiée',
    cv: 'Télécharger le CV',
  },
  footer: {
    made: 'Conçu et développé par Axel Lasalvia · Three.js, Astro, GSAP · Modèles Blender',
    top: 'Haut de page',
  },
  project: {
    back: 'Tous les projets',
    role: 'Rôle',
    year: 'Année',
    stack: 'Outils',
    skills: 'Compétences mobilisées',
    gallery: 'Galerie',
    video: 'Vidéo',
    videoLoad: 'Lire la vidéo (YouTube)',
    next: 'Projet suivant',
  },
};

const en: typeof fr = {
  meta: {
    title: 'Axel Lasalvia · IT Technician & 3D Creator',
    description:
      'IT support technician in Lyon, France, passionate about 3D and a hobbyist developer: support, networking, Blender, Three.js and web apps.',
  },
  nav: { skills: 'Skills', projects: 'Projects', path: 'Background', contact: 'Contact', cv: 'Resume', menu: 'Menu', close: 'Close' },
  hero: {
    eyebrow: 'IT support technician · Lyon, France',
    lead: 'IT is my job, 3D my passion, code my playground. I troubleshoot, deploy, model and build interactive web experiences.',
    primary: 'See projects',
    secondary: 'Download resume (FR)',
    scroll: 'Scroll',
    hint: 'Hover the model',
    hintTouch: 'Touch the model',
  },
  proofLabel: 'Seen in',
  chapters: [
    {
      ...fr.chapters[0],
      label: 'Support & hardware',
      title: 'Diagnose, repair, get it running again.',
      text: 'Trained as an IT support technician after fifteen years in customer-facing roles, I know how to fix an issue and reassure the person facing it.',
      skills: ['PC assembly and setup', 'Level 1 / 2 troubleshooting and repair', 'Incident and asset management', 'Active Directory administration', 'Collaboration and office tools', 'User support'],
    },
    {
      ...fr.chapters[1],
      label: 'Network & security',
      title: 'Networks that hold, data that stays safe.',
      text: 'LAN deployment, IP addressing, router and switch configuration, endpoint and access security. Cisco Networking Academy certifications.',
      skills: ['LAN deployment and IP addressing', 'Routers and switches', 'Endpoint and data security', 'Backups', 'Secure network operations', 'Diagnostics: ARP, ports, ICMP'],
    },
    {
      ...fr.chapters[2],
      label: '3D & Blender',
      title: 'Model, optimize, bring to life.',
      text: 'Blender is my workshop: modeling, baked lighting, low-poly optimization for real time, Python scripting and assets published on Steam.',
      skills: ['Modeling and scene building', 'Light baking, emissive materials', 'Real-time optimization (LOD, low-poly)', 'Blender automation with Python', 'Game assets', 'Social media ad visuals'],
    },
    {
      ...fr.chapters[3],
      label: 'Code & web',
      title: 'Automate what can be, build what is missing.',
      text: 'A developer in my spare time: from time-saving scripts to full web applications and real-time 3D in the browser.',
      skills: ['Python: tools, GUIs, networking', 'JavaScript and Three.js', 'Web apps and APIs', 'VBA / Excel', 'Batch and Windows automation', 'Open data and GIS'],
    },
  ],
  projects: {
    label: 'Projects',
    title: 'From everyday tools to 3D experiences.',
    text: 'Each project tells the skills it required. Click to read the case study.',
    more: 'Read the case study',
    note: 'Case studies are written in French.',
  },
  path: {
    label: 'Background',
    title: 'Fifteen years of customer service, a calling turned career.',
    steps: [
      { when: '2025 – 2026', title: 'IT Support Technician (French national certification)', place: 'Arkesys · Villeurbanne', text: 'Vocational training from March to December 2025, final exam in February 2026. Support, networking, Active Directory, security.' },
      { when: '2018 – 2024', title: 'Sales associate, stock and logistics manager', place: 'Superdry · Lyon', text: 'Rolled out IT tools for logistics, trained staff on tools and procedures, handled day-to-day IT issues.' },
      { when: '2009 – 2017', title: 'Sales associate', place: 'G-Star Raw Denim · Lyon', text: 'Customer advice, promotional events, visual merchandising and onboarding of new staff.' },
      { when: '2005 – 2006', title: 'Vocational diploma in sales', place: 'Institut Carrel · Lyon', text: 'Plus a window-dressing and visual merchandising diploma: a taste for staging things goes back a long way.' },
    ],
    qualities: 'Quick learner, cooperative, persistent, empathetic.',
  },
  contact: {
    label: 'Contact',
    title: "Let's work together.",
    text: 'An IT support role, a 3D assignment or a web project? Drop me a line, I reply quickly.',
    email: 'Email me',
    copy: 'Copy address',
    copied: 'Address copied',
    cv: 'Download resume (FR)',
  },
  footer: {
    made: 'Designed and built by Axel Lasalvia · Three.js, Astro, GSAP · Blender models',
    top: 'Back to top',
  },
  project: fr.project,
};

export const t = { fr, en };
