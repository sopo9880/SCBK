// 영화 오마주 무기용 모델 (모두 새로 디자인한 형태)
import * as THREE from 'three';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.5, ...o });
const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
function sh(g) { g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; }

// 테라포밍 엔진: 세 다리로 땅을 짚는 거대 기계, 아래로 중력 빔 (원점 = 바닥 중심)
export function makeEngine() {
  const g = new THREE.Group();
  const hull = std(0x2c2f36, { metalness: 0.8, roughness: 0.35 }), dark = std(0x16181c, { metalness: 0.7 });
  const H = 260;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(26, 40, 90, 6), hull); core.position.y = H; g.add(core);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(70, 26, 30, 6), hull); crown.position.y = H + 60; g.add(crown);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(14, 120, 6), dark); spire.position.y = H + 135; g.add(spire);
  const arms = new THREE.Group(); arms.position.y = H + 60; g.add(arms);
  for (let i = 0; i < 6; i++) { const a = new THREE.Mesh(new THREE.BoxGeometry(150, 8, 14), dark); a.rotation.y = i / 6 * Math.PI; arms.add(a); }
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const up = new THREE.Vector3(Math.cos(a) * 34, H - 20, Math.sin(a) * 34), foot = new THREE.Vector3(Math.cos(a) * 170, 0, Math.sin(a) * 170);
    const mid = up.clone().lerp(foot, 0.5).add(new THREE.Vector3(Math.cos(a) * 40, 60, Math.sin(a) * 40));
    for (const [p, q] of [[up, mid], [mid, foot]]) {
      const len = p.distanceTo(q);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, len, 6), hull);
      seg.position.copy(p).lerp(q, 0.5); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
      g.add(seg);
    }
    const claw = new THREE.Mesh(new THREE.ConeGeometry(16, 40, 6), dark); claw.position.copy(foot).add(new THREE.Vector3(0, 10, 0)); claw.rotation.x = Math.PI; g.add(claw);
    legs.push(foot);
  }
  const eyeMat = glow(0x9fd8ff, 0);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(22, 30, 6, 6), eyeMat); eye.position.y = H - 47; g.add(eye);
  const beamMat = glow(0xa8dcff, 0);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(24, 30, H - 50, 24, 1, true), beamMat); beam.position.y = (H - 50) / 2; g.add(beam);
  for (const m of [eye, beam]) m.renderOrder = 12;
  g.userData = { arms, eyeMat, beamMat, beam, H, legs, core };
  return sh(g);
}

// 수호자: 빛나는 갑옷의 비행 영웅 (망토 없음, 문장 없음) — 원점 = 몸 중심, 앞쪽 = +Z
export function makeGuardian() {
  const g = new THREE.Group();
  const armor = std(0xd8dde4, { metalness: 0.9, roughness: 0.2, emissive: 0x4a6a90, emissiveIntensity: 0.4 });
  const gold = std(0xd9b45a, { metalness: 0.95, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 6, 12), armor); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), armor); head.position.y = 1.05; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.1), glow(0x9fe8ff)); visor.position.set(0, 1.08, 0.28); g.add(visor);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow(0xbfeaff)); chest.position.set(0, 0.45, 0.42); g.add(chest);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.9, 4, 8), gold); arm.position.set(s * 0.6, 0.35, 0.2); arm.rotation.x = -1.2; g.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.0, 4, 8), armor); leg.position.set(s * 0.22, -1.1, -0.1); leg.rotation.x = 0.15; g.add(leg);
  }
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), glow(0x9fd8ff, 0.25)); g.add(aura);
  g.rotation.x = Math.PI / 2; // 날아가는 자세 (머리가 앞)
  const w = new THREE.Group(); w.add(g); return sh(w);
}

// 세 다리 침략자 (원점 = 바닥, 몸통 높이 H)
export function makeTripod() {
  const g = new THREE.Group();
  const hull = std(0x5a5f55, { metalness: 0.8, roughness: 0.3 }), dark = std(0x24261f);
  const H = 110;
  const body = new THREE.Group(); body.position.y = H; g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull); dome.scale.y = 0.55; body.add(dome);
  const under = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); under.scale.y = 0.35; body.add(under);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), glow(0xff3020)); eye.position.set(0, -2, 20); body.add(eye);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.5, 14, 8), dark); gun.rotation.x = Math.PI / 2; gun.position.set(0, -6, 22); body.add(gun);
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const hip = new THREE.Group(); const a = i / 3 * Math.PI * 2 + Math.PI / 6;
    hip.position.set(Math.cos(a) * 12, -4, Math.sin(a) * 12); hip.rotation.y = -a; body.add(hip);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 70, 6), hull); up.position.set(30, -24, 0); up.rotation.z = -1.0; hip.add(up);
    const knee = new THREE.Group(); knee.position.set(58, -46, 0); hip.add(knee);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 75, 6), hull); lo.position.set(4, -36, 0); lo.rotation.z = 0.1; knee.add(lo);
    legs.push({ hip, knee, a });
  }
  g.userData = { body, legs, eye, H };
  return sh(g);
}

// 세 다리 침략자 (새 디자인): 넓고 납작한 원반 머리 + 늘어진 촉수 + 앞쪽 열선 팔.
// 다리는 걸음마다 관절을 다시 계산하므로 머리와 따로 만들어 둠 (legs: [{thigh, shin, foot}])
export function makeTripodParts() {
  const hull = std(0x6f7468, { metalness: 0.75, roughness: 0.32 }), dark = std(0x2a2c26, { metalness: 0.6 }), joint = std(0x3c3f37, { metalness: 0.8 });
  const head = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), hull); top.scale.set(30, 7, 30); head.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(30, 2.2, 10, 64), dark); rim.rotation.x = Math.PI / 2; head.add(rim);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); bot.scale.set(28, 9, 28); head.add(bot);
  // 위쪽 등줄기와 아래쪽 발광 고리
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 26), joint); r.rotation.y = i / 6 * Math.PI; r.position.y = 5.5; head.add(r); }
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(16, 0.9, 8, 48), glow(0x8affc8, 0.85)); glowRing.rotation.x = Math.PI / 2; glowRing.position.y = -7.5; head.add(glowRing);
  // 앞쪽 "눈" 두 개
  for (const s2 of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), glow(0x9ff0ff, 1)); e.position.set(s2 * 6, -1.5, 28); head.add(e); }
  // 열선 팔 (앞쪽 아래에서 뻗어나온 마디 팔 + 덮개 + 발광 끝)
  const arm = new THREE.Group(); arm.position.set(0, -6, 22); head.add(arm);
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 14, 8), joint); a1.rotation.x = Math.PI / 2 + 0.5; a1.position.set(0, -3, 6); arm.add(a1);
  const cowl = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 12, 1, true), dark); cowl.rotation.x = -Math.PI / 2 - 0.5; cowl.position.set(0, -6.5, 13); arm.add(cowl);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), glow(0xffa060, 1)); tip.position.set(0, -7.5, 15); arm.add(tip);
  // 촉수: 아래로 늘어져 흔들리는 마디
  const tentacles = [];
  for (let k = 0; k < 5; k++) {
    const segs = []; let parent = head;
    const a = k / 5 * Math.PI * 2 + 0.3;
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      if (i === 0) g.position.set(Math.cos(a) * 10, -8, Math.sin(a) * 10); else g.position.y = -4.2;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9 - i * 0.1, 1.0 - i * 0.1, 4.4, 6), dark); m.position.y = -2.1; g.add(m);
      parent.add(g); segs.push(g); parent = g;
    }
    tentacles.push(segs);
  }
  // 다리 (머리와 따로)
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.3, 1, 8), hull);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 1, 8), hull);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), joint);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6, 2.5, 10), dark);
    for (const m of [thigh, shin, knee, foot]) m.castShadow = true;
    legs.push({ thigh, shin, knee, foot });
  }
  sh(head);
  return { head, arm, tip, tentacles, legs, glowRing };
}

// 거대 로봇 (원점 = 바닥, 앞쪽 = +Z, 키 약 140)
export function makeMech() {
  const g = new THREE.Group();
  const plate = std(0x3a4f7a, { metalness: 0.85, roughness: 0.35 }), dark = std(0x1c2230, { metalness: 0.8 }), acc = std(0xd8a030, { metalness: 0.8, roughness: 0.3 });
  const j = (p, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); return o; };
  const pelvis = j(g, 0, 62, 0);
  const torso = j(pelvis, 0, 0, 0);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(46, 40, 26), plate); chest.position.y = 30; torso.add(chest);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3, 16), glow(0x7fe0ff)); core.rotation.x = Math.PI / 2; core.position.set(0, 32, 13.5); torso.add(core);
  const head = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 14), plate); head.position.y = 58; torso.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 1), glow(0x7fe0ff)); visor.position.set(0, 59, 7.2); torso.add(visor);
  for (const s of [-1, 1]) { const pad = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 22), acc); pad.position.set(s * 31, 46, 0); torso.add(pad); }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh_ = j(torso, s * 31, 42, 0);
    const up = new THREE.Mesh(new THREE.BoxGeometry(11, 30, 11), dark); up.position.y = -15; sh_.add(up);
    const el = j(sh_, 0, -30, 0);
    const lo = new THREE.Mesh(new THREE.BoxGeometry(13, 28, 13), plate); lo.position.y = -14; el.add(lo);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(15, 13, 15), dark); fist.position.y = -32; el.add(fist);
    arms.push({ sh: sh_, el, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = j(pelvis, s * 13, -2, 0);
    const th = new THREE.Mesh(new THREE.BoxGeometry(14, 30, 14), dark); th.position.y = -15; hip.add(th);
    const kn = j(hip, 0, -30, 0);
    const sn = new THREE.Mesh(new THREE.BoxGeometry(15, 28, 15), plate); sn.position.y = -14; kn.add(sn);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(17, 6, 26), dark); ft.position.set(0, -29, 4); kn.add(ft);
    legs.push({ hip, kn, s });
  }
  g.userData = { pelvis, torso, arms, legs, core, height: 140 };
  return sh(g);
}

// 거대 유인원 (새 디자인: 회색 털, 긴 팔) — 원점 = 바닥, 앞쪽 = +Z
export function makeApe() {
  const g = new THREE.Group();
  const fur = std(0x3c3a38, { roughness: 1, metalness: 0, flatShading: true }), skin = std(0x5a4a42, { roughness: 0.9, metalness: 0 });
  const j = (p, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); return o; };
  const hips = j(g, 0, 34, 0);
  const torso = j(hips, 0, 0, 0); torso.rotation.x = 0.35;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), fur); belly.scale.set(1, 1.1, 0.85); belly.position.y = 12; torso.add(belly);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(21, 16, 12), fur); chest.scale.set(1.15, 0.9, 0.85); chest.position.y = 34; torso.add(chest);
  const neck = j(torso, 0, 50, 6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), fur); head.position.y = 6; neck.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), skin); face.scale.set(1, 0.85, 0.6); face.position.set(0, 4, 7); neck.add(face);
  for (const x of [-3, 3]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb040 })); e.position.set(x, 7, 10.5); neck.add(e); }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh_ = j(torso, s * 22, 40, 0);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(6, 26, 4, 8), fur); up.position.y = -16; sh_.add(up);
    const el = j(sh_, 0, -32, 0);
    const lo = new THREE.Mesh(new THREE.CapsuleGeometry(5.5, 26, 4, 8), fur); lo.position.y = -16; el.add(lo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(6.5, 10, 8), skin); hand.position.y = -33; el.add(hand);
    arms.push({ sh: sh_, el, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = j(hips, s * 10, 0, 0);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(6.5, 16, 4, 8), fur); th.position.y = -12; hip.add(th);
    const kn = j(hip, 0, -22, 0);
    const sn = new THREE.Mesh(new THREE.CapsuleGeometry(5, 12, 4, 8), fur); sn.position.y = -8; kn.add(sn);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 16), skin); ft.position.set(0, -14, 3); kn.add(ft);
    legs.push({ hip, kn, s });
  }
  g.userData = { hips, torso, neck, arms, legs, height: 110 };
  return sh(g);
}

// 상어 (단순한 형태)
export function makeShark() {
  const g = new THREE.Group();
  const m = std(0x6c7a86, { metalness: 0.1, roughness: 0.6 }), belly = std(0xd8dde0, { metalness: 0, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m); body.scale.set(0.55, 0.5, 2.2); g.add(body);
  const bl = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), belly); bl.scale.set(0.53, 0.45, 2.1); g.add(bl);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 4), m); fin.position.set(0, 0.7, 0.1); fin.rotation.x = -0.4; g.add(fin);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), m); tail.position.set(0, 0.2, -2.5); tail.rotation.x = -2.2; g.add(tail);
  const tail2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), m); tail2.position.set(0, -0.25, -2.4); tail2.rotation.x = -1.0; g.add(tail2);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.0, 4), m); p.position.set(s * 0.6, -0.2, 0.6); p.rotation.z = s * 1.9; g.add(p); }
  return sh(g);
}
