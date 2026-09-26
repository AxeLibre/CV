import { BufferAttribute } from 'three';
import type { SolidInfo } from './milan-solid';

// Bibliothèque de formes : positions Int16 (.bin), couleurs RGBA facultatives (.col)
// et métadonnées (public/shapes/manifest.json) : battement d'ailes, inclinaison de vue,
// et formes "composées" (maquette + propositions de bâtiments qui alternent).

export interface VariantInfo {
  id: string;
  label: string;
  source: string;
  buildings: number;
  floors: number;
}

export interface ShapeMeta {
  colors?: boolean;
  tilt?: number;                                    // inclinaison de présentation (rad, autour de X)
  scale?: number;                                   // échelle d'affichage relative
  beat?: boolean;                                   // battement (cœur)
  idle?: number;                                    // amplitude de l'oscillation automatique (1 = normale)
  solid?: SolidInfo;                                // maquette affichée en vrai maillage
  transform?: { center: number[]; scale: number };  // repère normalisé des particules
  cycle?: string[];                                 // forme qui fait défiler d'autres formes (ex. logos)
  hold?: number;                                    // durée d'affichage de chaque forme du cycle (s)
  move?: number;                                    // durée de la transition entre deux formes (s)
  flap?: { center: number[]; axis: number[] };      // battement d'ailes
  compose?: {
    kind?: 'text';                                  // variantes simples (texte d'écran) au lieu d'emprises
    hold?: number;
    move?: number;
    base: string;
    count: number;
    blockCount: number;
    ground: number;
    footColor: number[];
    variants: (VariantInfo & { file: string })[];
  };
}

export interface CycleState {
  pos: BufferAttribute;
  col: BufferAttribute;
  hold: number;          // durée d'affichage (s)
  move: number;          // durée de la transition vers l'état suivant (s)
  built: boolean;
  variant?: VariantInfo;
}

export interface Shape {
  name: string;
  pos: BufferAttribute;
  col: BufferAttribute;
  meta: ShapeMeta;
  cycle?: CycleState[];
}

/** URL d'un fichier de public/shapes, versionnée par build (voir astro.config.mjs). */
export const shapeUrl = (base: string, file: string) => `${base}shapes/${file}?v=${__BUILD_ID__}`;

async function fetchBuf(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fichier introuvable : ${url}`);
  return r.arrayBuffer();
}

/** Sous-échantillonnage régulier (les points sont triés Hilbert : il reste uniforme). */
function stride<T extends Int16Array | Uint8Array>(src: T, item: number, s: number): T {
  if (s === 1) return src;
  const n = Math.floor(src.length / item / s);
  const out = new (src.constructor as { new (n: number): T })(n * item);
  for (let i = 0; i < n; i++) out.set(src.subarray(i * s * item, i * s * item + item), i * item);
  return out;
}

export class ShapeLibrary {
  private shapes = new Map<string, Shape>();
  private pending = new Map<string, Promise<Shape>>();
  private blank?: BufferAttribute;
  readonly manifest: Promise<Record<string, ShapeMeta>>;

  constructor(private base: string, private s: number) {
    this.manifest = fetch(shapeUrl(base, 'manifest.json'))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }

  get(name: string) {
    return this.shapes.get(name);
  }

  /** Couleur "vide" (alpha 0) : le shader utilise alors le dégradé holographique. */
  blankColors(n: number) {
    if (!this.blank || this.blank.count !== n) this.blank = new BufferAttribute(new Uint8Array(n * 4), 4, true);
    return this.blank;
  }

  load(name: string): Promise<Shape> {
    if (this.shapes.has(name)) return Promise.resolve(this.shapes.get(name)!);
    if (!this.pending.has(name)) {
      const p = this.manifest.then((m) => this.build(name, m[name] ?? {})).then((shape) => {
        this.shapes.set(name, shape);
        return shape;
      });
      this.pending.set(name, p);
    }
    return this.pending.get(name)!;
  }

  private async readPair(file: string, colors: boolean) {
    const [pb, cb] = await Promise.all([
      fetchBuf(shapeUrl(this.base, `${file}.bin`)),
      colors ? fetchBuf(shapeUrl(this.base, `${file}.col`)) : Promise.resolve(null),
    ]);
    const pos = stride(new Int16Array(pb), 3, this.s);
    const col = cb ? stride(new Uint8Array(cb), 4, this.s) : null;
    return { pos, col };
  }

  private async build(name: string, meta: ShapeMeta): Promise<Shape> {
    if (meta.compose) return this.buildComposed(name, meta);
    if (meta.cycle) return this.buildCycle(name, meta);
    const { pos, col } = await this.readPair(name, !!meta.colors);
    const n = pos.length / 3;
    return {
      name,
      meta,
      pos: new BufferAttribute(pos, 3, true),
      col: col ? new BufferAttribute(col, 4, true) : this.blankColors(n),
    };
  }

  /** Forme qui fait défiler plusieurs formes complètes (ex. logos de l'accueil). */
  private async buildCycle(name: string, meta: ShapeMeta): Promise<Shape> {
    const members = await Promise.all(meta.cycle!.map((m) => this.load(m)));
    const cycle: CycleState[] = members.map((m) => ({
      pos: m.pos,
      col: m.col,
      hold: meta.hold ?? 2.5,
      move: meta.move ?? 1.8,
      built: false,
    }));
    return { name, meta, pos: cycle[0].pos, col: cycle[0].col, cycle };
  }

  /** Maquette + propositions : [contexte | bâtiments], avec pour chaque proposition
   *  un état "emprise au sol" et un état "construit". */
  private async buildComposed(name: string, meta: ShapeMeta): Promise<Shape> {
    const c = meta.compose!;
    const [base, ...blocks] = await Promise.all([
      this.readPair(c.base, true),
      ...c.variants.map((v) => this.readPair(v.file, true)),
    ]);
    const nc = base.pos.length / 3;
    const ground = Math.round(c.ground * 32767);
    const foot = c.footColor.map((v) => Math.round(v * 255 * 0.9));

    const cycle: CycleState[] = [];
    c.variants.forEach((variant, k) => {
      const blk = blocks[k];
      const nb = blk.pos.length / 3;
      const builtPos = new Int16Array((nc + nb) * 3);
      builtPos.set(base.pos);
      builtPos.set(blk.pos, nc * 3);
      const builtCol = new Uint8Array((nc + nb) * 4);
      builtCol.set(base.col!);
      builtCol.set(blk.col!, nc * 4);

      const footPos = builtPos.slice();
      const footCol = builtCol.slice();
      for (let i = nc; i < nc + nb; i++) {
        footPos[i * 3 + 1] = ground;
        footCol.set([foot[0], foot[1], foot[2], 255], i * 4);
      }
      const F = { pos: new BufferAttribute(footPos, 3, true), col: new BufferAttribute(footCol, 4, true) };
      const B = { pos: new BufferAttribute(builtPos, 3, true), col: new BufferAttribute(builtCol, 4, true) };
      if (c.kind === 'text') {
        // texte d'écran : les mots s'enchaînent directement (l'écriture est gérée par le shader)
        cycle.push({ ...B, hold: c.hold ?? 2.8, move: c.move ?? 1.6, built: false, variant });
        return;
      }
      // emprise → élévation → maintien → descente → glissement vers la proposition suivante
      cycle.push({ ...F, hold: 0.4, move: 1.7, built: false, variant });
      cycle.push({ ...B, hold: 4.6, move: 1.3, built: true, variant });
      cycle.push({ ...F, hold: 0.2, move: 1.1, built: false, variant });
    });
    return { name, meta, pos: cycle[0].pos, col: cycle[0].col, cycle };
  }
}
