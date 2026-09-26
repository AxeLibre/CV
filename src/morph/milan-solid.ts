import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  Points,
  Shape,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { shapeUrl } from './shapes';

// Maquette Place de Milan (v1.12) COMPLÈTE en vrai maillage, vue de nuit.
// - Le shader reprend l'éclairage de nuit du simulateur : grille de baies allumées (même hash,
//   mêmes proportions), lueur chaude au pied des façades, lumière des lampadaires au sol,
//   matériaux émissifs.
// - Au départ, seule la maquette « cadrée » est visible (celle que dessinent les particules).
//   Puis une onde radiale, partant du centre, fait apparaître le reste de la ville bâtiment par
//   bâtiment (attribut _dist, calculé par tools/build_milan_scene.py), précédée de particules.
// - Au loin et sous le texte de la page, la ville s'estompe pour rester lisible.
// - Les nouveaux bâtiments sont extrudés depuis les sauvegardes JSON du simulateur.

export interface SolidInfo {
  file: string;
  trees: string;
  dust: string;
  lights: number[][];
  outline: number[][][];
  box: number[];
  site: number[];
  reach: number;
  saves: Record<string, string>;
}

const nightVertex = /* glsl */ `
attribute float _dist;
uniform vec4 uBox;
uniform vec2 uSite;
varying vec3 vPos;
varying float vDist;
varying float vFar;
void main(){
  vec4 lp = vec4(position, 1.0);                    // mètres, repère de la maquette
  float dist = _dist;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    vec2 c = instanceMatrix[3].xz;                  // arbre : révélé selon sa position
    bool inBox = c.x > uBox.x && c.x < uBox.y && c.y > uBox.z && c.y < uBox.w;
    dist = inBox ? 0.0 : length(c - uSite);
  #endif
  vPos = lp.xyz;
  vDist = dist;
  vFar = length(lp.xz - uSite);
  gl_Position = projectionMatrix * modelViewMatrix * lp;
}
`;

const nightFragment = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uEmissive;
uniform float uAmbient;
uniform float uWin;
uniform vec4 uGrid;          // pas, hauteur d'étage, largeur, hauteur de baie (m)
uniform float uLit;
uniform vec3 uWinColor;
uniform float uGlow;
uniform float uGround;
uniform vec3 uLights[64];
uniform int uNumLights;
uniform float uOpacity;
uniform float uReveal;       // rayon (m) de l'onde de révélation
uniform float uNarrow;       // 1 = mise en page mobile (texte sous la maquette), 0 = texte à gauche
uniform vec2 uResolution;
varying vec3 vPos;
varying float vDist;
varying float vFar;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  // onde de révélation : un bâtiment apparaît quand l'onde atteint sa distance
  float shown = vDist <= 0.0 ? 1.0 : smoothstep(vDist - 1.0, vDist + 45.0, uReveal);
  if (shown <= 0.001) discard;

  // normale de face calculée à partir des dérivées (le fichier n'en contient pas)
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  float sky = 0.5 + 0.5 * abs(n.y);
  vec3 col = uBase * uAmbient * (0.45 + 0.55 * sky) * vec3(0.72, 0.82, 1.15);

  if (uWin > 0.5 && abs(n.y) < 0.5) {
    float along = (abs(n.x) > abs(n.z)) ? vPos.z : vPos.x;
    vec2 cell = vec2(along / uGrid.x, vPos.y / uGrid.y);
    vec2 id = floor(cell);
    vec2 uv = fract(cell);
    float lit = step(hash12(id), uLit);
    float warmRange = uLit >= 1.0 ? 0.0 : 0.35;
    float warmth = 1.0 - warmRange * 0.5 + warmRange * hash12(id + 17.0);
    float fid = floor(vPos.y / uGrid.y);
    float fb = 0.85 + 0.3 * hash12(vec2(fid, 91.7));
    vec3 fcol = mix(uWinColor, vec3(0.75, 0.85, 1.0), hash12(vec2(fid, 5.3)) * 0.3);
    vec2 d = abs(uv - 0.5) - vec2(uGrid.z / uGrid.x, uGrid.w / uGrid.y) * 0.5;
    float edge = max(d.x, d.y);
    float aa = max(fwidth(edge), 0.001);
    col += fcol * lit * warmth * fb * (1.0 - smoothstep(-aa, aa, edge)) * 1.5;
  }
  if (uGlow > 0.5) {
    float h = clamp(vPos.y / 20.0, 0.0, 1.0);
    col += vec3(1.0, 0.66, 0.36) * 0.5 * pow(1.0 - h, 1.6) * (1.0 - abs(n.y));
  }
  if (uGround > 0.5 && vFar < 700.0) {
    float g = 0.0;
    for (int i = 0; i < 64; i++) {
      if (i >= uNumLights) break;
      vec2 d = vPos.xz - uLights[i].xz;
      g += exp(-dot(d, d) / 90.0);
    }
    col += vec3(1.0, 0.78, 0.5) * min(g, 1.4) * (uBase * 1.6 + 0.12);
  }
  col += uEmissive;

  // lisibilité : la ville s'estompe au loin et sous le texte de la page
  float far = 1.0 - 0.6 * smoothstep(350.0, 1700.0, vFar);
  // côté texte de la page (gauche sur ordinateur, bas sur mobile) : la ville révélée s'efface
  // en dégradé fixe à l'écran, indépendant du scroll
  vec2 sp = gl_FragCoord.xy / uResolution;
  float side = uNarrow > 0.5 ? 1.0 - smoothstep(0.28, 0.6, sp.y) : 1.0 - smoothstep(0.3, 0.62, sp.x);
  float dim = mix(1.0, 0.16, side * (vDist > 0.0 ? 1.0 : 0.0));
  // liseré lumineux au passage de l'onde
  float front = vDist > 0.0 ? exp(-pow((uReveal - vDist - 20.0) / 18.0, 2.0)) : 0.0;
  col += vec3(0.35, 0.8, 1.0) * front * 0.6;
  gl_FragColor = vec4(col * far * dim, uOpacity * shown);
}
`;

// Particules de l'onde : elles partent du centre et filent vers leur bâtiment
const dustVertex = /* glsl */ `
attribute vec4 aPD;          // position (décimètres/8 → m) + distance (m*4)
attribute vec4 aCol;
uniform float uReveal;
uniform vec2 uSite;
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec3 target = aPD.xyz / 8.0;
  float dist = aPD.w / 4.0;
  float k = smoothstep(dist - 380.0, dist, uReveal);
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec2 dir = normalize(target.xz - uSite + 1e-4);
  float r0 = max(dist - 380.0, 0.0);
  vec3 p = vec3(uSite + dir * mix(r0, length(target.xz - uSite), e), 0.0);
  p.y = target.y * e + sin(3.14159 * e) * 25.0;
  p.xz = mix(p.xz, target.xz, e * e);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPixelRatio / -mv.z, 1.0, 6.0 * uPixelRatio);
  vec3 holo = mix(vec3(0.13, 0.89, 1.0), vec3(0.48, 0.36, 1.0), fract(dist * 0.003));
  vColor = mix(holo, pow(aCol.rgb, vec3(1.4)) * 1.9 + 0.2, 0.6);
  float fadeOut = 1.0 - smoothstep(0.0, 110.0, uReveal - dist);
  vAlpha = step(0.001, k) * fadeOut;
}
`;
const dustFragment = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d2 = dot(uv, uv);
  if (d2 > 0.25 || vAlpha <= 0.001) discard;
  gl_FragColor = vec4(vColor * (exp(-d2 * 12.0)), exp(-d2 * 10.0) * vAlpha * uOpacity);
}
`;

interface MatSpec {
  base: number[];
  ambient?: number;
  emissive?: number[];
  win?: [number, number, number, number, number, number[]];
  glow?: boolean;
  ground?: boolean;
}

// Matériaux de la maquette (couleurs des GLB de la v1.12, paramètres de fenêtres de index.html)
const SPECS: Record<string, MatSpec> = {
  BATIMENTS: { base: [0.36, 0.36, 0.36], glow: true },
  BATIMENTS_fenetre: { base: [0.36, 0.36, 0.36], win: [2, 2.5, 0.65, 0.85, 0.38, [1, 0.82, 0.5]], glow: true },
  BATIS_TOIT: { base: [0.36, 0.36, 0.36] },
  glass: { base: [0.31, 0.34, 0.46], win: [1, 3, 0.72, 1.5, 1, [1, 0.86, 0.58]], glow: true },
  glass_fenetre: { base: [0.31, 0.34, 0.46], win: [1, 3, 0.65, 1.3, 0.38, [1, 0.86, 0.58]] },
  glass_carre: { base: [0.31, 0.34, 0.46], win: [3, 3, 2.5, 2.5, 1, [1, 1, 1]] },
  glass_nolight: { base: [0.31, 0.34, 0.46] },
  aluminium: { base: [0.8, 0.8, 0.82] },
  TROTTOIRE: { base: [0.14, 0.14, 0.13], ground: true },
  ROUTE: { base: [0.06, 0.06, 0.06], ground: true },
  ppy: { base: [0.2, 0.2, 0.19], ground: true },
  gazon: { base: [0.15, 0.44, 0.11], ground: true, ambient: 0.5 },
  'PLACE BERAUDIER': { base: [0.25, 0.21, 0.2], ground: true },
  'Matériau.004': { base: [0.6, 0.6, 0.6], ground: true },
  'Matériau.001': { base: [0.26, 0.16, 0.17] },
  'Matériau.003': { base: [0.8, 0.0, 0.0], emissive: [0.9, 0.02, 0.0] },
  'Matériau.006': { base: [0.05, 0.05, 0.05] },
  'Matériau.012': { base: [0.6, 0.6, 0.6] },
  light: { base: [0.78, 0.8, 0.86], emissive: [0.3, 0.6, 1.0] },
  ARRET_TRAM: { base: [0.08, 0.08, 0.08] },
  'TRAIN TRAM': { base: [0.32, 0.31, 0.24] },
  rails: { base: [0.26, 0.23, 0.16] },
  BU: { base: [0.03, 0.02, 0.02] },
  Crayon: { base: [0.44, 0.14, 0.06], win: [2, 3.5, 1.2, 2.2, 0.55, [1, 0.8, 0.5]], glow: true },
  pyramide: { base: [0.05, 0.06, 0.13], emissive: [1.0, 0.45, 0.08] },
  tolyon: { base: [0.05, 0.05, 0.06], win: [1.5, 3.5, 1.1, 2.2, 0.5, [1, 0.86, 0.58]] },
  westfield: { base: [1, 1, 1], emissive: [0.9, 0.85, 0.85] },
  tronc: { base: [0.08, 0.04, 0.04] },
  feuillage: { base: [0.1, 0.24, 0.07], ambient: 0.9 },
};

const USAGE_COLORS: Record<string, number> = {
  residentiel: 0xe0a24a, bureaux: 0x5b8ab0, commerces: 0xd95a6c, hotel: 0xa06bd9, services: 0x4fae8f, nondefini: 0x9aa0a6,
};
const FLOOR_HEIGHTS: Record<string, number> = { residentiel: 3.0, hotel: 3.5, bureaux: 4.0, commerces: 4.0, services: 4.0 };

/** La compression Meshopt quantifie les sommets et range l'échelle réelle dans le nœud :
 *  on reconvertit en flottants et on applique cette transformation à la géométrie. */
function bakeToMeters(mesh: Mesh) {
  const g = mesh.geometry;
  const a = g.getAttribute('position');
  const arr = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) arr.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
  g.setAttribute('position', new BufferAttribute(arr, 3));
  g.deleteAttribute('normal');
  mesh.updateWorldMatrix(true, false);
  g.applyMatrix4(mesh.matrixWorld);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
  mesh.frustumCulled = false;
}

export class MilanSolid {
  readonly root = new Group();          // repère normalisé des particules
  private context = new Group();
  private buildings = new Map<string, Group>();
  private materials: ShaderMaterial[] = [];
  private bldMaterials = new Map<string, ShaderMaterial[]>();
  private lights: Vector3[];
  private dust?: Points;
  private dustMat?: ShaderMaterial;
  private outlineMat?: LineBasicMaterial;
  private ready = false;
  private shared = {
    uReveal: { value: 0 },
    uNarrow: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uBox: { value: new Vector4() },
    uSite: { value: new Vector2() },
  };

  constructor(private base: string, private info: SolidInfo, transform: { center: number[]; scale: number }, private stride = 1) {
    const s = transform.scale;
    this.root.scale.setScalar(s);
    this.root.position.set(-transform.center[0] * s, -transform.center[1] * s, -transform.center[2] * s);
    this.root.add(this.context);
    this.root.visible = false;
    this.lights = info.lights.slice(0, 64).map((l) => new Vector3(l[0], l[1], l[2]));
    this.shared.uBox.value.set(info.box[0], info.box[1], info.box[2], info.box[3]);
    this.shared.uSite.value.set(info.site[0], info.site[1]);
  }

  get reach() {
    return this.info.reach;
  }

  private material(s: MatSpec) {
    const lights = Array.from({ length: 64 }, (_, i) => this.lights[i] ?? new Vector3());
    return new ShaderMaterial({
      vertexShader: nightVertex,
      fragmentShader: nightFragment,
      transparent: true,
      side: DoubleSide,
      uniforms: {
        ...this.shared,
        uBase: { value: new Color(...(s.base as [number, number, number])) },
        uEmissive: { value: new Color(...((s.emissive ?? [0, 0, 0]) as [number, number, number])) },
        uAmbient: { value: s.ambient ?? 0.42 },
        uWin: { value: s.win ? 1 : 0 },
        uGrid: { value: new Vector4(...(s.win ? s.win.slice(0, 4) as number[] : [1, 3, 0.5, 1])) },
        uLit: { value: s.win ? s.win[4] : 0 },
        uWinColor: { value: new Color(...((s.win ? s.win[5] : [1, 1, 1]) as [number, number, number])) },
        uGlow: { value: s.glow ? 1 : 0 },
        uGround: { value: s.ground ? 1 : 0 },
        uLights: { value: lights },
        uNumLights: { value: this.lights.length },
        uOpacity: { value: 0 },
      },
    });
  }

  async load() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const [gltf, treeBuf, dustBuf, dustCol] = await Promise.all([
      loader.loadAsync(shapeUrl(this.base, this.info.file)),
      fetch(shapeUrl(this.base, this.info.trees)).then((r) => r.arrayBuffer()),
      fetch(shapeUrl(this.base, `${this.info.dust}.bin`)).then((r) => r.arrayBuffer()),
      fetch(shapeUrl(this.base, `${this.info.dust}.col`)).then((r) => r.arrayBuffer()),
    ]);
    const treeParts: Mesh[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name;
      const mat = this.material(SPECS[name] ?? { base: [0.3, 0.3, 0.3] });
      this.materials.push(mat);
      mesh.material = mat;
      bakeToMeters(mesh);
      if (mesh.name.startsWith('tree_')) treeParts.push(mesh);
    });
    [...gltf.scene.children].forEach((c) => {
      if (!c.name.startsWith('tree_')) this.context.add(c);
    });

    // arbres : un InstancedMesh par partie du gabarit (tronc, feuillage)
    const tp = new Int16Array(treeBuf);
    const count = tp.length / 3;
    const m4 = new Matrix4();
    treeParts.forEach((part) => {
      const inst = new InstancedMesh(part.geometry, part.material, count);
      for (let i = 0; i < count; i++) {
        const k = 0.85 + ((i * 7919) % 100) / 330;
        m4.makeRotationY(i * 2.39996).scale(new Vector3(k, k, k)).setPosition(tp[i * 3] / 10, tp[i * 3 + 1] / 10, tp[i * 3 + 2] / 10);
        inst.setMatrixAt(i, m4);
      }
      inst.frustumCulled = false;
      this.context.add(inst);
    });

    // particules de l'onde radiale
    const s = this.stride;
    const pd = new Int16Array(dustBuf);
    const pc = new Uint8Array(dustCol);
    const n = Math.floor(pd.length / 4 / s);
    const pdS = new Int16Array(n * 4);
    const pcS = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      pdS.set(pd.subarray(i * s * 4, i * s * 4 + 4), i * 4);
      pcS.set(pc.subarray(i * s * 4, i * s * 4 + 4), i * 4);
    }
    const dg = new BufferGeometry();
    dg.setAttribute('aPD', new BufferAttribute(pdS, 4, false));
    dg.setAttribute('aCol', new BufferAttribute(pcS, 4, true));
    dg.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    this.dustMat = new ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uReveal: this.shared.uReveal,
        uSite: this.shared.uSite,
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
        uSize: { value: s > 1 ? 30 : 22 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
    });
    this.dust = new Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 11;
    this.context.add(this.dust);

    // contour néon du polygone d'implantation
    const seg = new Float32Array(this.info.outline.length * 6);
    this.info.outline.forEach(([a, b], i) => seg.set([a[0], 0.35, a[1], b[0], 0.35, b[1]], i * 6));
    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute(seg, 3));
    this.outlineMat = new LineBasicMaterial({ color: 0x2ee8ff, transparent: true, opacity: 0 });
    this.context.add(new LineSegments(lg, this.outlineMat));
    this.ready = true;
  }

  /** Volumes des nouveaux bâtiments d'une sauvegarde du simulateur (extrusion par tranche). */
  async loadVariant(id: string) {
    if (this.buildings.has(id)) return;
    const file = this.info.saves[id];
    if (!file) return;
    const data = await fetch(shapeUrl(this.base, `milan-saves/${file}`)).then((r) => r.json());
    const g = new Group();
    const mats: ShaderMaterial[] = [];
    for (const b of data.buildings) {
      const heights: number[] = [0];
      const usageAt = (f: number) => (b.bands.find((bd: any) => f >= bd.from && f <= bd.to)?.usage ?? 'nondefini');
      for (let f = 1; f <= b.floors + 1; f++) heights[f] = heights[f - 1] + (FLOOR_HEIGHTS[usageAt(f)] ?? 3);
      for (const band of b.bands) {
        const pts = band.points && band.points.length >= 3 ? band.points : b.points;
        const shape = new Shape(pts.map((p: any) => new Vector2(p.x, -p.z)));
        const y0 = heights[band.from - 1];
        const y1 = heights[band.to];
        const geo = new ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, y0, 0);
        const usage = band.usage ?? 'nondefini';
        const c = new Color(USAGE_COLORS[usage] ?? USAGE_COLORS.nondefini);
        const fh = FLOOR_HEIGHTS[usage] ?? 3;
        const mat = this.material({ base: [c.r, c.g, c.b], ambient: 0.6, glow: true, win: [1.5, fh, 1.0, fh * 0.55, 0.62, [1, 0.86, 0.58]] });
        mats.push(mat);
        g.add(new Mesh(geo, mat));
      }
    }
    g.visible = false;
    this.root.add(g);
    this.buildings.set(id, g);
    this.bldMaterials.set(id, mats);
  }

  /**
   * presence : maquette à l'écran (0..1) ; reveal : rayon de l'onde (m) ;
   * variant / bld : proposition affichée en dur et son opacité ;
   * narrow : mise en page mobile ; resolution : taille du canvas (px).
   */
  update(presence: number, reveal: number, variant: string | undefined, bld: number, narrow: boolean, resolution: Vector2) {
    this.root.visible = this.ready && presence > 0.005;
    if (!this.root.visible) return;
    this.shared.uReveal.value = reveal;
    this.shared.uNarrow.value = narrow ? 1 : 0;
    this.shared.uResolution.value.copy(resolution);
    for (const m of this.materials) m.uniforms.uOpacity.value = presence;
    if (this.dustMat) this.dustMat.uniforms.uOpacity.value = presence;
    if (this.outlineMat) this.outlineMat.opacity = presence * 0.8;
    this.buildings.forEach((g, id) => {
      const on = id === variant && bld > 0.005;
      g.visible = on;
      if (on) for (const m of this.bldMaterials.get(id)!) m.uniforms.uOpacity.value = presence * bld;
    });
  }
}
