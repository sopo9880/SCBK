// v1.2 무기 모델 (모두 자체 디자인, 절차적 생성)
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...o });
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = false; return m; }
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

function lumpy(geo, amt, seed = 1) {
  const p = geo.getAttribute('position');
  let s = seed;
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

// 자폭 드론: X자 쿼드콥터 (앞쪽 = +Z)
export function makeDrone() {
  const g = new THREE.Group();
  const body = std(0x2d3238, { metalness: 0.5 });
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 1.4), body));
  const arm = new THREE.BoxGeometry(2.6, 0.12, 0.16);
  const a1 = mesh(arm, body); a1.rotation.y = Math.PI / 4; g.add(a1);
  const a2 = mesh(arm, body); a2.rotation.y = -Math.PI / 4; g.add(a2);
  const rotors = [];
  for (const [x, z] of [[0.92, 0.92], [-0.92, 0.92], [0.92, -0.92], [-0.92, -0.92]]) {
    const r = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.35, depthWrite: false }), false);
    r.position.set(x, 0.18, z); g.add(r); rotors.push(r);
  }
  const eye = mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0xff3020), false); eye.position.set(0, 0, 0.72); g.add(eye);
  const pay = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 8), std(0x5a6a3a)); pay.rotation.x = Math.PI / 2; pay.position.y = -0.35; g.add(pay);
  g.userData = { rotors };
  return g;
}

// 순항미사일 (앞쪽 = +Z)
export function makeCruise() {
  const g = new THREE.Group();
  const white = std(0xd9dcdf, { metalness: 0.4, roughness: 0.4 });
  const b = mesh(new THREE.CylinderGeometry(0.42, 0.42, 6, 14), white); b.rotation.x = Math.PI / 2; g.add(b);
  const nose = mesh(new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), white); nose.rotation.x = Math.PI / 2; nose.position.z = 3; g.add(nose);
  const wing = mesh(new THREE.BoxGeometry(4.2, 0.06, 0.6), white); wing.position.set(0, -0.1, 0.4); g.add(wing);
  for (let k = 0; k < 4; k++) { const f = mesh(new THREE.BoxGeometry(0.05, 0.9, 0.6), white); const a = k * Math.PI / 2 + Math.PI / 4; f.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, -2.7); f.rotation.z = a; g.add(f); }
  const intake = mesh(new THREE.BoxGeometry(0.4, 0.28, 1), std(0x333333)); intake.position.set(0, -0.45, -1.4); g.add(intake);
  return g;
}

// 함포탄 (앞쪽 = -Y)
export function makeShell() {
  const g = new THREE.Group();
  const m = std(0x8a7a52, { metalness: 0.8, roughness: 0.3, emissive: 0xff7020, emissiveIntensity: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 10), m));
  const tip = mesh(new THREE.ConeGeometry(0.4, 1.0, 10), m); tip.rotation.x = Math.PI; tip.position.y = -1.3; g.add(tip);
  return g;
}

// 기차 (기관차 + 화차, 앞쪽 = +Z). userData.cars: 각 차량 그룹(길이 L)
export function makeTrain(nCars = 6) {
  const g = new THREE.Group();
  const red = std(0x8e2a20, { metalness: 0.4, roughness: 0.5 });
  const dark = std(0x24262a, { metalness: 0.6, roughness: 0.45 });
  const yellow = std(0xe0b028, { roughness: 0.6 });
  const tank = std(0x3a3d42, { metalness: 0.5, roughness: 0.4 });
  const wheelGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.4, 12); wheelGeo.rotateZ(Math.PI / 2);
  const cars = [];
  const addWheels = (car, L) => { for (const z of [-L * 0.32, L * 0.32]) for (const x of [-1.25, 1.25]) { const w = mesh(wheelGeo, dark); w.position.set(x, 0.7, z); car.add(w); } };
  // 기관차
  const loco = new THREE.Group();
  const L0 = 16;
  const base = mesh(new THREE.BoxGeometry(3.2, 0.8, L0), dark); base.position.y = 1.4; loco.add(base);
  const hood = mesh(new THREE.BoxGeometry(2.8, 2.6, L0 * 0.62), red); hood.position.set(0, 3.1, -L0 * 0.16); loco.add(hood);
  const cab = mesh(new THREE.BoxGeometry(3.1, 3.6, 4), red); cab.position.set(0, 3.6, L0 * 0.28); loco.add(cab);
  const win = mesh(new THREE.BoxGeometry(2.6, 1.0, 0.1), std(0x10161c, { metalness: 0.9, roughness: 0.1 })); win.position.set(0, 4.4, L0 * 0.28 + 2.02); loco.add(win);
  const stripe = mesh(new THREE.BoxGeometry(3.25, 0.35, L0 * 0.98), yellow); stripe.position.y = 2.0; loco.add(stripe);
  const lamp = mesh(new THREE.SphereGeometry(0.35, 8, 6), glow(0xfff2c0), false); lamp.position.set(0, 5.6, L0 * 0.28 + 2.05); loco.add(lamp);
  addWheels(loco, L0); loco.userData.L = L0; g.add(loco); cars.push(loco);
  // 위험물 탱크차
  for (let i = 1; i < nCars; i++) {
    const car = new THREE.Group(); const L = 13;
    const b = mesh(new THREE.BoxGeometry(3, 0.6, L), dark); b.position.y = 1.3; car.add(b);
    const t = mesh(new THREE.CapsuleGeometry(1.5, L - 3.4, 6, 14), tank); t.rotation.x = Math.PI / 2; t.position.y = 3.1; car.add(t);
    const band = mesh(new THREE.CylinderGeometry(1.53, 1.53, 1.2, 14, 1, true), std(0xd04010, { side: THREE.DoubleSide })); band.rotation.x = Math.PI / 2; band.position.y = 3.1; car.add(band);
    addWheels(car, L); car.userData.L = L; g.add(car); cars.push(car);
  }
  g.userData = { cars };
  return g;
}

// 소행성: 울퉁불퉁한 큰 바위 + 달아오른 앞면
export function makeAsteroid() {
  const geo = lumpy(new THREE.IcosahedronGeometry(1, 3), 0.45, 7);
  return mesh(geo, std(0x3b3430, { roughness: 1, metalness: 0, emissive: 0xff4a10, emissiveIntensity: 0.9, flatShading: true }));
}

// 외계 모선: 거대한 원반 + 아래쪽 발광부 (원점 = 중심)
export function makeMothership() {
  const g = new THREE.Group();
  const hull = std(0x3a3f47, { metalness: 0.7, roughness: 0.35 });
  const hull2 = std(0x262a30, { metalness: 0.8, roughness: 0.3 });
  const prof = [[0, 18], [60, 16], [180, 10], [330, 2], [360, -2], [330, -6], [200, -12], [80, -16], [0, -17]].map(([r, y]) => new THREE.Vector2(r, y));
  const disc = mesh(new THREE.LatheGeometry(prof, 96), hull); g.add(disc);
  const dome = mesh(new THREE.SphereGeometry(70, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hull2); dome.scale.y = 0.45; dome.position.y = 16; g.add(dome);
  // 테두리 고리와 패널
  for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(140 + i * 70, 2.5, 6, 96), hull2); r.rotation.x = Math.PI / 2; r.position.y = 12 - i * 3.5; g.add(r); }
  const lights = [];
  const lm = glow(0x66d9ff, 0.9);
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const l = mesh(new THREE.SphereGeometry(4, 8, 6), lm, false); l.position.set(Math.cos(a) * 345, -3, Math.sin(a) * 345); g.add(l); lights.push(l);
  }
  // 아래쪽 무기 발광부
  const coreMat = glow(0x7fe0ff, 0);
  const core = mesh(new THREE.CircleGeometry(48, 48), coreMat, false); core.rotation.x = Math.PI / 2; core.position.y = -17.5; g.add(core);
  const ring = mesh(new THREE.RingGeometry(52, 64, 64), glow(0x3fa0ff, 0.5), false); ring.rotation.x = Math.PI / 2; ring.position.y = -17.2; g.add(ring);
  g.userData = { core, coreMat, ring, lights };
  return g;
}

// 태양 렌즈: 거대한 볼록 렌즈 + 테두리
export function makeLens() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), glass); lens.scale.set(1, 0.12, 1); g.add(lens);
  const rim = mesh(new THREE.TorusGeometry(60, 3.2, 10, 96), std(0xc9a646, { metalness: 0.9, roughness: 0.25 }), false); rim.rotation.x = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 6; i++) { const s = mesh(new THREE.BoxGeometry(2, 2, 18), std(0xa88a3a, { metalness: 0.9, roughness: 0.3 }), false); const a = i / 6 * Math.PI * 2; s.position.set(Math.cos(a) * 68, 0, Math.sin(a) * 68); s.rotation.y = -a; g.add(s); }
  return g; // 렌즈 면은 XZ 평면, 법선 = +Y
}

// 신의 손가락: 구름에서 내려온 팔 + 검지 (원점 = 손가락 끝, 위쪽 = +Y)
export function makeFinger() {
  const g = new THREE.Group();
  const skin = std(0xd6a687, { roughness: 0.7, metalness: 0 });
  const nail = std(0xf1d8cc, { roughness: 0.3, metalness: 0.05 });
  const tip = mesh(new THREE.CapsuleGeometry(5, 14, 8, 18), skin); tip.position.y = 12; g.add(tip);
  const mid = mesh(new THREE.CapsuleGeometry(5.6, 16, 8, 18), skin); mid.position.y = 34; mid.rotation.z = 0.05; g.add(mid);
  const base = mesh(new THREE.CapsuleGeometry(6.2, 16, 8, 18), skin); base.position.y = 57; base.rotation.z = 0.1; g.add(base);
  const nl = mesh(new THREE.SphereGeometry(4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), nail); nl.scale.set(1, 0.3, 1.25); nl.rotation.x = -Math.PI / 2 + 0.2; nl.position.set(0, 9, 4.2); g.add(nl);
  // 손등·주먹(나머지 손가락은 접힘)
  const hand = mesh(new THREE.BoxGeometry(30, 34, 18, 2, 2, 2), skin); hand.position.set(-8, 84, -2); g.add(hand);
  for (let i = 0; i < 3; i++) { const k = mesh(new THREE.CapsuleGeometry(5, 8, 6, 12), skin); k.rotation.x = Math.PI / 2; k.position.set(-10 - i * 9.5 + 6, 70, 6); g.add(k); }
  const thumb = mesh(new THREE.CapsuleGeometry(5.5, 16, 6, 12), skin); thumb.position.set(10, 74, 4); thumb.rotation.z = -0.9; g.add(thumb);
  const arm = mesh(new THREE.CylinderGeometry(16, 20, 420, 20), skin); arm.position.set(-8, 310, -2); g.add(arm);
  const sleeve = mesh(new THREE.CylinderGeometry(24, 26, 60, 20), std(0xf3f0ea, { roughness: 0.9, metalness: 0 })); sleeve.position.set(-8, 360, -2); g.add(sleeve);
  return g;
}

// 바위 거인 (원점 = 발 사이 바닥, 앞쪽 = +Z). 관절: hipL/hipR/kneeL/kneeR/shoulderL/shoulderR/head
export function makeGolem() {
  const g = new THREE.Group();
  const rock = std(0x4a4440, { roughness: 1, metalness: 0, flatShading: true });
  const rock2 = std(0x5c544c, { roughness: 1, metalness: 0, flatShading: true });
  const magma = new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff5a10, emissiveIntensity: 2.4, roughness: 1 });
  const boulder = (r, seed, m = rock) => mesh(lumpy(new THREE.IcosahedronGeometry(r, 1), 0.4, seed), m);
  const joint = (parent, x, y, z) => { const j = new THREE.Object3D(); j.position.set(x, y, z); parent.add(j); return j; };
  const pelvis = joint(g, 0, 78, 0);
  // 몸통
  const torso = joint(pelvis, 0, 0, 0);
  const belly = boulder(22, 3); belly.scale.set(1.1, 0.9, 0.9); belly.position.y = 12; torso.add(belly);
  const chest = boulder(30, 5, rock2); chest.scale.set(1.35, 0.95, 0.95); chest.position.y = 48; torso.add(chest);
  const core = mesh(new THREE.IcosahedronGeometry(9, 1), magma, false); core.position.set(0, 46, 24); torso.add(core);
  for (let i = 0; i < 7; i++) { const c = mesh(new THREE.BoxGeometry(2, 14 + i * 2, 2), magma, false); c.position.set((i - 3) * 9, 32 + (i % 2) * 14, 26 - Math.abs(i - 3) * 2); c.rotation.z = (i - 3) * 0.25; torso.add(c); }
  for (let i = 0; i < 4; i++) { const s = boulder(9 - i, 11 + i, rock2); s.position.set((i % 2 ? 1 : -1) * (20 + i * 6), 74 - i * 5, -10); torso.add(s); }
  const neck = joint(torso, 0, 72, 4);
  const head = boulder(14, 21, rock2); head.scale.set(1.1, 0.85, 1); head.position.y = 10; neck.add(head);
  for (const x of [-5.5, 5.5]) { const e = mesh(new THREE.SphereGeometry(2.6, 10, 8), magma, false); e.position.set(x, 11, 12); neck.add(e); }
  const jaw = mesh(new THREE.BoxGeometry(14, 3, 6), magma, false); jaw.position.set(0, 3, 11); neck.add(jaw);
  // 팔
  const shoulders = [];
  for (const s of [-1, 1]) {
    const sh = joint(torso, s * 44, 58, 0);
    const up = boulder(13, 31 + s, rock); up.scale.set(0.9, 1.6, 0.9); up.position.y = -20; sh.add(up);
    const el = joint(sh, 0, -40, 0);
    const lo = boulder(12, 41 + s, rock2); lo.scale.set(0.95, 1.5, 0.95); lo.position.y = -18; el.add(lo);
    const fist = boulder(14, 51 + s, rock); fist.position.y = -40; el.add(fist);
    shoulders.push({ sh, el, s });
  }
  // 다리
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(pelvis, s * 20, -4, 0);
    const th = boulder(14, 61 + s, rock); th.scale.set(1, 1.6, 1); th.position.y = -18; hip.add(th);
    const knee = joint(hip, 0, -38, 0);
    const sh = boulder(12, 71 + s, rock2); sh.scale.set(1, 1.55, 1); sh.position.y = -17; knee.add(sh);
    const foot = boulder(13, 81 + s, rock); foot.scale.set(1.1, 0.55, 1.5); foot.position.set(0, -34, 5); knee.add(foot);
    legs.push({ hip, knee, s });
  }
  g.userData = { pelvis, torso, neck, shoulders, legs, core, height: 175 };
  return g;
}

// 거대 볼링공: 반짝이는 표면 + 구멍 3개
export function makeBowlingBall() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x5a1c8c, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  g.add(mesh(new THREE.SphereGeometry(1, 40, 28), mat));
  const hole = new THREE.MeshBasicMaterial({ color: 0x050308 });
  for (const [a, b] of [[0.25, 0.2], [0.42, 0.05], [0.12, -0.12]]) {
    const h = mesh(new THREE.CircleGeometry(0.11, 16), hole, false);
    const dir = new THREE.Vector3(Math.sin(a), Math.cos(a) * Math.cos(b), Math.sin(b)).normalize();
    h.position.copy(dir).multiplyScalar(1.002); h.lookAt(dir.clone().multiplyScalar(2)); g.add(h);
  }
  return g;
}

// 초대형 수소폭탄 (앞쪽 = -Y)
export function makeTsarBomb() {
  const g = new THREE.Group();
  const mat = std(0x5b5f52, { roughness: 0.55, metalness: 0.45 });
  g.add(mesh(new THREE.CapsuleGeometry(2.6, 9, 8, 20), mat));
  const tail = mesh(new THREE.CylinderGeometry(2.2, 1.4, 3, 20), mat); tail.position.y = 6.8; g.add(tail);
  for (let k = 0; k < 4; k++) { const f = mesh(new THREE.BoxGeometry(0.2, 3.2, 3.4), mat); const a = k * Math.PI / 2; f.position.set(Math.cos(a) * 2.6, 7, Math.sin(a) * 2.6); f.rotation.y = -a; g.add(f); }
  const band = mesh(new THREE.CylinderGeometry(2.65, 2.65, 0.5, 20), std(0xb02020)); band.position.y = -1; g.add(band);
  return g;
}

// 낙하산 (원점 = 매달린 지점, 위로 펼쳐짐)
export function makeParachute() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe9e3d0, roughness: 0.9, side: THREE.DoubleSide });
  const canopy = mesh(new THREE.SphereGeometry(16, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), cloth); canopy.position.y = 26; canopy.scale.y = 0.6; g.add(canopy);
  const stripes = mesh(new THREE.SphereGeometry(16.05, 24, 10, 0, Math.PI * 2, Math.PI / 5, 0.12), new THREE.MeshStandardMaterial({ color: 0xc8402a, side: THREE.DoubleSide }), false); stripes.position.y = 26; stripes.scale.y = 0.6; g.add(stripes);
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * 13, 31, Math.sin(a) * 13); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x777066 })));
  return g;
}

// 반물질 격납 용기: 고리 + 떠 있는 발광 구
export function makeAntimatter() {
  const g = new THREE.Group();
  const metal = std(0xb8c0cc, { metalness: 0.95, roughness: 0.2 });
  const base = mesh(new THREE.CylinderGeometry(5, 6, 2, 24), metal); base.position.y = 1; g.add(base);
  const rings = [];
  for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 40), metal); r.position.y = 7; r.rotation.set(i * 1.05, i * 0.6, 0); g.add(r); rings.push(r); }
  const orbMat = glow(0xc8a8ff, 1);
  const orb = mesh(new THREE.SphereGeometry(1.6, 24, 16), orbMat, false); orb.position.y = 7; g.add(orb);
  const halo = mesh(new THREE.SphereGeometry(3, 24, 16), glow(0x7a5cff, 0.25), false); halo.position.y = 7; g.add(halo);
  g.userData = { rings, orb, halo };
  return g;
}

// 얼음 가시
export function makeIceSpike() {
  const geo = lumpy(new THREE.ConeGeometry(1, 4, 6, 3), 0.25, Math.floor(Math.random() * 1000) + 1);
  geo.translate(0, 2, 0);
  return mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85, emissive: 0x2a6a9a, emissiveIntensity: 0.25, flatShading: true }));
}

export const glowMat = glow;
