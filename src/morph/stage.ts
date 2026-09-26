import { MorphEngine, type Placement } from './engine';

// Relie le DOM au moteur : chaque <section data-shape="…" data-model="…"> est une étape.
// Le scroll ne fait jamais tourner la scène : il fait avancer le morph et
// déplace le modèle verticalement (parallaxe) pendant que la poussière défile.

type Mode = 'hero' | 'right' | 'left' | 'center' | 'dim';

const DESKTOP: Record<Mode, Placement> = {
  hero: { x: 0.23, y: -0.02, size: 0.6, opacity: 1 },
  right: { x: 0.26, y: 0, size: 0.56, opacity: 1 },
  left: { x: -0.26, y: 0, size: 0.56, opacity: 1 },
  center: { x: 0, y: 0, size: 0.62, opacity: 0.5 },
  dim: { x: 0.28, y: 0, size: 0.62, opacity: 0.16 },
};
const MOBILE: Record<Mode, Placement> = {
  hero: { x: 0, y: 0.26, size: 0.3, opacity: 1 },
  right: { x: 0, y: 0.23, size: 0.34, opacity: 0.85 },
  left: { x: 0, y: 0.23, size: 0.34, opacity: 0.85 },
  center: { x: 0, y: 0.08, size: 0.46, opacity: 0.4 },
  dim: { x: 0, y: 0.1, size: 0.5, opacity: 0.12 },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function initStage() {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const sections = [...document.querySelectorAll<HTMLElement>('[data-shape]')];
  if (!canvas || !sections.length) return;
  if (!hasWebGL()) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 899px)');
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;

  const engine = new MorphEngine({
    canvas,
    base: import.meta.env.BASE_URL.replace(/\/?$/, '/'),
    stride: narrow.matches || lowEnd ? 2 : 1,
    reducedMotion: reduced,
  });

  const names = sections.map((s) => s.dataset.shape!);
  engine.setSequence(names);

  Promise.all([engine.load('cube'), engine.load(names[0])])
    .then(() => {
      update();
      engine.start();
      canvas.classList.add('is-ready');
      // le reste en arrière-plan, dans l'ordre du parcours
      [...new Set(names)].forEach((n) => engine.load(n).catch(console.warn));
    })
    .catch((err) => {
      console.warn(err);
      document.documentElement.classList.add('no-webgl');
    });

  const placementFor = (el: HTMLElement): Placement => {
    const mode = (el.dataset.model as Mode) || 'right';
    const table = narrow.matches ? MOBILE : DESKTOP;
    const p = { ...(table[mode] ?? table.right) };
    // la forme ne doit pas dépasser la zone qui lui est réservée
    // (toute la largeur sur mobile, la moitié droite sur desktop)
    const aspect = window.innerWidth / window.innerHeight;
    const side = narrow.matches ? 0.74 : mode === 'center' ? 0.86 : 0.4;
    p.size = Math.min(p.size, side * aspect);
    return p;
  };

  function update() {
    const vh = window.innerHeight;
    const vc = vh * 0.5;
    const zone = vh * 0.35;
    const rects = sections.map((s) => s.getBoundingClientRect());

    // étape courante : dernière section dont le haut a atteint la zone de transition
    let j = 0;
    for (let k = 0; k < rects.length; k++) if (rects[k].top <= vc + zone) j = k;
    let t = 1;
    if (j > 0) t = clamp01((vc + zone - rects[j].top) / (2 * zone));
    engine.setProgress(j > 0 ? j - 1 + t : 0);

    // placement interpolé entre l'étape précédente et la courante
    const a = placementFor(sections[Math.max(j - 1, 0)]);
    const b = placementFor(sections[j]);
    const st = smooth(t);
    const place: Placement = {
      x: lerp(a.x, b.x, st),
      y: lerp(a.y, b.y, st),
      size: lerp(a.size, b.size, st),
      opacity: lerp(a.opacity, b.opacity, st),
    };

    // dérive verticale : le modèle remonte doucement à mesure qu'on lit la section
    const r = rects[j];
    const local = clamp01((vc - r.top) / Math.max(r.height, 1));
    if (!reduced) place.y += (local - 0.5) * 0.1;
    engine.setPlacement(place);
    engine.setScroll(window.scrollY);

    engine.setNarrow(narrow.matches);
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  narrow.addEventListener('change', onScroll);
}
