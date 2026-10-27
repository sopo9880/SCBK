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
    sh.uniforms.uNight = sharedUniforms.uNight; sh.uniforms.uGlass = sharedUniforms.uGlass; sh.uniforms.uPower = sharedUniforms.uPower; sh.uniforms.uTime = sharedUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aOrig; attribute float aKind;
varying vec3 vOrig; varying vec3 vObjN; varying float vKind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vOrig = aOrig; vObjN = normal; vKind = aKind;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight; uniform float uGlass; uniform float uPower; uniform float uTime;
varying vec3 vOrig; varying vec3 vObjN; varying float vKind;
float swWin = 0.0; float swLit = 0.0; vec3 swLitCol = vec3(1.0, 0.78, 0.45);
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
    // 밤 창문: 따뜻한 불빛·하얀 사무실 불빛·TV 처럼 깜빡이는 푸른빛, 층 전체가 켜진 사무실, 1층 상가
    float hc = sw_hash(cell * 2.3 + 7.7);
    swLitCol = hc < 0.62 ? vec3(1.0, 0.74, 0.40) : hc < 0.88 ? vec3(0.86, 0.93, 1.0) : vec3(0.45, 0.62, 1.0) * (0.65 + 0.35 * sin(uTime * 7.0 + hc * 60.0));
    float on = step(0.55, sw_hash(cell * 1.7 + 3.1));
    float floorOn = step(0.86, sw_hash(vec2(cell.y * 1.31, floor(vOrig.x * 0.013) + floor(vOrig.z * 0.017) * 7.0)));
    float lv = 0.5 + 0.7 * sw_hash(cell * 3.7 + 1.3);
    if (cell.y < 0.5) { on = step(0.3, sw_hash(cell + 9.1)); lv = 1.5; swLitCol = vec3(1.0, 0.86, 0.62); }
    swLit = max(on, floorOn) * lv * w * sc;
    // 멀리서는 창 하나하나가 안 보이므로, 켜진 창의 평균 밝기로 벽 전체를 은은하게 (멀리서도 불 켜진 도시로 보이게)
    float flo = sw_hash(vec2(floor(vOrig.y / 3.4), floor(vOrig.x * 0.05) + floor(vOrig.z * 0.05) * 7.0));
    swLit = mix(swLit, 0.2 * sc * (0.25 + 1.1 * flo * flo), far);
    if (far > 0.5) swLitCol = mix(swLitCol, vec3(1.0, 0.8, 0.52), far);
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
totalEmissiveRadiance += swLitCol * swLit * uNight * 1.7 * uPower;`);
  };
  mat.customProgramCacheKey = () => 'sw-building-v3';
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
