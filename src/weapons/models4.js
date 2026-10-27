// v1.4 무기 모델 — 모두 기본 도형으로 만든 자체 디자인 (실존 기체·캐릭터를 본뜨지 않음)
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...o });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; return m; }
const R = Math.random;

export function lumpy(geo, amt, seed = 1) {
  const p = geo.getAttribute('position');
  let s = seed * 7919 + 13;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, 1 - amt / 2 + rnd() * amt);
    const f = map.get(k);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}

// 공격 헬기 (앞 = +Z). userData.rotor 를 돌림
export function makeHeli() {
  const g = new THREE.Group();
  const body = std(0x3d4a3a, { roughness: 0.6 });
  const b = mesh(new THREE.CapsuleGeometry(1.4, 4.5, 6, 12), body); b.rotation.x = Math.PI / 2; g.add(b);
  const cab = mesh(new THREE.SphereGeometry(1.25, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1a2a33, { roughness: 0.1, metalness: 0.8 })); cab.position.set(0, 0.6, 2.2); cab.scale.set(0.9, 0.8, 1.2); g.add(cab);
  const boom = mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 8), body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.4, -5.6); g.add(boom);
  const fin = mesh(new THREE.BoxGeometry(0.15, 2.2, 1.4), body); fin.position.set(0, 1.2, -8.8); g.add(fin);
  const wing = mesh(new THREE.BoxGeometry(5.5, 0.15, 1.1), body); wing.position.set(0, -0.4, 0.2); g.add(wing);
  for (const s of [-1, 1]) { const pod = mesh(new THREE.CylinderGeometry(0.38, 0.38, 2.2, 8), std(0x2a2e30)); pod.rotation.x = Math.PI / 2; pod.position.set(s * 2.4, -0.75, 0.3); g.add(pod); }
  const mast = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), body); mast.position.y = 1.6; g.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 2.2;
  const blade = new THREE.BoxGeometry(14, 0.06, 0.5);
  rotor.add(mesh(blade, std(0x202224), false)); const b2 = mesh(blade, std(0x202224), false); b2.rotation.y = Math.PI / 2; rotor.add(b2);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.3, 1.2, -8.8);
  const tb = new THREE.BoxGeometry(0.05, 2.6, 0.25); tail.add(mesh(tb, std(0x202224), false)); const tb2 = mesh(tb, std(0x202224), false); tb2.rotation.x = Math.PI / 2; tail.add(tb2);
  g.add(tail);
  g.userData.rotor = rotor; g.userData.tail = tail;
  return g;
}

// 전투기 (앞 = +Z)
export function makeJet() {
  const g = new THREE.Group();
  const m = std(0x7a8288, { metalness: 0.55, roughness: 0.4 });
  const f = mesh(new THREE.ConeGeometry(0.9, 14, 10), m); f.rotation.x = Math.PI / 2; g.add(f);
  const can = mesh(new THREE.SphereGeometry(0.7, 10, 8), std(0x223040, { roughness: 0.05, metalness: 0.9 })); can.position.set(0, 0.55, 2.5); can.scale.set(0.8, 0.7, 2); g.add(can);
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 2); wingShape.lineTo(6, -2.5); wingShape.lineTo(6, -3.6); wingShape.lineTo(0, -3.2);
  const wg = new THREE.ExtrudeGeometry(wingShape, { depth: 0.18, bevelEnabled: false }); wg.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) { const w = mesh(wg, m); w.scale.x = s; g.add(w); }
  for (const s of [-1, 1]) { const t = mesh(new THREE.BoxGeometry(0.12, 2.4, 2), m); t.position.set(s * 0.9, 1.2, -5.6); t.rotation.z = s * 0.35; g.add(t); }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3, 8), glow(0xffa050, 0.85)); fl.rotation.x = -Math.PI / 2; fl.position.z = -8.2; g.add(fl);
  g.userData.flame = fl;
  return g;
}

// 극초음속 활공체: 납작한 쐐기 + 플라스마 외피 (앞 = +Z)
export function makeGlider() {
  const g = new THREE.Group();
  const shp = new THREE.Shape(); shp.moveTo(0, 4); shp.lineTo(1.6, -2.5); shp.lineTo(-1.6, -2.5); shp.lineTo(0, 4);
  const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.6, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2, bevelSegments: 1 }); geo.rotateX(-Math.PI / 2); geo.translate(0, -0.3, 0);
  g.add(mesh(geo, std(0x2b2b2e, { metalness: 0.7, roughness: 0.3 })));
  const sheath = new THREE.Mesh(new THREE.ConeGeometry(2.6, 11, 16, 1, true), glow(0xff8a3a, 0.55)); sheath.rotation.x = -Math.PI / 2; sheath.position.z = -1.5; g.add(sheath);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), glow(0xfff2c0, 0.9)); tip.position.z = 3.6; g.add(tip);
  g.userData.sheath = sheath;
  return g;
}

// 비행선 (앞 = +Z, 길이 약 2 → 스케일로 키움)
export function makeAirship() {
  const g = new THREE.Group();
  const skin = std(0xb8b2a2, { roughness: 0.8, metalness: 0.05 });
  const env = mesh(new THREE.SphereGeometry(1, 40, 20), skin); env.scale.set(0.17, 0.17, 1); g.add(env);
  // 늑골 무늬
  for (let i = -8; i <= 8; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.171 * Math.sqrt(Math.max(0, 1 - (i / 9.2) ** 2)), 0.0035, 4, 32), std(0x8a8476)); r.position.z = i / 9.2; g.add(r); }
  const gon = mesh(new THREE.BoxGeometry(0.05, 0.035, 0.22), std(0x3a3632)); gon.position.set(0, -0.18, 0.25); g.add(gon);
  for (const [x, y] of [[0, 0.16], [0, -0.16], [0.16, 0], [-0.16, 0]]) { const f = mesh(new THREE.BoxGeometry(x ? 0.12 : 0.006, y ? 0.12 : 0.006, 0.18), skin); f.position.set(x * 0.9, y * 0.9, -0.88); g.add(f); }
  for (const s of [-1, 1]) { const e = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), std(0x333333)); e.rotation.x = Math.PI / 2; e.position.set(s * 0.17, -0.06, -0.2); g.add(e); }
  g.userData.skin = skin;
  return g;
}

// 곡물 저장고 (높이 1 기준)
export function makeSilo() {
  const g = new THREE.Group();
  const m = std(0xb7bcc0, { metalness: 0.6, roughness: 0.35 });
  for (let i = 0; i < 3; i++) { const c = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 18), m); c.position.set((i - 1) * 0.36, 0.5, 0); g.add(c); const cap = mesh(new THREE.ConeGeometry(0.18, 0.12, 18), m); cap.position.set((i - 1) * 0.36, 1.06, 0); g.add(cap); }
  const lift = mesh(new THREE.BoxGeometry(0.12, 1.35, 0.12), std(0x8a3a2a)); lift.position.set(0.62, 0.67, 0); g.add(lift);
  return g;
}

// 지뢰 (반지름 1)
export function makeMine() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1, 1.1, 0.5, 16), std(0x3f4a34, { roughness: 0.7 })));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glow(0xff2020, 1)); led.position.y = 0.32; g.add(led);
  g.userData.led = led;
  return g;
}

// 빙산 (반지름 1, 물 위 부분)
export function makeIceberg(seed = 1) {
  const geo = lumpy(new THREE.IcosahedronGeometry(1, 3), 0.55, seed);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y > 0 ? y * (1.1 + 0.6 * Math.abs(Math.sin(p.getX(i) * 3 + seed))) : y * 0.4); }
  geo.computeVertexNormals();
  const m = mesh(geo, std(0xe6f4fb, { roughness: 0.25, metalness: 0.05, emissive: 0x16303c, flatShading: true }));
  return m;
}

// 팽이 (높이 약 1.6)
export function makeTop() {
  const g = new THREE.Group();
  const cols = [0xd23b3b, 0xf2c43a, 0x2f7fd6, 0x3fb36a];
  for (let i = 0; i < 4; i++) { const ring = mesh(new THREE.CylinderGeometry(1 - i * 0.18, 1 - i * 0.18, 0.18, 32), std(cols[i], { roughness: 0.35, metalness: 0.1 })); ring.position.y = 0.55 + i * 0.12; g.add(ring); }
  const cone = mesh(new THREE.ConeGeometry(1, 0.9, 32), std(0xd23b3b, { roughness: 0.35, metalness: 0.1 })); cone.rotation.x = Math.PI; cone.position.y = 0.45 - 0.0; g.add(cone);
  const stem = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12), std(0x6a4a2a)); stem.position.y = 1.2; g.add(stem);
  const tip = mesh(new THREE.SphereGeometry(0.08, 8, 6), std(0x999999, { metalness: 0.9 })); tip.position.y = 0.0; g.add(tip);
  return g;
}

// 축구공 무늬 텍스처 (흰 바탕 + 검은 오각형 점)
function soccerTex() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#16181a';
  const pent = (x, y, r) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); };
  for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) pent((i + (row % 2) * 0.5) * 512 / 6, 20 + row * 72, 22);
  g.strokeStyle = '#9a9a96'; g.lineWidth = 2;
  for (let i = 0; i < 24; i++) { g.beginPath(); g.moveTo(R() * 512, R() * 256); g.lineTo(R() * 512, R() * 256); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _soccer = null;
export function makeSoccer() {
  if (!_soccer) _soccer = soccerTex();
  return mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ map: _soccer, roughness: 0.45, metalness: 0.0 }));
}

// 지우개 (가로 2, 세로 1, 높이 0.7)
export function makeEraser() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2, 0.7, 1), std(0xf2a6b8, { roughness: 0.9, metalness: 0 })));
  const sl = mesh(new THREE.BoxGeometry(1.2, 0.72, 1.02), std(0x3e74c9, { roughness: 0.6, metalness: 0 })); sl.position.x = 0.45; g.add(sl);
  return g;
}

// 장난감 블록 (모양: 0 상자, 1 원기둥, 2 삼각, 3 아치), 크기 1
export const BLOCK_COLS = [0xe23a3a, 0xf3c13a, 0x2f86e0, 0x3db35f, 0xf07f2a, 0x9a4fd0];
export function makeBlock(kind, color) {
  const m = std(color, { roughness: 0.35, metalness: 0.05 });
  if (kind === 1) return mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), m);
  if (kind === 2) { const s = new THREE.Shape(); s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0, 0.5); const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); geo.translate(0, 0, -0.5); return mesh(geo, m); }
  return mesh(new THREE.BoxGeometry(1, 1, 1), m);
}

// 자기장 핵 (반지름 1)
export function makeMagCore() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), glow(0x9fd8ff, 1)));
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), glow(0x58a8ff, 0.8)); t.rotation.set(R() * 3, R() * 3, 0); g.add(t); }
  return g;
}
// 뭉쳐진 금속 덩어리 (반지름 1)
export function makeScrapBall() {
  return mesh(lumpy(new THREE.IcosahedronGeometry(1, 3), 0.35, 5), std(0x55585c, { metalness: 0.85, roughness: 0.45, flatShading: true }));
}

// 떠돌이 블랙홀: 검은 구 + 강착원반 + 빛 고리 (반지름 1)
export function makeBlackHole() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const disk = new THREE.Mesh(new THREE.RingGeometry(1.3, 4.2, 96, 1), new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; varying vec2 vP;
      void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
        float band = 0.6 + 0.4 * sin(a * 7.0 - uT * 3.0 + r * 6.0);
        float k = smoothstep(4.2, 1.6, r) * smoothstep(1.3, 1.6, r);
        vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.75), smoothstep(3.0, 1.4, r));
        gl_FragColor = vec4(c * band * k * 1.6, k); }`,
  }));
  disk.rotation.x = -Math.PI / 2 + 0.25; g.add(disk);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 8, 64), glow(0xffd8a0, 0.9)); g.add(halo);
  g.userData.disk = disk; g.userData.halo = halo;
  return g;
}

// 행성 파괴 요새: 팔면체 결정 본체 + 도는 고리 + 꼭짓점 발사구 (반지름 1)
export function makeFortress() {
  const g = new THREE.Group();
  const hull = std(0x5a5f66, { metalness: 0.8, roughness: 0.35, flatShading: true });
  const core = mesh(new THREE.OctahedronGeometry(1, 1), hull); core.scale.set(1, 1.25, 1); g.add(core);
  // 면에 박힌 불빛
  const lights = new THREE.Group();
  for (let i = 0; i < 160; i++) { const v = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(); const d = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), glow(0xbff6ff, 1)); d.position.copy(v.multiplyScalar(0.82)); lights.add(d); }
  g.add(lights);
  const rings = [];
  for (let i = 0; i < 2; i++) { const r = mesh(new THREE.TorusGeometry(1.55 + i * 0.25, 0.05, 6, 96), hull); r.rotation.x = Math.PI / 2 + (i ? 0.3 : -0.2); g.add(r); rings.push(r); }
  const emit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), glow(0x7dffb0, 1)); emit.position.set(0, 0, 1.0); g.add(emit);
  g.userData.rings = rings; g.userData.emit = emit;
  return g;
}

// 거대 모래벌레: 마디 몸통 + 세 갈래 입 (길이 방향 = +Y, 반지름 1)
export function makeWorm(segs = 14) {
  const g = new THREE.Group();
  const skin = std(0x8c7258, { roughness: 0.95, metalness: 0 });
  const parts = [];
  for (let i = 0; i < segs; i++) {
    const s = mesh(new THREE.CylinderGeometry(1, 1.02, 1.1, 20, 1, true), skin);
    const ring = mesh(new THREE.TorusGeometry(1.02, 0.08, 6, 20), std(0x6e5640, { roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; s.add(ring);
    g.add(s); parts.push(s);
  }
  // 입: 꽃잎처럼 벌어지는 세 턱 + 이빨
  const jaw = new THREE.Group();
  const petals = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group(); p.rotation.y = i * Math.PI * 2 / 3;
    const plate = mesh(new THREE.CylinderGeometry(0.15, 1.0, 1.6, 10, 1, true, -0.95, 1.9), skin); plate.position.y = 0.8; p.add(plate);
    for (let k = 0; k < 6; k++) { const t = mesh(new THREE.ConeGeometry(0.06, 0.4, 5), std(0xe8e2d0, { roughness: 0.4 })); t.position.set(Math.sin(-0.8 + k * 0.32) * 0.7, 0.9 + k * 0.05, Math.cos(-0.8 + k * 0.32) * 0.7); t.rotation.x = -1.2; p.add(t); }
    jaw.add(p); petals.push(p);
  }
  const maw = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: 0x1a0a06 })); maw.rotation.x = -Math.PI / 2; maw.position.y = 0.05; jaw.add(maw);
  g.add(jaw);
  g.userData = { parts, jaw, petals };
  return g;
}

// 공룡 (앞 = +Z): kind 0 = 두 발 육식, 1 = 목 긴 초식. 높이 약 1
export function makeDino(kind = 0, color = 0x5b6a3a) {
  const g = new THREE.Group();
  const m = std(color, { roughness: 0.9, metalness: 0 });
  const legs = [];
  if (kind === 0) {
    const body = mesh(new THREE.SphereGeometry(0.28, 12, 10), m); body.scale.set(0.8, 0.8, 1.5); body.position.y = 0.62; g.add(body);
    const neck = mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.35, 8), m); neck.position.set(0, 0.8, 0.35); neck.rotation.x = 0.7; g.add(neck);
    const head = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.42), m); head.position.set(0, 0.95, 0.58); g.add(head);
    const jaw = mesh(new THREE.BoxGeometry(0.17, 0.06, 0.34), m); jaw.position.set(0, 0.83, 0.56); g.add(jaw);
    const tail = mesh(new THREE.ConeGeometry(0.15, 0.95, 8), m); tail.rotation.x = -Math.PI / 2 - 0.15; tail.position.set(0, 0.66, -0.75); g.add(tail);
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.14, 0.55, -0.02);
      const th = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.32, 6), m); th.position.y = -0.16; leg.add(th);
      const sh = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.26, 6), m); sh.position.set(0, -0.42, -0.04); sh.rotation.x = 0.3; leg.add(sh);
      g.add(leg); legs.push(leg);
      const arm = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.14, 5), m); arm.position.set(s * 0.12, 0.6, 0.3); arm.rotation.x = 0.9; g.add(arm);
    }
  } else {
    const body = mesh(new THREE.SphereGeometry(0.3, 14, 10), m); body.scale.set(0.9, 0.75, 1.3); body.position.y = 0.42; g.add(body);
    const neck = mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.8, 8), m); neck.position.set(0, 0.75, 0.5); neck.rotation.x = 0.6; g.add(neck);
    const head = mesh(new THREE.SphereGeometry(0.07, 8, 6), m); head.scale.set(0.8, 0.7, 1.4); head.position.set(0, 1.08, 0.75); g.add(head);
    const tail = mesh(new THREE.ConeGeometry(0.1, 1.0, 8), m); tail.rotation.x = -Math.PI / 2 - 0.05; tail.position.set(0, 0.42, -0.85); g.add(tail);
    for (const [x, z] of [[-0.16, 0.22], [0.16, 0.22], [-0.16, -0.22], [0.16, -0.22]]) {
      const leg = new THREE.Group(); leg.position.set(x, 0.32, z);
      const l = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 7), m); l.position.y = -0.16; leg.add(l);
      g.add(leg); legs.push(leg);
    }
  }
  g.userData.legs = legs; g.userData.kind = kind;
  return g;
}

// 기후 조절 위성 (중심 기준, 길이 약 2)
export function makeClimateSat() {
  const g = new THREE.Group();
  const bus = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 12), std(0xd0d0d0, { metalness: 0.7, roughness: 0.3 })); bus.rotation.z = Math.PI / 2; g.add(bus);
  const panel = std(0x1c2c5a, { metalness: 0.6, roughness: 0.25 });
  for (const s of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(1.2, 0.02, 0.5), panel); p.position.x = s * 1.1; g.add(p); }
  const dish = mesh(new THREE.SphereGeometry(0.35, 14, 8, 0, Math.PI * 2, 0, 1.1), std(0xeeeeee, { side: THREE.DoubleSide })); dish.rotation.x = Math.PI; dish.position.y = -0.4; g.add(dish);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow(0xff3030, 1)); lamp.position.y = 0.35; g.add(lamp);
  g.userData.lamp = lamp;
  return g;
}

// 코드 문자 텍스처 (4×4 글자 묶음, 초록)
let _glyphTex = null;
export function glyphTexture() {
  if (_glyphTex) return _glyphTex;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 256);
  g.font = 'bold 52px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = '01ΔΣΞΨ<>/{}#$%&@';
  for (let i = 0; i < 16; i++) { g.fillStyle = '#7dff9a'; g.fillText(chars[i], (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34); }
  _glyphTex = new THREE.CanvasTexture(cv);
  return _glyphTex;
}

export { glow, std, mesh };

// 전함 (앞 = +Z, 길이 약 2). userData.guns: 포신 끝 위치(로컬) 목록
export function makeWarship() {
  const g = new THREE.Group();
  const hullM = std(0x5a6068, { metalness: 0.5, roughness: 0.5 }), deck = std(0x6e6a60, { roughness: 0.8, metalness: 0.1 }), dark = std(0x2e3238, { metalness: 0.6 });
  const shp = new THREE.Shape(); shp.moveTo(0, 1); shp.lineTo(0.13, 0.55); shp.lineTo(0.14, -0.9); shp.lineTo(-0.14, -0.9); shp.lineTo(-0.13, 0.55); shp.lineTo(0, 1);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 0.12, bevelEnabled: false }), hullM); hull.rotation.x = Math.PI / 2; hull.position.y = 0.06; g.add(hull);
  const d = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 0.01, bevelEnabled: false }), deck); d.rotation.x = Math.PI / 2; d.position.y = 0.075; d.scale.set(0.95, 0.97, 1); g.add(d);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.22), hullM); bridge.position.set(0, 0.15, -0.1); g.add(bridge);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.22, 6), dark); mast.position.set(0, 0.32, -0.12); g.add(mast);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.1, 10), dark); funnel.position.set(0, 0.17, -0.32); g.add(funnel);
  const guns = [];
  for (const z of [0.55, 0.3, -0.6]) {
    const t = new THREE.Group(); t.position.set(0, 0.1, z); if (z < 0) t.rotation.y = Math.PI;
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 12), hullM));
    for (const x of [-0.02, 0.02]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.2, 6), dark); b.rotation.x = Math.PI / 2 - 0.25; b.position.set(x, 0.03, 0.11); t.add(b); }
    g.add(t); guns.push(t);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.guns = guns;
  return g;
}
