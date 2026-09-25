import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  PerspectiveCamera,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { dustFragment, dustVertex, morphFragment, morphVertex } from './shaders';
import { ShapeLibrary, type Shape, type VariantInfo } from './shapes';

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
  private raycaster = new Raycaster();
  private inv = new Matrix4();

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
  private lastMove = -10;
  private touching = false;
  private prevQ = new Vector3();
  private vel = new Vector3();

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
        uRayO: { value: new Vector3(0, 0, 50) },
        uRayD: { value: new Vector3(0, 0, -1) },
        uPointerVel: { value: new Vector3() },
        uPointer: { value: 0 },
        uRadius: { value: 0.36 },
        uCalm: { value: opts.reducedMotion ? 1 : 0 },
        uOpacity: { value: 0 },
        uCycF: { value: 0 },
        uCycT: { value: 0 },
        uCycle: { value: 0 },
        uFlapF: { value: 0 },
        uFlapT: { value: 0 },
        uFlap: { value: 0 },
        uFlapC: { value: new Vector3() },
        uFlapK: { value: new Vector3(0, 0, 1) },
      },
    });
    this.lib = new ShapeLibrary(opts.base, opts.stride);
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
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

    // forme composée (maquette + propositions) : ses points viennent des attributs du cycle
    const cyc = a.cycle ? a : b.cycle ? b : undefined;
    u.uCycF.value = a.cycle ? 1 : 0;
    u.uCycT.value = b.cycle ? 1 : 0;
    if (cyc && cyc !== this.cycleShape) {
      this.cycleShape = cyc;
      this.cycleIndex = 0;
      this.cycleClock = 0;
      this.cycleMoving = false;
      this.bindCycle();
    }

    // battement d'ailes
    const flap = a.meta.flap ?? b.meta.flap;
    u.uFlapF.value = a.meta.flap ? 1 : 0;
    u.uFlapT.value = b.meta.flap ? 1 : 0;
    if (flap) {
      u.uFlapC.value.fromArray(flap.center);
      u.uFlapK.value.fromArray(flap.axis).normalize();
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

  setScroll(y: number) {
    this.scrollY = y;
  }

  // ---------------------------------------------------------------- pointeur

  private bindPointer() {
    const set = (x: number, y: number) => {
      this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      this.lastMove = this.elapsed;
    };
    window.addEventListener('pointermove', (e) => set(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerdown', (e) => set(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchstart', (e) => {
      this.touching = true;
      set(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => set(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    window.addEventListener('touchend', () => (this.touching = false), { passive: true });
    document.documentElement.addEventListener('mouseleave', () => (this.lastMove = -10));
  }

  private updatePointer(dt: number, t: number) {
    const u = this.material.uniforms;
    const active = this.touching || t - this.lastMove < 2.2;
    u.uPointer.value = damp(u.uPointer.value, active ? 1 : 0, active ? 6 : 1.5, dt);

    this.points.updateMatrixWorld();
    this.inv.copy(this.points.matrixWorld).invert();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const o = this.raycaster.ray.origin.clone().applyMatrix4(this.inv);
    const d = this.raycaster.ray.direction.clone().transformDirection(this.inv);
    u.uRayO.value.copy(o);
    u.uRayD.value.copy(d);

    // vitesse du point le plus proche de l'origine sur le rayon → sillage
    const q = o.clone().addScaledVector(d, -o.dot(d));
    if (dt > 0) {
      const v = q.clone().sub(this.prevQ).divideScalar(dt).clampLength(0, 3);
      this.vel.lerp(v, 1 - Math.exp(-8 * dt));
    }
    this.prevQ.copy(q);
    u.uPointerVel.value.copy(this.vel).multiplyScalar(0.12);

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

    this.updateCycle(dt);
    this.updatePointer(dt, t);

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
