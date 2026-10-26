// 절차적으로 만드는 무기 모델 (텍스처 없음, 실존 기체 형상을 본뜨지 않은 자체 디자인)
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...o });
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = false; return m; }

export function makeBomb() {
  const g = new THREE.Group();
  const mat = std(0x3b4a32, { roughness: 0.5, metalness: 0.4 });
  g.add(mesh(new THREE.CapsuleGeometry(0.9, 2.6, 6, 12), mat));
  const fin = new THREE.BoxGeometry(2.4, 1.0, 0.12); fin.translate(0, 1.9, 0);
  g.add(mesh(fin, mat)); const f2 = mesh(fin, mat); f2.rotation.y = Math.PI / 2; g.add(f2);
  return g; // 앞쪽 = -Y
}

export function makeMissile() {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.35, 0.35, 4, 10), std(0xe8e8e8, { roughness: 0.4 })); b.rotation.x = Math.PI / 2; g.add(b);
  const nose = mesh(new THREE.ConeGeometry(0.35, 1.2, 10), std(0xc0392b)); nose.rotation.x = Math.PI / 2; nose.position.z = 2.6; g.add(nose);
  return g; // 앞쪽 = +Z
}

export function makeMeteor() {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const s = 0.8 + Math.random() * 0.35; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s); }
  geo.computeVertexNormals();
  return mesh(geo, std(0x3a2a20, { roughness: 1, metalness: 0, emissive: 0xff5a10, emissiveIntensity: 1.6, flatShading: true }));
}

export function makeNukeBomb() {
  const g = new THREE.Group();
  const mat = std(0x4d5338, { roughness: 0.5, metalness: 0.5 });
  g.add(mesh(new THREE.CapsuleGeometry(1.8, 5.5, 6, 16), mat));
  const band = mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.6, 16), std(0xf2c230)); band.position.y = 1.2; g.add(band);
  const band2 = band.clone(); band2.position.y = -0.6; g.add(band2);
  const fin = new THREE.BoxGeometry(4.6, 1.8, 0.2); fin.translate(0, 3.6, 0);
  g.add(mesh(fin, mat)); const f2 = mesh(fin, mat); f2.rotation.y = Math.PI / 2; g.add(f2);
  return g; // 앞쪽 = -Y
}

export function makeBall() { return mesh(new THREE.SphereGeometry(1, 28, 20), std(0x2a2c30, { roughness: 0.25, metalness: 0.9 })); }

export function makeRod() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 9, 10), std(0x9aa2a8, { metalness: 0.95, roughness: 0.2, emissive: 0xff7a30, emissiveIntensity: 0.6 })));
  const tip = mesh(new THREE.ConeGeometry(0.45, 1.4, 10), std(0xffd0a0, { emissive: 0xffa060, emissiveIntensity: 3 })); tip.rotation.x = Math.PI; tip.position.y = -5.2; g.add(tip);
  return g; // 앞쪽 = -Y
}

export function makeWarhead() {
  const g = new THREE.Group();
  const c = mesh(new THREE.ConeGeometry(0.9, 3.2, 14), std(0x2b2b2e, { emissive: 0xff5a1a, emissiveIntensity: 1.2 }));
  c.rotation.x = Math.PI; g.add(c); // 앞쪽 = -Y
  return g;
}

// 폭격기: 후퇴익 4발 제트 (앞쪽 = +Z)
export function makeBomber() {
  const g = new THREE.Group();
  const body = std(0xb9bec4, { metalness: 0.6, roughness: 0.35 });
  const dark = std(0x2c3036, { metalness: 0.4, roughness: 0.5 });
  // 동체: 회전체
  const prof = [];
  const L = 46, R = 2.4;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, z = -L / 2 + t * L;
    let r = R;
    if (t < 0.12) r = R * (0.35 + 0.65 * Math.sin((t / 0.12) * Math.PI / 2));     // 꼬리 쪽 가늘게
    else if (t > 0.8) r = R * Math.cos(((t - 0.8) / 0.2) * Math.PI / 2) ** 0.7; // 기수
    prof.push(new THREE.Vector2(Math.max(0.05, r), z));
  }
  const fus = new THREE.LatheGeometry(prof, 18); fus.rotateX(Math.PI / 2);
  g.add(mesh(fus, body));
  // 조종석 창
  const win = mesh(new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), std(0x111820, { metalness: 0.9, roughness: 0.1 }));
  win.scale.set(1, 0.55, 1.8); win.position.set(0, 1.6, L * 0.33); g.add(win);
  // 날개 (후퇴익)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 6); wingShape.lineTo(25, -7); wingShape.lineTo(25, -10); wingShape.lineTo(0, -6); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.7, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2); wingGeo.translate(0, 0.2, 2);
  const wR = mesh(wingGeo, body); g.add(wR);
  const wL = mesh(wingGeo.clone().scale(-1, 1, 1), body); g.add(wL);
  // 엔진 4개
  const pod = new THREE.CylinderGeometry(1.0, 1.1, 6.5, 12); pod.rotateX(Math.PI / 2);
  const intake = new THREE.CircleGeometry(0.85, 12);
  for (const x of [-15, -8, 8, 15]) {
    const zz = 2 - Math.abs(x) * 0.52 + 1;
    const e = mesh(pod, dark); e.position.set(x, -1.1, zz); g.add(e);
    const it = mesh(intake, std(0x050505), false); it.position.set(x, -1.1, zz + 3.26); g.add(it);
  }
  // 꼬리날개
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-9, 0); fin.lineTo(-13, 10); fin.lineTo(-9, 10); fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.5, bevelEnabled: false }); finGeo.rotateY(-Math.PI / 2); finGeo.translate(0.25, 1.5, -L / 2 + 13);
  g.add(mesh(finGeo, body));
  const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(9, -4); st.lineTo(9, -6); st.lineTo(0, -5); st.closePath();
  const stGeo = new THREE.ExtrudeGeometry(st, { depth: 0.4, bevelEnabled: false }); stGeo.rotateX(Math.PI / 2); stGeo.translate(0, 1.0, -L / 2 + 10);
  g.add(mesh(stGeo, body)); g.add(mesh(stGeo.clone().scale(-1, 1, 1), body));
  // 폭탄창 문 (힌지: 동체 아래 좌우)
  const doors = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Object3D(); hinge.position.set(s * 1.4, -2.0, 0);
    const d = mesh(new THREE.BoxGeometry(1.4, 0.15, 9), dark); d.position.set(-s * 0.7, 0, 0);
    hinge.add(d); g.add(hinge); doors.push({ hinge, s });
  }
  // 날개 끝 표시등
  const navR = mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0x33ff55 }), false); navR.position.set(25, 0.4, -6); g.add(navR);
  const navL = mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }), false); navL.position.set(-25, 0.4, -6); g.add(navL);
  g.userData = { doors, bayPos: new THREE.Vector3(0, -2.4, 0), engines: [[-15, -1.1, -1.8], [-8, -1.1, 1.8], [8, -1.1, 1.8], [15, -1.1, -1.8]], length: L };
  return g;
}

// ICBM: 3단 + 탄두부 (앞쪽 = +Y, 바닥이 원점)
export function makeICBM() {
  const g = new THREE.Group();
  const white = std(0xe9ebee, { metalness: 0.2, roughness: 0.5 });
  const black = std(0x1d1f22, { metalness: 0.3, roughness: 0.5 });
  const nozzleMat = std(0x55575c, { metalness: 0.8, roughness: 0.3 });
  const stages = [];
  const spec = [[1.35, 14], [1.2, 9], [1.05, 5.5]];
  let y = 0;
  spec.forEach(([r, L], i) => {
    const st = new THREE.Group();
    const c = mesh(new THREE.CylinderGeometry(r, r, L, 20), white); c.position.y = L / 2; st.add(c);
    const band = mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.9, 20), black); band.position.y = L - 0.5; st.add(band);
    const nz = mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.75, 1.6, 14, 1, true), nozzleMat); nz.position.y = -0.7; st.add(nz);
    if (i === 0) for (let k = 0; k < 4; k++) {
      const fin = mesh(new THREE.BoxGeometry(0.15, 2.6, 1.6), black); const a = k * Math.PI / 2 + Math.PI / 4;
      fin.position.set(Math.cos(a) * (r + 0.6), 1.4, Math.sin(a) * (r + 0.6)); fin.rotation.y = -a; st.add(fin);
    }
    st.position.y = y; st.userData = { r, L, y0: y };
    g.add(st); stages.push(st);
    y += L;
  });
  const bus = new THREE.Group();
  const shroud = mesh(new THREE.ConeGeometry(1.05, 5, 20), white); shroud.position.y = 2.5; bus.add(shroud);
  const tipband = mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.4, 20), black); tipband.position.y = 0.2; bus.add(tipband);
  bus.position.y = y; g.add(bus);
  g.userData = { stages, bus, height: y + 5 };
  return g;
}

export function makeSilo() {
  const g = new THREE.Group();
  const conc = std(0x8d8a84, { metalness: 0, roughness: 0.95 });
  const pad = mesh(new THREE.CylinderGeometry(12, 13, 1.2, 32), conc); pad.position.y = 0.4; pad.receiveShadow = true; g.add(pad);
  const hole = mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 24), new THREE.MeshBasicMaterial({ color: 0x050505 }), false); hole.position.y = 1.05; g.add(hole);
  const doors = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Object3D(); hinge.position.set(s * 3.2, 1.1, 0);
    const d = mesh(new THREE.BoxGeometry(3.2, 0.7, 6.4), std(0x6e6c68, { metalness: 0.2, roughness: 0.8 })); d.position.set(-s * 1.6, 0.35, 0);
    hinge.add(d); g.add(hinge); doors.push({ hinge, s });
  }
  // 경고 줄무늬 링
  const ring = mesh(new THREE.RingGeometry(9, 10.5, 40), new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.8 }), false);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1.02; g.add(ring);
  g.userData = { doors };
  return g;
}

// 괴수 발: 원점 = 발바닥 중심, 다리는 위로 길게
export function makeFoot() {
  const g = new THREE.Group();
  const skin = std(0x3f4a3a, { metalness: 0.05, roughness: 0.85, flatShading: true });
  const claw = std(0xe8e0c8, { metalness: 0.1, roughness: 0.4 });
  const sole = mesh(new THREE.SphereGeometry(1, 14, 10), skin); sole.scale.set(9, 3.2, 12); sole.position.set(0, 2.6, -1); g.add(sole);
  for (const [x, z, s] of [[-6, 10, 1], [0, 12, 1.15], [6, 10, 1]]) {
    const t = mesh(new THREE.CapsuleGeometry(2.2 * s, 6 * s, 4, 10), skin); t.rotation.x = Math.PI / 2; t.position.set(x, 2.2, z); g.add(t);
    const c = mesh(new THREE.ConeGeometry(1.4 * s, 4 * s, 8), claw); c.rotation.x = Math.PI / 2; c.position.set(x, 1.6, z + 6 * s); g.add(c);
  }
  const heel = mesh(new THREE.ConeGeometry(1.3, 4, 8), claw); heel.rotation.x = -Math.PI / 2; heel.position.set(0, 1.5, -13); g.add(heel);
  const leg = mesh(new THREE.CylinderGeometry(6.5, 8.5, 160, 14), skin); leg.position.set(0, 84, -2); g.add(leg);
  // 비늘 띠
  for (let i = 0; i < 8; i++) { const r = mesh(new THREE.TorusGeometry(7.2 - i * 0.1, 0.6, 6, 14), skin); r.rotation.x = Math.PI / 2; r.position.set(0, 14 + i * 9, -2); g.add(r); }
  return g;
}
