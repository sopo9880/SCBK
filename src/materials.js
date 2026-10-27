// 셰이더 기반 재질: 텍스처 없이 창문/지붕/단면을 절차적으로 그림
import * as THREE from 'three';

const NOISE = /* glsl */`
float sw_hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float sw_hash3(vec3 p){ return sw_hash(p.xy + p.z*17.13); }
float sw_noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(sw_hash(i),sw_hash(i+vec2(1,0)),f.x), mix(sw_hash(i+vec2(0,1)),sw_hash(i+vec2(1,1)),f.x), f.y); }
float sw_fbm(vec2 p){ float a=0.5, s=0.; for(int i=0;i<4;i++){ s+=a*sw_noise(p); p*=2.03; a*=0.5; } return s; }
`;

export const sharedUniforms = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  uGlass: { value: 1 }, // 유리창 반사 세기 (설정)
  uPower: { value: 1 }, // 도시 전력 (EMP 로 0)
};

export function makeBuildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = sharedUniforms.uNight; sh.uniforms.uGlass = sharedUniforms.uGlass; sh.uniforms.uPower = sharedUniforms.uPower;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aOrig; attribute float aKind;
varying vec3 vOrig; varying vec3 vObjN; varying float vKind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vOrig = aOrig; vObjN = normal; vKind = aKind;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight; uniform float uGlass; uniform float uPower;
varying vec3 vOrig; varying vec3 vObjN; varying float vKind;
float swWin = 0.0; float swLit = 0.0;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float sc = 1.0;
  #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
    sc = clamp(dot(vColor.rgb, vec3(0.333)) * 1.25, 0.0, 1.0);
  #endif
  if (vKind < 0.5) {
    vec3 n = normalize(vObjN);
    vec2 t = normalize(vec2(-n.z, n.x) + 1e-5);
    float along = dot(vOrig.xz, t);
    float colW = 3.1, floorH = 3.4;
    vec2 g = vec2(along / colW, vOrig.y / floorH);
    vec2 cu = fract(g);
    vec2 aa = fwidth(g);
    float far = smoothstep(0.18, 0.55, max(aa.x, aa.y));
    float wx = smoothstep(0.16, 0.16 + aa.x * 1.5, cu.x) * (1.0 - smoothstep(0.84 - aa.x * 1.5, 0.84, cu.x));
    float wy = smoothstep(0.30, 0.30 + aa.y * 1.5, cu.y) * (1.0 - smoothstep(0.88 - aa.y * 1.5, 0.88, cu.y));
    float w = wx * wy;
    float slab = 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.08, cu.y));
    vec2 cell = floor(g);
    float rnd = sw_hash(cell + floor(vOrig.xz * 0.01));
    vec3 glass = mix(vec3(0.10, 0.14, 0.19), vec3(0.20, 0.27, 0.33), rnd) * sc;
    vec3 wall = diffuseColor.rgb * slab * (0.93 + 0.1 * sw_noise(vOrig.xz * 0.7 + vOrig.y * 0.3));
    swWin = mix(w, 0.35, far);
    diffuseColor.rgb = mix(wall, glass, swWin);
    swLit = step(0.62, sw_hash(cell * 1.7 + 3.1)) * w * (1.0 - far * 0.6) * sc;
  } else if (vKind < 1.5) {
    float nz = sw_fbm(vOrig.xz * 0.35);
    diffuseColor.rgb *= vec3(0.62, 0.62, 0.64) * (0.8 + 0.35 * nz);
  } else {
    float nz = sw_fbm(vOrig.xz * 1.3 + vOrig.y * 0.9);
    diffuseColor.rgb = vec3(0.50, 0.48, 0.45) * (0.65 + 0.5 * nz) * sc;
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, mix(0.4, 0.03, clamp(uGlass * 0.5, 0.0, 1.0)), swWin);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, clamp(0.55 * uGlass, 0.0, 1.0), swWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * swLit * uNight * 1.6 * uPower;`);
  };
  mat.customProgramCacheKey = () => 'sw-building-v2';
  return mat;
}

export function makeTerrainMaterial(map) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\n${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float n1 = sw_fbm(vWP.xz * 0.18);
  float n2 = sw_noise(vWP.xz * 1.7);
  diffuseColor.rgb *= 0.86 + 0.2 * n1 + 0.06 * n2;
}`);
  };
  mat.customProgramCacheKey = () => 'sw-terrain-v1';
  return mat;
}

// 파티클 퍼프 텍스처
export function makePuffTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const h = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
    const r = Math.hypot(dx, dy);
    let n = 0, a = 0.5, f = 3;
    for (let o = 0; o < 4; o++) { n += a * vn(x / S * f + 10, y / S * f + 3); a *= 0.5; f *= 2; }
    const fall = Math.max(0, 1 - r);
    const v = Math.max(0, Math.min(1, fall * fall * (0.55 + n * 0.9) * 1.4 - 0.05));
    const p = (y * S + x) * 4;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
    img.data[p + 3] = Math.round(v * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
