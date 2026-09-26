// Shaders du nuage de points holographique.
// Positions : attributs Int16 normalisés (aFrom / aTo), permutés sans ré-upload
// quand la séquence avance. Toute l'animation est calculée sur le GPU.

const noise = /* glsl */ `
// Simplex 3D (Ashima Arts / Stefan Gustavson, licence MIT)
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 snoiseVec(vec3 p){
  return vec3(snoise(p),snoise(p+vec3(31.4,-17.2,5.9)),snoise(p+vec3(-9.1,23.7,-41.3)));
}
`;

export const morphVertex = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute float aSeed;
attribute vec4 aColFrom;    // couleur réelle (alpha 0 = dégradé holographique)
attribute vec4 aColTo;
attribute vec3 aCycA;       // alternance des propositions (forme composée)
attribute vec3 aCycB;
attribute vec4 aColCA;
attribute vec4 aColCB;

uniform float uTime;
uniform float uMorph;       // 0 → 1 entre aFrom et aTo
uniform float uFlow;        // direction du scroll (+1 descente, -1 montée)
uniform float uSize;
uniform float uPixelRatio;
uniform float uRadius;
#define TRAIL 40
uniform vec4  uTrail[TRAIL];     // traînée du pointeur à l'écran : position (x corrigé du ratio, y) + poussée
uniform float uTrailW[TRAIL];    // enveloppe de chaque point de la traînée
uniform float uAspect;
uniform float uCalm;        // 1 = prefers-reduced-motion
uniform float uCycF;        // 1 si la forme de départ / d'arrivée est la forme composée
uniform float uCycT;
uniform float uCycle;       // 0 → 1 entre deux états du cycle
uniform float uCycNoise;    // turbulence du cycle (faible pour les bâtiments, forte pour les logos)
uniform float uCycFreq;
uniform float uCycDir;      // 0 = transition du bas vers le haut, 1 = de gauche à droite (écriture)
uniform float uSolidCtx;    // maquette pleine affichée : masque les particules du contexte
uniform float uSolidBld;    // proposition affichée en dur : masque ses particules
uniform int   uCtxCount;    // nombre de particules du contexte (les suivantes = bâtiments)
uniform float uFlapF;       // 1 si la forme de départ / d'arrivée bat des ailes
uniform float uFlapT;
uniform float uFlap;        // angle des ailes (rad)
uniform vec3  uFlapC;       // point et axe du corps
uniform vec3  uFlapK;
uniform float uBeatF;       // 1 si la forme de départ / d'arrivée bat comme un cœur
uniform float uBeatT;
uniform float uBeat;        // dilatation du battement (0 au repos)

varying vec3  vColor;
varying float vAlpha;
varying float vHot;

${noise}

float easeInOut(float t){ return t<0.5 ? 4.0*t*t*t : 1.0-pow(-2.0*t+2.0,3.0)/2.0; }

// rotation d'une aile autour de l'axe du corps (Rodrigues), atténuée à la racine
// w : masque "aile" (canal R du fichier .col) — corps, pattes et antennes restent fixes
vec3 flap(vec3 p, float w){
  float side = p.x - uFlapC.x;
  float phi = sign(side) * uFlap * w * smoothstep(0.015, 0.12, abs(side));
  vec3 q = p - uFlapC;
  float c = cos(phi), s = sin(phi);
  q = q * c + cross(uFlapK, q) * s + uFlapK * dot(uFlapK, q) * (1.0 - c);
  return q + uFlapC;
}

void main(){
  // --- proposition courante de la forme composée : les bâtiments s'élèvent depuis
  //     leur emprise (le bas d'abord) et redescendent (le haut d'abord)
  float rising = step(aCycA.y, aCycB.y);
  float h01 = clamp((rising > 0.5 ? aCycB.y : aCycA.y) * 1.4 + 0.2, 0.0, 1.0);
  float cdel = aSeed * 0.2 + (rising > 0.5 ? h01 : 1.0 - h01) * 0.4;
  float cspan = 0.4;
  if (uCycDir > 0.5) {
    // écriture : chaque lettre se forme à son tour, de gauche à droite
    cdel = aSeed * 0.04 + clamp((aCycB.x + 0.75) / 1.5, 0.0, 1.0) * 0.72;
    cspan = 0.24;
  }
  float cl = easeInOut(smoothstep(cdel, cdel + cspan, uCycle));
  float moving = step(1e-4, distance(aCycA, aCycB));
  vec3 C = mix(aCycA, aCycB, cl);
  C += snoiseVec(C * uCycFreq + uTime * 0.4) * sin(3.14159265 * cl) * uCycNoise * moving;
  vec4 CC = mix(aColCA, aColCB, cl);

  vec3 from = uCycF > 0.5 ? C : aFrom;
  vec3 to   = uCycT > 0.5 ? C : aTo;
  vec4 colF = uCycF > 0.5 ? CC : aColFrom;
  vec4 colT = uCycT > 0.5 ? CC : aColTo;
  if (uFlapF > 0.5) from = flap(from, colF.r);
  if (uFlapT > 0.5) to = flap(to, colT.r);
  if (uBeatF > 0.5) from *= 1.0 + uBeat * (0.8 + 0.4 * aSeed);
  if (uBeatT > 0.5) to *= 1.0 + uBeat * (0.8 + 0.4 * aSeed);

  // Décalage par particule + balayage bas → haut : la forme se "réimprime" comme un hologramme
  float delay = aSeed * 0.3 + (from.y * 0.5 + 0.5) * 0.3;
  float lt = easeInOut(smoothstep(delay, delay + 0.4, uMorph));
  float mid = sin(3.14159265 * lt);

  vec3 p = mix(from, to, lt);
  // turbulence pendant le trajet + flux vertical qui suit le sens du scroll
  p += snoiseVec(p * 1.6 + uTime * 0.15) * mid * 0.32 * (1.0 - uCalm * 0.7);
  p.y += mid * (0.15 + aSeed * 0.35) * uFlow;

  // micro-vibration holographique
  float a = aSeed * 6.2831 + uTime * 1.4;
  p += vec3(cos(a), sin(a * 1.3), sin(a * 0.7)) * 0.004 * (1.0 - uCalm);

  // glitch : tranche horizontale décalée de temps en temps
  float gw = step(0.965, fract(uTime * 0.23 + 0.37)) * (1.0 - uCalm);
  float band = step(abs(p.y - (fract(uTime * 0.61) * 2.0 - 1.0)), 0.04);
  p.x += gw * band * 0.06;



  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;

  // --- Interaction souris / doigt : un flux d'air laissé par le pointeur.
  //     La traînée est une ligne continue à l'écran (tête = position actuelle du pointeur) ;
  //     les particules proches sont emportées dans le sens du geste, flottent,
  //     puis reviennent en place comme sur un ressort très souple.
  vec2 sp = clip.xy / clip.w;
  sp.x *= uAspect;
  vec2 push = vec2(0.0);
  vec2 burst = vec2(0.0);
  float fsum = 0.0;
  float fl = 0.0;
  for (int i = 0; i < TRAIL - 1; i++) {
    float w = max(uTrailW[i], uTrailW[i + 1]);
    if (w < 0.002) continue;
    vec2 a = uTrail[i].xy;
    vec2 ab = uTrail[i + 1].xy - a;
    float h = clamp(dot(sp - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec2 off = sp - a - ab * h;
    float dd = length(off);
    float fall = 1.0 - smoothstep(0.0, uRadius, dd);
    fall *= fall;
    float wi = mix(uTrailW[i], uTrailW[i + 1], h);
    push += mix(uTrail[i].zw, uTrail[i + 1].zw, h) * fall;
    burst += off / max(dd, 1e-4) * fall * wi;    // chassées de part et d'autre de la trajectoire
    fsum += fall * wi;
    fl += fall;
  }
  push /= max(fl, 1.0);                         // segments superposés : pas de cumul
  burst /= max(fl, 1.0);
  float f = min(fsum, 1.0);
  float grip = 0.6 + 0.8 * aSeed;               // chaque particule est plus ou moins bousculée
  // éclatement : poussée vers l'extérieur + direction propre à chaque particule
  float ang = aSeed * 43.7;
  push += burst * 0.045 + vec2(cos(ang), sin(ang)) * f * 0.03;
  if (f > 0.001) push += snoiseVec(vec3(sp * 3.0, uTime * 0.35 + aSeed)).xy * f * 0.018;  // flottement
  push.x /= uAspect;
  clip.xy += push * grip * clip.w;
  gl_Position = clip;
  vHot = f * 0.4;

  float size = uSize * (0.65 + aSeed * 0.7) * (1.0 + f * 0.6 + mid * 0.6);
  gl_PointSize = clamp(size * uPixelRatio / -mv.z, 1.0, 14.0 * uPixelRatio);

  // dégradé de marque cyan → violet → magenta selon la diagonale et la graine
  float g = clamp((p.x + p.y) * 0.3 + 0.5 + (aSeed - 0.5) * 0.25, 0.0, 1.0);
  vec3 cyan = vec3(0.13, 0.89, 1.0);
  vec3 violet = vec3(0.48, 0.36, 1.0);
  vec3 magenta = vec3(1.0, 0.25, 0.85);
  vec3 holo = g < 0.5 ? mix(cyan, violet, g * 2.0) : mix(violet, magenta, (g - 0.5) * 2.0);
  // couleur réelle (maquette de nuit…) quand la forme en fournit une, sinon dégradé de marque
  vec4 real = mix(colF, colT, lt);
  vec3 lit = pow(real.rgb, vec3(1.4)) * 1.9;
  vColor = mix(holo, lit + holo * 0.06, real.a);
  // une particule mobile d'une proposition scintille légèrement
  vColor += vec3(0.6, 0.9, 1.0) * sin(3.14159265 * cl) * moving * 0.5 * max(uCycF, uCycT);

  // ligne de scan qui remonte
  float scan = smoothstep(0.06, 0.0, abs(p.y - (fract(uTime * 0.18) * 2.6 - 1.3)));
  vColor += scan * 0.55 * (1.0 - uCalm);
  vColor = mix(vColor, vec3(1.0, 0.85, 1.0), vHot * 0.55);

  // atténuation en profondeur (les points arrière sont plus discrets)
  vAlpha = clamp(0.35 + (p.z * 0.5 + 0.5) * 0.65, 0.2, 1.0) * (1.0 + mid * 0.4);
  // forme composée affichée en vrai maillage : les particules s'effacent
  float isCtx = gl_VertexID < uCtxCount ? 1.0 : 0.0;
  vAlpha *= 1.0 - max(uCycF, uCycT) * (isCtx * uSolidCtx + (1.0 - isCtx) * uSolidBld);
}
`;

export const morphFragment = /* glsl */ `
uniform float uOpacity;
varying vec3  vColor;
varying float vAlpha;
varying float vHot;

void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d2 = dot(uv, uv);
  if (d2 > 0.25) discard;
  float core = exp(-d2 * 60.0);
  float halo = exp(-d2 * 9.0);
  float lum = clamp(max(max(vColor.r, vColor.g), vColor.b), 0.0, 1.0);
  vec3 col = vColor * (halo * 0.9) + vec3(1.0) * core * (0.35 + vHot * 0.6) * lum;
  gl_FragColor = vec4(col, (halo * 0.55 + core * 0.45) * vAlpha * uOpacity);
}
`;

// Poussière de fond : se déplace verticalement avec le scroll (repère de profondeur)
export const dustVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uScroll;
uniform float uHeight;
uniform float uPixelRatio;
varying float vAlpha;
void main(){
  vec3 p = position;
  float speed = 0.35 + aSeed * 0.9;                // parallaxe : profondeur ≠ vitesse
  p.y = mod(p.y + uScroll * speed + uTime * 0.02 * speed + uHeight * 0.5, uHeight) - uHeight * 0.5;
  p.x += sin(uTime * 0.2 + aSeed * 40.0) * 0.05;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;

  // --- Interaction souris / doigt : un flux d'air laissé par le pointeur.
  //     La traînée est une ligne continue à l'écran (tête = position actuelle du pointeur) ;
  //     les particules proches sont emportées dans le sens du geste, flottent,
  //     puis reviennent en place comme sur un ressort très souple.
  vec2 sp = clip.xy / clip.w;
  sp.x *= uAspect;
  vec2 push = vec2(0.0);
  vec2 burst = vec2(0.0);
  float fsum = 0.0;
  float fl = 0.0;
  for (int i = 0; i < TRAIL - 1; i++) {
    float w = max(uTrailW[i], uTrailW[i + 1]);
    if (w < 0.002) continue;
    vec2 a = uTrail[i].xy;
    vec2 ab = uTrail[i + 1].xy - a;
    float h = clamp(dot(sp - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec2 off = sp - a - ab * h;
    float dd = length(off);
    float fall = 1.0 - smoothstep(0.0, uRadius, dd);
    fall *= fall;
    float wi = mix(uTrailW[i], uTrailW[i + 1], h);
    push += mix(uTrail[i].zw, uTrail[i + 1].zw, h) * fall;
    burst += off / max(dd, 1e-4) * fall * wi;    // chassées de part et d'autre de la trajectoire
    fsum += fall * wi;
    fl += fall;
  }
  push /= max(fl, 1.0);                         // segments superposés : pas de cumul
  burst /= max(fl, 1.0);
  float f = min(fsum, 1.0);
  float grip = 0.6 + 0.8 * aSeed;               // chaque particule est plus ou moins bousculée
  // éclatement : poussée vers l'extérieur + direction propre à chaque particule
  float ang = aSeed * 43.7;
  push += burst * 0.045 + vec2(cos(ang), sin(ang)) * f * 0.03;
  if (f > 0.001) push += snoiseVec(vec3(sp * 3.0, uTime * 0.35 + aSeed)).xy * f * 0.018;  // flottement
  push.x /= uAspect;
  clip.xy += push * grip * clip.w;
  gl_Position = clip;
  vHot = f * 0.4;
  gl_PointSize = (1.0 + aSeed * 2.2) * uPixelRatio * 6.0 / -mv.z;
  vAlpha = 0.25 + 0.5 * aSeed;
}
`;

export const dustFragment = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d2 = dot(uv, uv);
  if (d2 > 0.25) discard;
  gl_FragColor = vec4(vec3(0.55, 0.7, 1.0), exp(-d2 * 14.0) * vAlpha * uOpacity * 0.6);
}
`;
