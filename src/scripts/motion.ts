import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const root = document.documentElement;
if (reduced) root.classList.add('no-motion');

// ------------------------------------------------------------ scroll fluide
// Lenis uniquement à la souris : sur mobile le scroll natif reste le plus naturel.
let lenis: Lenis | null = null;
if (!reduced && finePointer) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

document.querySelectorAll<HTMLAnchorElement>('a[href*="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const url = new URL(a.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const target = document.querySelector(url.hash);
    if (!target) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(target as HTMLElement, { offset: 0, duration: 1.6 });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    history.replaceState(null, '', url.hash);
  });
});

// ------------------------------------------------------------ navigation
const nav = document.querySelector<HTMLElement>('.nav');
let lastY = window.scrollY;
const onScroll = () => {
  const y = window.scrollY;
  nav?.classList.toggle('is-scrolled', y > 24);
  if (!root.classList.contains('menu-open')) nav?.classList.toggle('is-hidden', y > lastY && y > 400);
  lastY = y;
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// lien actif selon la section visible
const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.nav__links a[href*="#"]')];
navLinks.forEach((link) => {
  const id = new URL(link.href).hash;
  const el = id && document.querySelector(id);
  if (!el) return;
  ScrollTrigger.create({
    trigger: el,
    start: 'top 50%',
    end: 'bottom 50%',
    onToggle: (self) => link.setAttribute('aria-current', String(self.isActive)),
  });
});

// menu mobile
const burger = document.querySelector<HTMLButtonElement>('.burger');
function closeMenu() {
  root.classList.remove('menu-open');
  burger?.setAttribute('aria-expanded', 'false');
  lenis?.start();
}
burger?.addEventListener('click', () => {
  const open = !root.classList.contains('menu-open');
  root.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', String(open));
  if (open) lenis?.stop();
  else lenis?.start();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

// ------------------------------------------------------------ révélations
function heroIntro() {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;
  const title = hero.querySelector('[data-split-chars]');
  const tl = gsap.timeline({ delay: 0.25 });
  const lines = hero.querySelectorAll('.line__in');
  if (!reduced && lines.length) {
    // lignes masquées : garde le dégradé intact (un découpage par lettre le casserait)
    tl.from(lines, { yPercent: 115, duration: 1.4, ease: 'expo.out', stagger: 0.12 });
  } else if (title && !reduced) {
    const split = new SplitText(title, { type: 'words,chars', mask: 'chars' });
    tl.from(split.chars, { yPercent: 110, duration: 1.3, ease: 'expo.out', stagger: 0.035 });
  }
  const items = hero.querySelectorAll('[data-reveal]');
  if (reduced) gsap.set(items, { opacity: 1, y: 0 });
  else tl.to(items, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.35);
}

function reveals() {
  if (reduced) return;
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    gsap.from(split.lines, {
      yPercent: 105,
      duration: 1.2,
      ease: 'expo.out',
      stagger: 0.09,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  // les éléments hors hero apparaissent par groupes
  ScrollTrigger.batch('main [data-reveal]:not([data-hero] [data-reveal])', {
    start: 'top 90%',
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.07, overwrite: true }),
  });

  const fill = document.querySelector('.timeline__fill');
  if (fill)
    gsap.to(fill, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 60%', scrub: true },
    });
}

document.fonts.ready.then(() => {
  heroIntro();
  reveals();
  ScrollTrigger.refresh();
});

// ------------------------------------------------------------ cartes & curseur
if (finePointer) {
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  // boutons magnétiques
  if (!reduced)
    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.28);
        yTo((e.clientY - r.top - r.height / 2) * 0.35);
      });
      el.addEventListener('pointerleave', () => {
        xTo(0);
        yTo(0);
      });
    });

  const cursor = document.querySelector<HTMLElement>('.cursor');
  if (cursor && !reduced) {
    const cx = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
    const cy = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });
    window.addEventListener('pointermove', (e) => {
      cursor.classList.add('is-on');
      cx(e.clientX);
      cy(e.clientY);
      const target = e.target as Element | null;
      cursor.classList.toggle('is-link', !!target?.closest?.('a, button'));
    });
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
  }
}

// ------------------------------------------------------------ e-mail
// L'adresse n'est pas écrite en clair dans le HTML (anti-robots) : on l'assemble ici.
document.querySelectorAll<HTMLElement>('[data-mail]').forEach((el) => {
  const [user, domain] = (el.dataset.mail || '').split('|');
  const address = `${user}@${domain}`;
  if (el instanceof HTMLAnchorElement) el.href = `mailto:${address}`;
  if (el.dataset.mailText !== undefined) el.textContent = address;
});
document.querySelectorAll<HTMLButtonElement>('[data-copy-mail]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const [user, domain] = (btn.dataset.copyMail || '').split('|');
    try {
      await navigator.clipboard.writeText(`${user}@${domain}`);
      const label = btn.querySelector('span');
      if (label) {
        const prev = label.textContent;
        label.textContent = btn.dataset.done || '✓';
        setTimeout(() => (label.textContent = prev), 2000);
      }
    } catch {
      /* presse-papiers indisponible : on ne fait rien */
    }
  });
});

// ------------------------------------------------------------ fondus d'images
// Chaque diaporama avance toutes les 4,5 s, uniquement quand il est à l'écran.
document.querySelectorAll<HTMLElement>('[data-slides]').forEach((box) => {
  const items = [...box.querySelectorAll<HTMLElement>('.slides__item')];
  const dots = [...box.querySelectorAll<HTMLElement>('.slides__dots span')];
  if (items.length < 2 || reduced) return;
  const lazy = (el: HTMLElement) => el.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
  let i = 0;
  let timer = 0;
  const show = (k: number) => {
    items[i].classList.remove('is-active');
    dots[i]?.classList.remove('is-active');
    i = k % items.length;
    lazy(items[i]);
    lazy(items[(i + 1) % items.length]);   // précharge la suivante
    items[i].classList.add('is-active');
    dots[i]?.classList.add('is-active');
  };
  new IntersectionObserver(([entry]) => {
    clearInterval(timer);
    if (entry.isIntersecting) timer = window.setInterval(() => show(i + 1), 4500);
  }).observe(box);
});

// ------------------------------------------------------------ vidéo YouTube (chargée au clic)
document.querySelectorAll<HTMLButtonElement>('[data-youtube]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${btn.dataset.youtube}?autoplay=1&rel=0`;
    iframe.title = btn.getAttribute('aria-label') || 'Vidéo';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    btn.replaceWith(iframe);
  });
});
