import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Timer,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { dustFragment, dustVertex, morphFragment, morphVertex } from './shaders';
import { ShapeLibrary, type Shape, type VariantInfo } from './shapes';
import type { MilanSolid } from './milan-solid';

export interface Placement {
  x: number;       // en fraction de la largeur visible (-0.5 … 0.5)
  y: number;       // en fraction de la hauteur visible
  size: number;    // taille de la forme en fraction de la hauteur visible
  opacity: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  base: string;          // import.meta.env.BASE_URL
  stride: number;        // 1 = 32k points, 2 = 16k (mobile)…
  reducedMotion: boolean;
}

const FOV = 35;
const TRAIL = 40;            // points de la traînée (doit correspondre au shader)
const TRAIL_STEP = 0.035;    // intervalle entre deux échantillons (s)
const CAM_Z = 6;
const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export class MorphEngine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  private group = new Group();
  private geometry = new BufferGeometry();
  private material: ShaderMaterial;
  private dustMaterial: ShaderMaterial;
  private points: Points;
  private clock = new Timer();
  private elapsed = 0;

  private lib: ShapeLibrary;
  private sequence: string[] = [];
  private from?: Shape;
  private to?: Shape;
  private tilt0 = 0;
  private scale0 = 1;
  private idle0 = 1;

  // alternance des propositions (formes composées)
  private cycleShape?: Shape;
  private cycleIndex = 0;
  private cycleClock = 0;
  private cycleMoving = false;
  private cycleActive = false;

  // maquette en vrai maillage (Place de Milan) : les particules ne servent qu'aux transitions
  private solid?: MilanSolid;
  private solidLoading = false;
  private presence = 0;
  private bldFade = 0;
  private reveal = 0;            // onde radiale qui fait apparaître le reste de la ville
  private revealClock = 0;
  private settled = 0;
  private narrow = false;
  private drawSize = new Vector2();
  private segment = -1;
  private count = 0;

  // état animé
  private progress = 0;
  private targetProgress = 0;
  private flow = 1;
  private place: Placement = { x: 0.22, y: 0, size: 0.62, opacity: 1 };
  private targetPlace: Placement = { ...this.place };
  private intro = 0;               // 0 → 1 : assemblage initial depuis le cube
  private introDone = false;
  private fade = 0;

  // pointeur
  private ndc = new Vector2(9, 9);
  private tilt = new Vector2();
  private hadPointer = false;
  // traînée du pointeur à l'écran (du plus récent au plus ancien) et pointeur lissé
  private trailP: Vector2[] = [];                  // positions (x corrigé du ratio)
  private trailV: Vector2[] = [];                  // vitesses au moment du passage
  private trailA: number[] = [];                   // âges (s)
  private trailU = Array.from({ length: TRAIL }, () => new Vector4());
  private trailW = new Array(TRAIL).fill(0);
  private ndcVel = new Vector2();
  private prevSmooth = new Vector2();
  private ndcSmooth = new Vector2(9, 9);
  private trailTimer = 0;

  private dpr = 1;
  private maxDpr = 1;
  private slowFrames = 0;
  private running = false;
  private scrollY = 0;

  constructor(private opts: EngineOptions) {
    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.maxDpr = Math.min(window.devicePixelRatio || 1, opts.stride > 1 ? 1.5 : 1.75);
    this.dpr = this.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);

    this.camera.position.set(0, 0, CAM_Z);

    this.material = new ShaderMaterial({
      vertexShader: morphVertex,
      fragmentShader: morphFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uFlow: { value: 1 },
        uSize: { value: opts.stride > 1 ? 26 : 22 },
        uPixelRatio: { value: this.dpr },
        uRadius: { value: 0.2 },
        uTrail: { value: [] as Vector4[] },
        uTrailW: { value: [] as number[] },
        uAspect: { value: 1 },
        uCalm: { value: opts.reducedMotion ? 1 : 0 },
        uOpacity: { value: 0 },
        uCycF: { value: 0 },
        uCycT: { value: 0 },
        uCycle: { value: 0 },
        uCycNoise: { value: 0.025 },
        uCycFreq: { value: 6 },
        uCycDir: { value: 0 },
        uSolidCtx: { value: 0 },
        uSolidBld: { value: 0 },
        uCtxCount: { value: 0 },
        uFlapF: { value: 0 },
        uFlapT: { value: 0 },
        uFlap: { value: 0 },
        uBeatF: { value: 0 },
        uBeatT: { value: 0 },
        uBeat: { value: 0 },
        uPulseF: { value: 0 },
        uPulseT: { value: 0 },
        uFlapC: { value: new Vector3() },
        uFlapK: { value: new Vector3(0, 0, 1) },
      },
    });
    this.lib = new ShapeLibrary(opts.base, opts.stride);
    const tu = this.material.uniforms;
    tu.uTrail.value = this.trailU;
    tu.uTrailW.value = this.trailW;
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.group.add(this.points);
    this.scene.add(this.group);

    // poussière de fond
    const DUST = opts.stride > 1 ? 700 : 1400;
    const dp = new Float32Array(DUST * 3);
    const ds = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 14;
      dp[i * 3 + 1] = (Math.random() - 0.5) * 10;
      dp[i * 3 + 2] = -6 + Math.random() * 8;
      ds[i] = Math.random();
    }
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(dp, 3));
    dg.setAttribute('aSeed', new BufferAttribute(ds, 1));
    this.dustMaterial = new ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uHeight: { value: 10 },
        uPixelRatio: { value: this.dpr },
        uOpacity: { value: 0 },
      },
    });
    const dust = new Points(dg, this.dustMaterial);
    dust.frustumCulled = false;
    this.scene.add(dust);

    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  // ------------------------------------------------------------------ formes

  load(name: string): Promise<Shape> {
    return this.lib.load(name).then((shape) => {
      this.ensureGeometry(shape.pos.count);
      const m = shape.meta;
      if (m.solid && m.transform && m.compose && !this.solidLoading) {
        // chargé à la demande : le chargeur GLTF n'alourdit que les pages qui montrent la maquette
        this.solidLoading = true;
        import('./milan-solid')
          .then(({ MilanSolid }) => {
            const solid = new MilanSolid(this.opts.base, m.solid!, m.transform!, this.opts.stride);
            this.solid = solid;
            this.group.add(solid.root);
            this.material.uniforms.uCtxCount.value = Math.floor(m.compose!.count / this.opts.stride);
            return solid.load().then(() => m.compose!.variants.forEach((v) => solid.loadVariant(v.id)));
          })
          .catch(console.warn);
      }
      return shape;
    });
  }

  private ensureGeometry(n: number) {
    if (this.count) return;
    this.count = n;
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) seed[i] = Math.random();
    this.geometry.setAttribute('aSeed', new BufferAttribute(seed, 1));
    const blank = this.lib.blankColors(n);
    for (const k of ['aColFrom', 'aColTo', 'aColCA', 'aColCB']) this.geometry.setAttribute(k, blank);
  }

  private shape(name: string): Shape | undefined {
    return this.lib.get(name) ?? this.lib.get('cube');
  }

  private bind(fromName: string, toName: string) {
    const a = this.shape(fromName);
    const b = this.shape(toName);
    if (!a || !b) return;
    const g = this.geometry;
    const u = this.material.uniforms;
    g.setAttribute('aFrom', a.pos);
    g.setAttribute('aTo', b.pos);
    g.setAttribute('aColFrom', a.col);
    g.setAttribute('aColTo', b.col);
    g.setAttribute('position', a.pos);
    this.from = a;
    this.to = b;

    this.selectCycle();

    // électrons de la puce IA
    u.uPulseF.value = a.meta.pulse ? 1 : 0;
    u.uPulseT.value = b.meta.pulse ? 1 : 0;

    // battement de cœur
    u.uBeatF.value = a.meta.beat ? 1 : 0;
    u.uBeatT.value = b.meta.beat ? 1 : 0;

    // battement d'ailes
    const flap = a.meta.flap ?? b.meta.flap;
    u.uFlapF.value = a.meta.flap ? 1 : 0;
    u.uFlapT.value = b.meta.flap ? 1 : 0;
    if (flap) {
      u.uFlapC.value.fromArray(flap.center);
      u.uFlapK.value.fromArray(flap.axis).normalize();
    }
  }

  /** Formes à cycle (logos, maquette + propositions) : leurs points viennent des attributs du cycle.
   *  Un seul cycle à la fois : si départ ET arrivée en ont un, c'est la forme dominante
   *  de la transition qui l'utilise (l'autre affiche son premier état). */
  private selectCycle() {
    const a = this.from;
    const b = this.to;
    if (!a || !b) return;
    const u = this.material.uniforms;
    const cyc = a.cycle && b.cycle ? (u.uMorph.value < 0.5 ? a : b) : a.cycle ? a : b.cycle ? b : undefined;
    u.uCycF.value = cyc && cyc === a ? 1 : 0;
    u.uCycT.value = cyc && cyc === b ? 1 : 0;
    if (cyc && cyc !== this.cycleShape) {
      this.cycleShape = cyc;
      this.cycleIndex = 0;
      this.cycleClock = 0;
      this.cycleMoving = false;
      this.bindCycle();
      // un cycle de formes complètes (logos) a une transition plus spectaculaire
      const full = !!cyc.meta.cycle;
      const text = cyc.meta.compose?.kind === 'text';
      u.uCycNoise.value = full ? 0.28 : text ? 0.05 : 0.025;
      u.uCycFreq.value = full ? 1.6 : text ? 5 : 6;
      u.uCycDir.value = text ? 1 : 0;
      u.uCtxCount.value = cyc.meta.compose ? Math.floor(cyc.meta.compose.count / this.opts.stride) : 0;
    }
  }

  private bindCycle() {
    const c = this.cycleShape?.cycle;
    if (!c) return;
    const A = c[this.cycleIndex];
    const B = this.cycleMoving ? c[(this.cycleIndex + 1) % c.length] : A;
    const g = this.geometry;
    g.setAttribute('aCycA', A.pos);
    g.setAttribute('aCycB', B.pos);
    g.setAttribute('aColCA', A.col);
    g.setAttribute('aColCB', B.col);
  }

  /** Fait alterner les propositions de bâtiments tant que la maquette est à l'écran. */
  private updateCycle(dt: number) {
    const u = this.material.uniforms;
    const c = this.cycleShape?.cycle;
    const active = !!c && (u.uCycF.value > 0 || u.uCycT.value > 0);
    if (active !== this.cycleActive) {
      this.cycleActive = active;
      this.emitVariant();
    }
    if (!c || !active) return;
    const cur = c[this.cycleIndex];
    this.cycleClock += dt;
    if (!this.cycleMoving) {
      u.uCycle.value = 0;
      if (this.cycleClock >= cur.hold) {
        this.cycleMoving = true;
        this.cycleClock = 0;
        this.bindCycle();
        const next = c[(this.cycleIndex + 1) % c.length];
        if (next.variant !== cur.variant) this.emitVariant(next.variant);
      }
    } else {
      u.uCycle.value = Math.min(1, this.cycleClock / cur.move);
      if (u.uCycle.value >= 1) {
        this.cycleIndex = (this.cycleIndex + 1) % c.length;
        this.cycleMoving = false;
        this.cycleClock = 0;
        u.uCycle.value = 0;
        this.bindCycle();
      }
    }
  }

  /** Maquette pleine : visible quand la forme est posée, particules seulement pendant les transitions. */
  private updateSolid(dt: number) {
    if (!this.solid) return;
    const u = this.material.uniforms;
    const m = u.uMorph.value;
    const has = (s?: Shape) => !!s?.meta.solid;
    const sstep = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    let target = 0;
    if (has(this.from) && has(this.to)) target = 1;
    else if (has(this.to)) target = sstep(0.82, 1, m);
    else if (has(this.from)) target = 1 - sstep(0, 0.18, m);
    this.presence = damp(this.presence, target, 10, dt);

    // proposition : volume plein une fois élevée, particules pendant l'élévation et la descente
    const c = this.cycleShape?.cycle;
    let bldTarget = 0;
    let variant: string | undefined;
    if (c && this.cycleShape?.meta.solid) {
      const cur = c[this.cycleIndex];
      variant = cur.variant?.id;
      if (cur.built && !this.cycleMoving) bldTarget = this.cycleClock < cur.hold - 0.25 ? 1 : 0;
    }
    this.bldFade = damp(this.bldFade, bldTarget, bldTarget > this.bldFade ? 9 : 16, dt);
    u.uSolidCtx.value = this.presence;
    u.uSolidBld.value = this.presence * this.bldFade;

    // la ville entière apparaît par une onde radiale une fois la maquette posée face au titre
    if (this.presence > 0.97) this.settled += dt;
    else if (this.presence < 0.1) {
      this.settled = 0;
      this.revealClock = 0;
    }
    if (this.settled > 0.35) this.revealClock += dt;
    const DURATION = 4.2;
    const t = Math.min(1, this.revealClock / DURATION);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.reveal = eased * (this.solid.reach + 150);

    this.renderer.getDrawingBufferSize(this.drawSize);
    this.solid.update(this.presence * this.place.opacity, this.reveal, variant, this.bldFade, this.narrow, this.drawSize);
  }

  private emitVariant(v?: VariantInfo) {
    const c = this.cycleShape?.cycle;
    const variant = v ?? (c ? c[this.cycleIndex].variant : undefined);
    window.dispatchEvent(new CustomEvent('morph:variant', { detail: { active: this.cycleActive, variant } }));
  }

  setSequence(names: string[]) {
    this.sequence = names;
    this.segment = -1;
  }

  /** Position continue dans la séquence : 1.5 = mi-chemin entre la forme 1 et la forme 2. */
  setProgress(p: number) {
    this.targetProgress = p;
  }

  setPlacement(p: Placement) {
    this.targetPlace = p;
  }

  /** Mise en page mobile (texte sous le modèle) ou ordinateur (texte à gauche). */
  setNarrow(v: boolean) {
    this.narrow = v;
  }

  setScroll(y: number) {
    this.scrollY = y;
  }

  // ---------------------------------------------------------------- pointeur

  private bindPointer() {
    const set = (x: number, y: number) => {
      this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    };
    window.addEventListener('pointermove', (e) => set(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchstart', (e) => {
      this.hadPointer = false;              // nouveau contact : pas de « saut » de vitesse
      set(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => set(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    document.documentElement.addEventListener('mouseleave', () => this.ndc.set(9, 9));
  }

  private updatePointer(dt: number) {
    const u = this.material.uniforms;
    const aspect = this.camera.aspect;
    u.uAspect.value = aspect;

    // pointeur lissé à chaque image : les événements souris arrivent par à-coups
    const hasPointer = this.ndc.x < 5;
    if (!hasPointer) this.ndcSmooth.set(9, 9);
    else if (this.ndcSmooth.x > 5 || !this.hadPointer) {
      this.ndcSmooth.copy(this.ndc);
      this.prevSmooth.copy(this.ndc);
      this.ndcVel.set(0, 0);
    } else this.ndcSmooth.lerp(this.ndc, 1 - Math.exp(-28 * dt));

    // vitesse lissée (écran, x corrigé du ratio)
    if (hasPointer && dt > 0) {
      const v = new Vector2((this.ndcSmooth.x - this.prevSmooth.x) * aspect, this.ndcSmooth.y - this.prevSmooth.y).divideScalar(dt);
      this.ndcVel.lerp(v.clampLength(0, 6), 1 - Math.exp(-10 * dt));
      this.prevSmooth.copy(this.ndcSmooth);
    } else this.ndcVel.multiplyScalar(Math.exp(-6 * dt));
    this.hadPointer = hasPointer;
    const head = new Vector2(this.ndcSmooth.x * aspect, this.ndcSmooth.y);

    // un point de traînée toutes les 25 ms tant que le pointeur bouge
    for (let i = 0; i < this.trailA.length; i++) this.trailA[i] += dt;
    this.trailTimer += dt;
    if (hasPointer && this.trailTimer >= TRAIL_STEP && this.ndcVel.length() > 0.05) {
      this.trailTimer = 0;
      this.trailP.unshift(head.clone());
      this.trailV.unshift(this.ndcVel.clone());
      this.trailA.unshift(0);
      if (this.trailP.length > TRAIL - 1) {
        this.trailP.pop();
        this.trailV.pop();
        this.trailA.pop();
      }
    }

    // ressort très souple : la poussée colle au geste, ondule légèrement et s'éteint en douceur
    // avant la fin de la traînée (aucun saut quand un point disparaît)
    const LIFE = (TRAIL - 1) * TRAIL_STEP;
    const TAU = 0.95;
    const OMEGA = 2.6;
    const GAIN = 0.05;
    const env = (a: number) => {
      const tail = 1 - Math.min(1, Math.max(0, (a - 0.5 * LIFE) / (0.5 * LIFE)));
      return Math.exp(-a / TAU) * tail * tail;
    };
    // tête de la traînée = position actuelle du pointeur
    const headW = hasPointer ? Math.min(1, this.ndcVel.length() / 0.6) : 0;
    const hv = this.ndcVel.clone().multiplyScalar(GAIN).clampLength(0, 0.16);
    this.trailU[0].set(head.x, head.y, hv.x * headW, hv.y * headW);
    this.trailW[0] = headW;
    for (let i = 1; i < TRAIL; i++) {
      const k = i - 1;
      if (k < this.trailP.length) {
        const a = this.trailA[k];
        const w = env(a);
        const v = this.trailV[k].clone().multiplyScalar(GAIN).clampLength(0, 0.16).multiplyScalar(w * Math.cos(OMEGA * a));
        this.trailU[i].set(this.trailP[k].x, this.trailP[k].y, v.x, v.y);
        this.trailW[i] = w;
      } else {
        this.trailU[i].set(9, 9, 0, 0);
        this.trailW[i] = 0;
      }
    }

    this.tilt.x = damp(this.tilt.x, this.ndc.x > 5 ? 0 : this.ndc.x, 2, dt);
    this.tilt.y = damp(this.tilt.y, this.ndc.y > 5 ? 0 : this.ndc.y, 2, dt);
  }

  // ------------------------------------------------------------------ boucle

  private visible() {
    const h = 2 * Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    return { h, w: h * this.camera.aspect };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private frame(ts: number) {
    this.clock.update(ts);
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.elapsed += dt;
    const t = this.elapsed;
    const u = this.material.uniforms;
    const calm = this.opts.reducedMotion;
    if (!this.count || !this.sequence.length) return;

    // progression lissée (un scroll brusque devient une transition fluide)
    const before = this.progress;
    this.progress = damp(this.progress, this.targetProgress, calm ? 20 : 4.5, dt);
    const dp = this.progress - before;
    if (Math.abs(dp) > 1e-4) this.flow = damp(this.flow, Math.sign(dp), 6, dt);
    u.uFlow.value = this.flow;

    const n = this.sequence.length;
    if (!this.introDone) {
      this.intro = calm ? 1 : Math.min(1, this.intro + dt / 2.4);
      const k = Math.round(Math.min(Math.max(this.progress, 0), n - 1));
      this.bind('cube', this.sequence[k]);
      u.uMorph.value = this.intro;
      if (this.intro >= 1) {
        this.introDone = true;
        this.segment = -1;
      }
    } else {
      const p = Math.min(Math.max(this.progress, 0), n - 1);
      const i = Math.min(Math.floor(p), Math.max(n - 2, 0));
      if (i !== this.segment) {
        this.bind(this.sequence[i], this.sequence[Math.min(i + 1, n - 1)]);
        this.segment = i;
      }
      u.uMorph.value = n > 1 ? p - i : 1;
    }

    // placement (fraction d'écran → unités monde)
    const s = calm ? 20 : 3.2;
    const P = this.place;
    const T = this.targetPlace;
    P.x = damp(P.x, T.x, s, dt);
    P.y = damp(P.y, T.y, s, dt);
    P.size = damp(P.size, T.size, s, dt);
    P.opacity = damp(P.opacity, T.opacity, s, dt);
    const vis = this.visible();
    this.group.position.set(P.x * vis.w, P.y * vis.h, 0);
    const m = u.uMorph.value;
    const shapeScale = (this.from?.meta.scale ?? 1) * (1 - m) + (this.to?.meta.scale ?? 1) * m;
    this.scale0 = damp(this.scale0, shapeScale, 6, dt);
    this.group.scale.setScalar(((P.size * vis.h) / 2) * this.scale0);

    // rotation : oscillation lente (jamais pilotée par le scroll) + inclinaison vers le pointeur
    const mm = u.uMorph.value;
    const idleAmp = (this.from?.meta.idle ?? 1) * (1 - mm) + (this.to?.meta.idle ?? 1) * mm;
    this.idle0 = damp(this.idle0, idleAmp, 3, dt);
    const idle = calm ? 0 : Math.sin(t * 0.22) * 0.55 * this.idle0;
    // compense la perspective : un modèle décalé à droite est tourné vers la caméra pour rester de face
    const facing = -Math.atan2(this.group.position.x, CAM_Z);
    this.group.rotation.y = idle + this.tilt.x * 0.3 + facing;
    this.group.rotation.x = -this.tilt.y * 0.14 + (calm ? 0 : Math.sin(t * 0.17) * 0.05);

    // inclinaison de présentation propre à chaque forme (ex. maquette vue de dessus)
    const tiltTarget = (this.from?.meta.tilt ?? 0) * (1 - u.uMorph.value) + (this.to?.meta.tilt ?? 0) * u.uMorph.value;
    this.tilt0 = damp(this.tilt0, tiltTarget, 6, dt);
    this.group.rotation.x += this.tilt0;

    // battement d'ailes : descente plus rapide que la remontée
    const w = t * 6.5;
    u.uFlap.value = calm ? 0 : -0.25 + 0.6 * (Math.sin(w) + 0.25 * Math.sin(2 * w));

    if (this.from?.cycle && this.to?.cycle) this.selectCycle();
    // cœur : double battement « boum-boum » toutes les 1,1 s
    if (!calm) {
      const ph = t % 1.1;
      const pulse = (c: number, w: number) => Math.exp(-(((ph - c) / w) ** 2));
      u.uBeat.value = 0.085 * pulse(0.08, 0.055) + 0.055 * pulse(0.3, 0.06);
    } else u.uBeat.value = 0;

    this.updateCycle(dt);
    this.updateSolid(dt);
    this.updatePointer(dt);

    this.fade = Math.min(1, this.fade + dt / 1.2);
    u.uOpacity.value = this.fade * P.opacity;
    u.uTime.value = t;

    const du = this.dustMaterial.uniforms;
    du.uTime.value = t;
    du.uScroll.value = this.scrollY * 0.0035;
    du.uOpacity.value = this.fade;

    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  /** Qualité adaptative : baisse la résolution si l'appareil n'arrive pas à suivre. */
  private adapt(dt: number) {
    if (dt > 1 / 40) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90 && this.dpr > 0.75) {
      this.dpr = Math.max(0.75, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.material.uniforms.uPixelRatio.value = this.dpr;
      this.dustMaterial.uniforms.uPixelRatio.value = this.dpr;
      this.slowFrames = 0;
    }
  }
}
