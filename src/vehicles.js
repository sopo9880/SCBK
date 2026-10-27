// 탈것 조종: 자동차 · 헬기 · 경비행기 · 전투기 · 폭격기
// 아케이드식 조작(GTA5 키 배치). 게임의 직접 조종(pilot) 장치를 그대로 씀
import * as THREE from 'three';
import { makeHeli, makeJet, std, glow } from './weapons/models4.js';
import { makeBomber, makeBomb, makeMissile } from './weapons/models.js';
import { buildRunway, buildHelipad, boxHitsBuilding, pointInBuilding, roofUnder } from './vehsite.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const UP = v3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);

// ---------- 모델 ----------
function makeCar() {
  const g = new THREE.Group();
  const paint = std(0xc0392b, { metalness: 0.6, roughness: 0.3 }), glass = std(0x1d2a35, { metalness: 0.9, roughness: 0.1 }), dark = std(0x1a1a1a, { roughness: 0.8, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.4), paint); body.position.y = 0.65; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass); cab.position.set(0, 1.2, -0.25); g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 1.9), paint); roof.position.set(0, 1.5, -0.3); g.add(roof);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w); }
  for (const x of [-0.65, 0.65]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow(0xfff4d0, 1)); l.position.set(x, 0.7, 2.2); g.add(l); const t = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xff2020, 0.9)); t.position.set(x, 0.75, -2.2); g.add(t); }
  g.traverse(o => { if (o.isMesh && o.material.castShadow !== false) o.castShadow = true; });
  g.userData.wheels = wheels;
  return g;
}
function makeLightPlane() {
  const g = new THREE.Group();
  const paint = std(0xf2f0e8, { metalness: 0.2, roughness: 0.5 }), stripe = std(0x2a6fd6, { metalness: 0.2 }), dark = std(0x222222);
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 5.5, 6, 12), paint); fus.rotation.x = Math.PI / 2; g.add(fus);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 1.5), paint); wing.position.set(0, 0.75, 0.5); g.add(wing);
  for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.13, 1.5), stripe); tip.position.set(s * 5.3, 0.75, 0.5); g.add(tip); }
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.9), paint); tailH.position.set(0, 0.2, -3.2); g.add(tailH);
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 1), stripe); tailV.position.set(0, 0.8, -3.2); g.add(tailV);
  const prop = new THREE.Group(); prop.position.z = 3.4;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.06), dark); prop.add(blade);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide })); prop.add(disc);
  g.add(prop);
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1d2a35, { metalness: 0.9, roughness: 0.1 })); win.position.set(0, 0.45, 1.2); win.scale.set(1, 0.8, 1.6); g.add(win);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.prop = prop;
  return g;
}

// ---------- 탈것 정의 ----------
// 조작은 GTA5 PC 기본 배치를 따름. 넘버패드가 없으면 I/K/J/L 이 8/5/4/6 대신
export const VEHICLES = [
  { id: 'car', name: '자동차', icon: '🚗', desc: 'W 가속 · S 브레이크/후진 · A/D 핸들 · Space 핸드브레이크 · Shift 부스트 · E 경적 · X 점프', air: false },
  { id: 'heli', name: '헬기', icon: '🚁', desc: 'W/S 상승/하강 · A/D 좌우 회전 · 넘버패드 8/5(I/K) 앞뒤 · 4/6(J/L) 옆으로 · Space·클릭 로켓 · Q·우클릭 기관포 · Tab 유도 미사일(락온)', air: true, pad: true },
  { id: 'plane', name: '경비행기', icon: '🛩', desc: 'W/S 스로틀 · A/D 방향타 · 넘버패드 8/5(I/K) 기수 내리기/올리기 · 4/6(J/L) 기울이기 · G 바퀴 · Space 연기', air: true, wing: true },
  { id: 'fighter', name: '전투기', icon: '✈', desc: 'W/S 스로틀 · Shift 애프터버너 · A/D 방향타 · 8/5(I/K) 기수 · 4/6(J/L) 기울이기 · G 바퀴 · Space·클릭 기관포 · Q·우클릭 미사일 · Tab 유도 미사일(락온)', air: true, wing: true },
  { id: 'bomber', name: '폭격기', icon: '🛫', desc: 'W/S 스로틀 · A/D 방향타 · 8/5(I/K) 기수 · 4/6(J/L) 기울이기 · G 바퀴 · Space·클릭 폭탄 · Q·우클릭 융단 투하 · Tab 유도 폭탄(락온)', air: true, wing: true },
];
const SPEC = {
  // acc: 지상 가속(스로틀 최대), vr: 이륙 속도, rw: 활주로 길이, rwW: 활주로 폭, sink: 부드러운 착륙 한계 강하율(m/s)
  plane: { vmin: 32, vmax: 85, stall: 28, boost: 0, turn: 0.9, pitch: 0.8, roll: 1.8, scale: 1.4, back: 22, up: 6, crash: 18, acc: 6, vr: 34, rw: 420, rwW: 30, sink: 10, snd: 'prop' },
  fighter: { vmin: 80, vmax: 320, stall: 70, boost: 430, turn: 1.4, pitch: 1.2, roll: 3.2, scale: 1.6, back: 34, up: 8, crash: 30, acc: 12, vr: 85, rw: 800, rwW: 40, sink: 10, snd: 'jet' },
  bomber: { vmin: 70, vmax: 170, stall: 60, boost: 0, turn: 0.45, pitch: 0.45, roll: 0.9, scale: 1.2, back: 75, up: 18, crash: 45, acc: 6, vr: 72, rw: 1000, rwW: 60, sink: 8, snd: 'bomber' },
};
const KEY = {
  rollL: ['Numpad4', 'KeyJ', 'ArrowLeft'], rollR: ['Numpad6', 'KeyL', 'ArrowRight'],
  noseDn: ['Numpad8', 'KeyI', 'ArrowUp'], noseUp: ['Numpad5', 'KeyK', 'ArrowDown'],
};

// 바퀴 (착륙 장치): 모델 크기에 맞춰 붙이고 접고 펼 수 있게
function addGear(mesh) {
  const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(v3());
  const gh = Math.max(0.6, size.y * 0.45), wr = Math.max(0.25, size.y * 0.16);
  const g = new THREE.Group(), mt = std(0x2a2a2a, { roughness: 0.7 }), tire = std(0x111111, { roughness: 0.9 });
  const leg = (x, z) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.25, wr * 0.25, gh, 6), mt); s.position.set(x, box.min.y - gh / 2 + 0.1, z); g.add(s);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, wr * 0.8, 12), tire); w.rotation.z = Math.PI / 2; w.position.set(x, box.min.y - gh + 0.1, z); g.add(w);
  };
  leg(0, box.max.z * 0.62);
  for (const sx of [-1, 1]) leg(sx * Math.max(size.x * 0.1, 0.9), box.min.z * 0.08);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  mesh.add(g);
  return { g, h: -box.min.y + gh - 0.1 + wr };
}

function hud(title, desc) {
  let el = document.getElementById('vehHud');
  if (!el) {
    el = document.createElement('div'); el.id = 'vehHud';
    el.innerHTML = '<div class="vh-title"></div><div class="vh-box"><div><span>속도</span><b class="vh-spd">0</b><small>km/h</small></div><div><span>고도</span><b class="vh-alt">0</b><small>m</small></div><div class="vh-thr"><span>스로틀</span><i><em></em></i></div><div class="vh-hp"><span>기체</span><i><em></em></i></div></div><div class="vh-land"></div><div class="vh-mode"></div><div class="vh-help"></div><div class="vh-warn"></div><div class="vh-lock" hidden><i></i><b></b></div>';
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.querySelector('.vh-title').textContent = title;
  el.querySelector('.vh-help').textContent = desc + ' · V 시점 · C 뒤 보기 · 마우스 둘러보기 · F/Esc 내리기';
  el.querySelector('.vh-mode').textContent = ''; el.querySelector('.vh-lock').hidden = true;
  return { el, spd: el.querySelector('.vh-spd'), alt: el.querySelector('.vh-alt'), thr: el.querySelector('.vh-thr em'), thrBox: el.querySelector('.vh-thr'), hp: el.querySelector('.vh-hp em'), hpBox: el.querySelector('.vh-hp'), land: el.querySelector('.vh-land'), warn: el.querySelector('.vh-warn'), mode: el.querySelector('.vh-mode'), lock: el.querySelector('.vh-lock') };
}

const groundAt = (game, x, z) => game.groundAt(x, z);
// 비행기 자세: 방향(yaw)·기수(pitch)·기울기(roll, + 왼쪽) ↔ 사원수
const qFromYPR = (yaw, pitch, roll, out = new THREE.Quaternion()) => {
  const a = new THREE.Quaternion().setFromAxisAngle(UP, yaw), b = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -pitch), c = new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), -roll);
  return out.copy(a).multiply(b).multiply(c);
};
const ypr = (q, st) => {
  const f = v3(0, 0, 1).applyQuaternion(q), u = v3(0, 1, 0).applyQuaternion(q), r = v3(1, 0, 0).applyQuaternion(q);
  st.pitch = Math.asin(clamp(f.y, -1, 1));
  if (Math.abs(f.y) < 0.999) st.yaw = Math.atan2(f.x, f.z);
  st.roll = Math.atan2(-r.y, u.y);
};

export function startVehicle(A, id, opts = {}) {
  const { game, D, fx, audio, grid, scene } = A.ctx;
  const def = VEHICLES.find(v => v.id === id); if (!def) return;
  const t0 = game.controls.target, camPos = game.camera.position;
  const fwd0 = v3(t0.x - camPos.x, 0, t0.z - camPos.z); if (fwd0.lengthSq() < 1) fwd0.set(0, 0, -1); fwd0.normalize();
  const S = A.S;
  const H = hud(def.name, def.desc);
  const steerMouse = game.cfg.vehMouse === 'steer';
  const st = {
    pos: v3(t0.x, 0, t0.z), vel: v3(), yaw: Math.atan2(fwd0.x, fwd0.z), pitch: 0, roll: 0, speed: 0, thr: 0.5, vy: 0,
    cam: 0, crashed: 0, smoke: false, cool: 0, cool2: 0, air: false, hitCD: new Map(), t: 0, hp: 100, prev: new Set(),
    lookYaw: 0, lookPitch: 0, lookIdle: 0, rpm: 1,
  };
  let mesh;
  if (id === 'car') {
    mesh = makeCar(); mesh.scale.setScalar(1.6);
    st.hl = 2.2 * 1.6; st.hw = 0.95 * 1.6;
    // 가장 가까운 도로 위에, 도로 방향으로
    let best = null, bd = 1e18;
    for (const r of game.data.roads || []) {
      if (r.tunnel) continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
        const u = clamp(((st.pos.x - ax) * ex + (st.pos.z - az) * ez) / L2, 0, 1);
        const x = ax + ex * u, z = az + ez * u, d = (x - st.pos.x) ** 2 + (z - st.pos.z) ** 2;
        if (d < bd) { bd = d; best = { x, z, yaw: Math.atan2(ex, ez) }; }
      }
    }
    if (best && bd < 600 * 600) { st.pos.x = best.x; st.pos.z = best.z; st.yaw = Math.cos(best.yaw - st.yaw) >= 0 ? best.yaw : best.yaw + Math.PI; }
    st.pos.y = groundAt(game, st.pos.x, st.pos.z);
    for (let i = 0; i < 40 && boxHitsBuilding(D, st.pos.x, st.pos.z, st.pos.y, Math.sin(st.yaw), Math.cos(st.yaw), st.hl, st.hw); i++) { st.pos.addScaledVector(fwd0, -6); st.pos.y = groundAt(game, st.pos.x, st.pos.z); }
  } else if (id === 'heli') {
    mesh = makeHeli(); mesh.scale.setScalar(1.3);
    st.skid = 2.9; st.rotorR = 9;
    if (opts.ground) st.pad = buildHelipad(A, st.pos);
    if (st.pad) { st.pos.set(st.pad.x, st.pad.y + st.skid, st.pad.z); st.landed = true; st.rpm = 0; }
    else { let top = groundAt(game, st.pos.x, st.pos.z) + 90; for (const b of D.buildingsNear(st.pos.x, st.pos.z, 120)) top = Math.max(top, b.baseY + b.height + 45); st.pos.y = top; }
  } else {
    const sp = SPEC[id];
    mesh = id === 'plane' ? makeLightPlane() : id === 'fighter' ? makeJet() : makeBomber();
    const box = new THREE.Box3().setFromObject(mesh);
    st.nose = box.max.z * sp.scale; st.tail = box.min.z * sp.scale; st.span = box.max.x * sp.scale; st.bellyH = -box.min.y * sp.scale;
    const gear = addGear(mesh); st.gearG = gear.g;
    mesh.scale.setScalar(sp.scale);
    st.gearH = gear.h * sp.scale;
    if (opts.ground) st.rw = buildRunway(A, sp.rw, sp.rwW, st.pos);
    if (st.rw) {
      const rw = st.rw;
      st.pos.copy(rw.a).addScaledVector(rw.dir, 30); st.pos.y = rw.hAt(st.pos) + st.gearH;
      st.yaw = Math.atan2(rw.dir.x, rw.dir.z); st.speed = 0; st.thr = 0; st.ground = true; st.gear = true;
    } else {
      st.pos.addScaledVector(fwd0, -500); st.pos.y = groundAt(game, st.pos.x, st.pos.z) + (id === 'bomber' ? 320 : 180);
      st.speed = (sp.vmin + sp.vmax) * 0.5; st.thr = 0.5; st.gear = false;
    }
    st.gearG.visible = st.gear;
    st.q = qFromYPR(st.yaw, st.pitch, st.roll);
  }
  // 무기 방식 (Tab): 0 일반 · 1 유도(락온)
  const armed = id === 'heli' || id === 'fighter' || id === 'bomber';
  st.mode = 0; st.lock = null; st.lockT = 0; st.beepT = 0;
  const MODES = { heli: ['로켓', '유도 미사일'], fighter: ['기관포·미사일', '유도 미사일'], bomber: ['폭탄', '유도 폭탄'] };
  scene.add(mesh);
  const snd = audio.engine(id === 'car' ? 'car' : id === 'heli' ? 'heli' : SPEC[id].snd);
  const dir = v3();
  const dirOf = () => dir.set(Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), Math.cos(st.yaw) * Math.cos(st.pitch));
  const fwdH = () => v3(Math.sin(st.yaw), 0, Math.cos(st.yaw));

  const crash = (q, power) => {
    if (st.crashed) return;
    st.crashed = 0.001; st.endT = 0; st.crashWhy = (new Error().stack || '').split('\n').slice(2, 4).join(' | ');
    mesh.visible = false;
    if (snd) snd.stop(); audio.hornOff();
    const r = power;
    A.blast(q, r, 40 + st.speed * 0.3, { vap: r * 0.2, crater: [r * 0.3, r * 0.12], lift: 0.5 });
    fx.addShake(1.5); audio.boom(2.5, 40);
    H.warn.textContent = '추락!'; H.land.textContent = '';
  };
  // 실제로 닿은 지점만 부숨 (속도만큼)
  const impact = (hit, sp, y) => {
    const key = hit.b || hit; const last = st.hitCD.get(key) || -9; if (st.t - last < 0.35) return false;
    st.hitCD.set(key, st.t);
    const q = v3(hit.x, y, hit.z);
    if (sp > 12) {
      D.explode({ x: q.x, y: q.y, z: q.z, r: Math.min(5, 1.5 + sp * 0.05), power: sp * 1.3, lift: 0.2, lod: 1 });
      if (sp > 35 && hit.b) D.blastFrom(hit.b, q, sp * 0.6, { lift: 0.1, lod: 1 });
      fx.dust(q, 1.5 + sp * 0.04); audio.crumble(Math.min(60, sp)); fx.addShake(Math.min(1, sp / 45));
    } else audio.thud();
    return true;
  };
  // 무기
  const fireRocket = (from, d, r) => {
    A.addProjectile({ mesh: A.spawn(makeMissile(), 0.6), pos: from.clone(), vel: d.clone().multiplyScalar(260), align: 'fwd', trail: { size: 0.8, fire: true, every: 0.015 },
      onHit: (q) => A.blast(q, r, 30 * S.v, { lift: 0.3, silent: R() > 0.5, lod: 1 }) });
    audio.rocket(0.4);
  };
  const fireShell = (from, d, r) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 5, 4), glow(0xffd080, 1));
    A.addProjectile({ mesh: A.spawn(m, 1), pos: from.clone(), vel: d.clone().multiplyScalar(900).add(st.vel), trail: null,
      onHit: (q) => { fx.sparks(q, UP, 4); D.explode({ x: q.x, y: q.y, z: q.z, r, power: 22, lift: 0.2, lod: 2 }); } });
  };
  const dropBomb = (big) => {
    const from = st.pos.clone().add(v3(0, -4, 0));
    A.addProjectile({ mesh: A.spawn(makeBomb(), big ? 1.6 : 1.2), pos: from, vel: dirOf().clone().multiplyScalar(st.speed * 0.9), g: 9.8, align: 'fwd',
      onHit: (q) => A.blast(q, (big ? 26 : 20) * S.r ** 0.7, 45 * S.v, { crater: [6, 3], lift: 0.4, silent: R() > 0.6 }) });
  };
  const aimDir = () => { const d = v3(); game.camera.getWorldDirection(d); return d; };
  // 유도 무기: 락온한 표적을 쫓아감 (락온이 없으면 똑바로)
  const fireGuided = (from, d, r, spd, turn, meshObj, scale = 0.7, g = 0) => {
    const tgt = st.lock && st.lockT >= 0.8 ? st.lock : null;
    const goal = tgt ? v3(tgt.cx, tgt.baseY + tgt.height * 0.45, tgt.cz) : null;
    A.addProjectile({ mesh: A.spawn(meshObj || makeMissile(), scale), pos: from.clone(), vel: d.clone().multiplyScalar(spd).add(st.vel.clone().multiplyScalar(0.3)), g, align: 'fwd', trail: { size: 0.9, fire: !g, every: 0.015 },
      onUpdate: (pr, dt2) => {
        if (!goal) return true;
        const want = goal.clone().sub(pr.pos); const L = want.length(); if (L < 1) return true;
        const v = pr.vel, sp2 = Math.max(spd * 0.6, v.length());
        const cur = v.clone().normalize(), aim = want.divideScalar(L);
        const ang = Math.acos(clamp(cur.dot(aim), -1, 1)), k = ang > 1e-4 ? Math.min(1, turn * dt2 / ang) : 1;
        v.copy(cur.lerp(aim, k).normalize().multiplyScalar(sp2));
        return true;
      },
      onHit: (q) => A.blast(q, r, 40 * S.v, { lift: 0.35, lod: 1 }) });
    audio.rocket(0.5);
  };
  // 락온: 조준 방향 가까이 있는 건물을 0.8초 동안 겨누면 고정
  const lockEl = H.lock;
  const updateLock = (dt, aim) => {
    if (!armed || st.mode !== 1 || st.landed || st.ground) { st.lock = null; st.lockT = 0; lockEl.hidden = true; return; }
    const o = st.pos; let best = null, bs = 1e9;
    const cosMax = Math.cos(0.17);
    for (const b of D.buildings) {
      if (b.state === 'gone') continue;
      const x = b.cx - o.x, y = b.baseY + b.height * 0.45 - o.y, z = b.cz - o.z, L = Math.hypot(x, y, z);
      if (L < 30 || L > 3000) continue;
      const cs = (x * aim.x + y * aim.y + z * aim.z) / L; if (cs < cosMax) continue;
      const sc2 = (1 - cs) * 4000 + L * 0.02 - (b === st.lock ? 15 : 0);
      if (sc2 < bs) { bs = sc2; best = b; }
    }
    if (best !== st.lock) { st.lock = best; st.lockT = 0; }
    if (!best) { lockEl.hidden = true; return; }
    st.lockT += dt;
    const locked = st.lockT >= 0.8;
    st.beepT -= dt; if (st.beepT <= 0) { st.beepT = locked ? 0.5 : 0.18; audio.beep(locked ? 1500 : 900, locked ? 0.12 : 0.05, 0.08); }
    const pp = v3(best.cx, best.baseY + best.height * 0.45, best.cz).project(game.camera);
    if (pp.z > 1) { lockEl.hidden = true; return; }
    lockEl.hidden = false;
    lockEl.style.left = ((pp.x + 1) / 2 * innerWidth) + 'px'; lockEl.style.top = ((1 - pp.y) / 2 * innerHeight) + 'px';
    lockEl.classList.toggle('locked', locked);
    lockEl.querySelector('b').textContent = locked ? 'LOCK' : Math.round(st.lockT / 0.8 * 100) + '%';
  };
  const damage = (n, why) => {
    st.hp = Math.max(0, st.hp - n); fx.addShake(Math.min(1.2, n / 30)); audio.thud();
    if (why) { H.warn.textContent = why; st.warnT = 1.5; }
  };

  const p = {
    endPoint: null, lockMouse: !steerMouse, ignoreFast: true,
    update(dt, inp, realDt) {
      st.t += dt;
      const has = (c) => inp.has(c), any = (a) => a.some(has);
      const prevK = st.prev; const pressed = (c) => has(c) && !prevK.has(c);
      const ax = (neg, pos) => (any(pos) ? 1 : 0) - (any(neg) ? 1 : 0);
      const K = game.cfg;
      // 시점 (V: 추격 → 멀리 → 조종석), 뒤 보기 (C), 내리기 (F)
      if (pressed('KeyV')) st.cam = (st.cam + 1) % 3;
      const exit = pressed('KeyF');
      // 마우스로 둘러보기 (가만히 두면 천천히 앞으로 돌아옴)
      if (!steerMouse) {
        const mx = inp.mdx || 0, my = inp.mdy || 0;
        if (mx || my) { st.lookYaw -= mx * 0.0035 * (K.rotSens || 1); st.lookPitch = clamp(st.lookPitch - my * 0.0035 * (K.rotSens || 1), -0.7, 0.9); st.lookIdle = 0; }
        else { st.lookIdle += realDt; if (st.lookIdle > 1.2) { const k = Math.exp(-realDt * 2.5); st.lookYaw = Math.atan2(Math.sin(st.lookYaw), Math.cos(st.lookYaw)) * k; st.lookPitch *= k; } }
      }
      st.prev = new Set(['KeyV', 'KeyF', 'KeyG', 'Space', 'KeyQ', 'Tab'].filter(has));
      if (armed && pressed('Tab')) { st.mode = 1 - st.mode; st.lock = null; st.lockT = 0; audio.click(); }
      if (armed) H.mode.textContent = `무기: ${MODES[id][st.mode]} (Tab 바꾸기)`;
      if (exit && !st.crashed) { if (snd) snd.stop(); audio.hornOff(); p.endPoint = st.pos; return false; }
      if (st.crashed) { st.endT += realDt; p.endPoint = st.pos; return st.endT < 2.5; }
      if (st.warnT > 0) st.warnT -= dt; else H.warn.textContent = '';
      H.land.textContent = '';
      const fire1 = has('Space') || inp.lmb, fire2 = has('KeyQ') || inp.rmb;
      const msx = steerMouse ? dz(inp.x) : 0, msy = steerMouse ? dz(inp.y) : 0;

      if (id === 'car') {
        // ---- 자동차 ----
        const f = fwdH(), side = v3(-f.z, 0, f.x);
        const hand = has('Space');
        const vmax = inp.boost ? 75 : 42;
        let fs = st.vel.dot(f);
        if (inp.w) fs += (inp.boost ? 30 : 18) * dt;
        else if (inp.s) fs -= (fs > 0 ? 34 : 10) * dt;
        else fs -= Math.sign(fs) * Math.min(Math.abs(fs), 6 * dt);
        if (hand) fs -= Math.sign(fs) * Math.min(Math.abs(fs), 9 * dt);
        fs = clamp(fs, -14, vmax);
        const steer = ax([K.k_right], [K.k_left]) + (steerMouse ? -msx : 0);
        st.yaw += steer * dt * (hand ? 2.6 : 1.8) * Math.min(1, Math.abs(fs) / 8) * Math.sign(fs || 1);
        const f2 = fwdH(), s2 = v3(-f2.z, 0, f2.x);
        // 옆으로 미끄러짐: 평소엔 바로 잡히고, 핸드브레이크면 오래 미끄러짐
        const lat = st.vel.dot(s2) * Math.exp(-dt * (hand ? 1.6 : 12));
        st.vel.copy(f2).multiplyScalar(fs).addScaledVector(s2, lat);
        st.speed = fs;
        const skid = Math.min(1, Math.abs(lat) / 8 + (hand && Math.abs(fs) > 8 ? 0.4 : 0));
        if (skid > 0.3 && !st.air && R() < 0.5) fx.dust(st.pos, 0.6 + skid);
        // 이동 + 차체 크기에 맞춘 충돌
        const mv = st.vel.clone().multiplyScalar(dt);
        const sp = st.vel.length();
        const inside = boxHitsBuilding(D, st.pos.x, st.pos.z, st.pos.y, f2.x, f2.z, st.hl, st.hw);
        const test = (x, z) => (inside ? null : boxHitsBuilding(D, x, z, st.pos.y, f2.x, f2.z, st.hl, st.hw));
        let hit = test(st.pos.x + mv.x, st.pos.z + mv.z);
        // 부서진 건물의 남은 조각: 앞 범퍼 세 군데에서 진행 방향으로
        let chunkHit = null;
        if (!hit && sp > 0.5) {
          const vd = st.vel.clone().normalize();
          for (const o of [0, -1, 1]) {
            const from = st.pos.clone().addScaledVector(vd, st.hl * 0.9).addScaledVector(s2, o * st.hw * 0.9); from.y += 1.2;
            const h = D.raycast(from, vd, mv.length() + 0.6);
            if (h && h.info && h.info.chunk) {
              if (h.info.chunk.state === 0) { chunkHit = { x: h.point.x, z: h.point.z, b: h.info.chunk.b }; break; }
              D.explode({ x: h.point.x, y: h.point.y, z: h.point.z, r: 2.5, power: sp * 0.8, lift: 0.3, lod: 2 }); st.vel.multiplyScalar(0.97);
            }
          }
        }
        if (hit || chunkHit) {
          impact(hit || chunkHit, sp, st.pos.y + 1.2);
          // 벽을 따라 미끄러지기
          if (!test(st.pos.x + mv.x, st.pos.z) && Math.abs(mv.x) > 0.01 && !chunkHit) { st.pos.x += mv.x; st.vel.z *= -0.2; st.vel.multiplyScalar(0.8); }
          else if (!test(st.pos.x, st.pos.z + mv.z) && Math.abs(mv.z) > 0.01 && !chunkHit) { st.pos.z += mv.z; st.vel.x *= -0.2; st.vel.multiplyScalar(0.8); }
          else st.vel.multiplyScalar(sp > 25 ? 0.35 : -0.25);
        } else { st.pos.x += mv.x; st.pos.z += mv.z; }
        // 땅 따라가기 + 점프 (X)
        const g2 = groundAt(game, st.pos.x, st.pos.z);
        if (has('KeyX') && !st.air) { st.vy = 11; st.air = true; }
        if (st.air) { st.vy -= 22 * dt; st.pos.y += st.vy * dt; if (st.pos.y <= g2) { st.pos.y = g2; st.air = false; if (st.vy < -12) { fx.dust(st.pos, 4); audio.thud(); } st.vy = 0; } }
        else { if (g2 < st.pos.y - 1.5) { st.air = true; st.vy = 0; } else st.pos.y = g2; }
        const lim = grid.span / 2 * 1.4; st.pos.x = clamp(st.pos.x, -lim, lim); st.pos.z = clamp(st.pos.z, -lim, lim);
        const f1 = groundAt(game, st.pos.x + f2.x * 2, st.pos.z + f2.z * 2), b1 = groundAt(game, st.pos.x - f2.x * 2, st.pos.z - f2.z * 2);
        st.pitch += (Math.atan2(f1 - b1, 4) - st.pitch) * Math.min(1, dt * 8);
        mesh.position.copy(st.pos);
        mesh.rotation.set(0, 0, 0); mesh.rotateY(st.yaw); mesh.rotateX(-st.pitch); mesh.rotateZ(clamp(lat * 0.01, -0.08, 0.08));
        for (const w of mesh.userData.wheels) w.rotation.x += fs * dt / 0.38;
        if (has('KeyE')) audio.hornOn(); else audio.hornOff();
        if (snd) { const gear = Math.floor(Math.abs(fs) / 13), rp = 0.2 + 0.8 * ((Math.abs(fs) - gear * 13) / 13); snd.set({ rpm: Math.min(1.1, rp + gear * 0.06), load: inp.w ? 1 : 0, wind: sp / 70, skid: st.air ? 0 : skid }); }
        H.spd.textContent = Math.round(sp * 3.6); H.alt.textContent = Math.round(st.pos.y - g2);
        H.thrBox.hidden = true; H.hpBox.hidden = true;
      } else if (id === 'heli') {
        // ---- 헬기 ----
        const f = fwdH(), left = v3(-f.z, 0, f.x);
        const surf = (x, z) => { const r = roofUnder(D, x, z); const g0 = groundAt(game, x, z); return r !== null && r > g0 ? r : g0; };
        if (st.rpm < 1) st.rpm = Math.min(1, st.rpm + dt / 4);
        const dying = st.hp <= 0;
        if (!dying) {
          const yawIn = ax([K.k_right], [K.k_left]) - msx * 1.4;
          st.yaw += yawIn * dt * 1.3;
          const fwdIn = ax(KEY.noseUp, KEY.noseDn), sideIn = ax(KEY.rollR, KEY.rollL);
          const vIn = (inp.w ? 1 : 0) - (inp.s ? 1 : 0) + (steerMouse ? msy : 0);
          const top = inp.boost ? 85 : 55;
          const want = v3().addScaledVector(f, fwdIn).addScaledVector(left, sideIn).multiplyScalar(top);
          want.y = vIn * 18;
          // 땅·지붕 가까이에서는 내려가는 속도를 자동으로 줄임 (S 를 누르고 있어도 부드럽게 착륙)
          if (want.y < 0) { const agl = st.pos.y - st.skid - surf(st.pos.x, st.pos.z); want.y = Math.max(want.y, -Math.min(18, 2.5 + Math.max(0, agl) * 0.55)); }
          if (st.landed) {
            want.set(0, 0, 0);
            if (vIn > 0 && st.rpm > 0.85) { st.landed = false; st.vel.y = 4; }
            else if (vIn > 0) H.warn.textContent = `로터 회전 중… ${Math.round(st.rpm * 100)}%`;
          }
          if (!st.landed) st.vel.lerp(want, Math.min(1, dt * 1.6));
          st.fwdIn = fwdIn; st.sideIn = sideIn;
        } else {
          // 내구도 0: 연기를 뿜으며 빙글빙글 돌다 떨어짐
          if (!st.dyingT) { st.dyingT = 0.001; H.warn.textContent = '기체 손상! 추락 중'; st.warnT = 9; audio.boom(1.2, 30); }
          st.yaw += dt * (3 + st.t * 0.2); st.vel.y -= 12 * dt; st.vel.multiplyScalar(1 - dt * 0.2); st.landed = false;
          fx.smoke.emit(st.pos.x, st.pos.y + 1, st.pos.z, 0, 2, 0, 3, 3, 9, [0.2, 0.2, 0.2, 0.8], [0.3, 0.3, 0.3, 0], 0.4, 0.4);
          if (R() < 0.6) fx.fire.emit(st.pos.x, st.pos.y + 1.5, st.pos.z, 0, 1, 0, 0.6, 2, 0.5, [1, 0.6, 0.2, 1], [1, 0.2, 0, 0], 0.3, 0.2);
        }
        if (!st.landed) {
          const sp = st.vel.length();
          const prev = st.pos.clone();
          st.pos.addScaledVector(st.vel, dt);
          // 기체·로터 끝이 건물에 닿는지 (실제 바닥 모양 기준)
          const nose = st.pos.clone().addScaledVector(f, 4.5), tail = st.pos.clone().addScaledVector(f, -11.5);
          const body = [st.pos, nose, tail].find(q => pointInBuilding(D, q));
          let rotor = null;
          for (let k = 0; k < 8 && !rotor && !body; k++) { const a = k / 8 * Math.PI * 2 + st.t * 7; const q = st.pos.clone().add(v3(Math.cos(a) * st.rotorR, 2.8, Math.sin(a) * st.rotorR)); if (pointInBuilding(D, q)) rotor = q; }
          let chunk = null;
          if (!body && !rotor && sp > 1) { const h = D.raycast(prev, st.vel.clone().normalize(), sp * dt + 4); if (h && h.info && h.info.chunk) { if (h.info.chunk.state === 0) chunk = v3(h.point.x, h.point.y, h.point.z); else D.explode({ x: h.point.x, y: h.point.y, z: h.point.z, r: 3, power: sp, lift: 0.2, lod: 2 }); } }
          const where = body || rotor || chunk;
          if (where) {
            if (dying || (body && sp > 30)) { crash(where.clone(), 14 * S.r ** 0.4); return true; }
            impact({ x: where.x, z: where.z, b: pointInBuilding(D, where) }, sp, where.y);
            if (rotor) { damage(30 + sp, '로터가 벽에 닿았어요!'); fx.sparks(rotor, UP, 8); }
            else damage(8 + sp * 2.2, '충돌!');
            st.pos.copy(prev); st.vel.multiplyScalar(-0.35);
          }
          // 착지: 천천히면 착륙, 거칠면 손상, 너무 빠르면 추락
          const gs = surf(st.pos.x, st.pos.z);
          if (st.pos.y < gs + st.skid) {
            const vy = st.vel.y, hs = Math.hypot(st.vel.x, st.vel.z);
            if (dying || vy < -16 || hs > 35) { crash(v3(st.pos.x, gs, st.pos.z), 14 * S.r ** 0.4); return true; }
            st.pos.y = gs + st.skid;
            if (vy < -7 || hs > 18) { damage((-vy - 6) * 7 + hs * 0.8 + 8, '거친 착지!'); st.vel.y = -vy * 0.25; st.vel.x *= 0.4; st.vel.z *= 0.4; }
            else if (st.vel.y <= 0.5 && !inp.w) { st.landed = true; st.vel.set(0, 0, 0); fx.dust(v3(st.pos.x, gs, st.pos.z), 4); audio.thud(); }
            else st.vel.y = Math.max(0, st.vel.y);
          }
          st.pos.y = Math.min(st.pos.y, gs + 1500);
        } else {
          const gs = surf(st.pos.x, st.pos.z);
          if (gs < st.pos.y - st.skid - 1) st.landed = false;   // 밑이 무너지면 떨어짐
          else st.pos.y = gs + st.skid;
        }
        const fv = st.vel.dot(f), sv = st.vel.dot(left);
        mesh.position.copy(st.pos);
        mesh.rotation.set(0, 0, 0); mesh.rotateY(st.yaw); mesh.rotateX(fv * 0.006 + (st.fwdIn || 0) * 0.08); mesh.rotateZ(-sv * 0.006);
        mesh.userData.rotor.rotation.y += dt * 40 * st.rpm; mesh.userData.tail.rotation.x += dt * 50 * st.rpm;
        st.cool -= dt; st.cool2 -= dt;
        if (!dying && !st.landed) {
          if (fire1 && st.cool <= 0 && st.mode === 1) { st.cool = 0.6; fireGuided(st.pos.clone().addScaledVector(left, (st.alt = -(st.alt || 1)) * 3).add(v3(0, -1.5, 0)), aimDir(), 12 * S.r ** 0.6, 240, 3); }
          else if (fire1 && st.cool <= 0) { st.cool = 0.3; const d = aimDir(); for (const s of [-1, 1]) fireRocket(st.pos.clone().addScaledVector(left, s * 3).add(v3(0, -1.5, 0)), d, 9 * S.r ** 0.6); }
          if (fire2 && st.cool2 <= 0) { st.cool2 = 0.06; fireShell(st.pos.clone().add(v3(0, -2, 0)).addScaledVector(f, 4), aimDir().add(v3((R() - 0.5) * 0.02, (R() - 0.5) * 0.02, (R() - 0.5) * 0.02)).normalize(), 3 * S.r ** 0.4); if (R() < 0.3) audio.buzz(0.05); }
        }
        st.speed = st.vel.length();
        const gs = surf(st.pos.x, st.pos.z);
        if (snd) snd.set({ rpm: st.rpm, load: Math.max(0, st.vel.y / 18) + (st.speed > 40 ? 0.3 : 0), wind: st.speed / 90 });
        H.spd.textContent = Math.round(st.speed * 3.6); H.alt.textContent = Math.round(st.pos.y - st.skid - gs);
        H.thrBox.hidden = true; H.hpBox.hidden = false; H.hp.style.width = st.hp + '%'; H.hpBox.classList.toggle('low', st.hp < 35);
        if (!st.landed && st.pos.y - st.skid - gs < 40 && st.vel.y < -1) H.land.textContent = `강하 ${(-st.vel.y).toFixed(1)} m/s ${-st.vel.y > 7 ? '· 천천히!' : ''}`;
        if (st.landed && st.rpm >= 1 && !H.warn.textContent) H.land.textContent = '착륙 · W 로 이륙';
      } else {
        // ---- 비행기 (경비행기·전투기·폭격기) ----
        const sp = SPEC[id];
        if (inp.has(K.k_fwd)) st.thr = Math.min(1, st.thr + dt * 0.6);
        if (inp.has(K.k_back)) st.thr = Math.max(0, st.thr - dt * 0.6);
        const ab = sp.boost && inp.boost;
        if (pressed('KeyG') && !st.ground) { st.gear = !st.gear; st.gearG.visible = st.gear; audio.clack(); }
        const surf = (q) => { const h = st.rw ? st.rw.hAt(q) : null; return h !== null ? Math.max(h, groundAt(game, q.x, q.z)) : groundAt(game, q.x, q.z); };
        const rollIn = ax(KEY.rollL, KEY.rollR) + msx * 1.2;        // + 오른쪽
        const pitchIn = ax(KEY.noseDn, KEY.noseUp) + msy;            // + 기수 올림
        const yawIn = ax([K.k_left], [K.k_right]);                   // + 오른쪽
        const hgt = st.ground ? (st.belly ? st.bellyH : st.gearH) : 0;
        // 기체 끝(기수·날개 끝·꼬리)이 건물에 닿으면 추락
        const tips = () => { const f = dirOf().clone(), r = v3(-f.z, 0, f.x).normalize(); return [st.pos.clone().addScaledVector(f, st.nose), st.pos.clone().addScaledVector(f, st.tail), st.pos.clone().addScaledVector(r, st.span * Math.cos(st.roll)).add(v3(0, st.span * Math.sin(st.roll), 0)), st.pos.clone().addScaledVector(r, -st.span * Math.cos(st.roll)).add(v3(0, -st.span * Math.sin(st.roll), 0))]; };
        if (st.ground) {
          // ---- 지상 활주 ----
          const brake = (inp.has(K.k_back) && st.thr <= 0.01 ? 14 : 0) + (st.belly ? 7 : 0);
          st.speed += (sp.acc * st.thr * (st.belly ? 0 : 1) + (ab ? sp.acc : 0) - brake - 0.008 * st.speed - (st.speed > 0.1 ? 0.4 : 0)) * dt;
          st.speed = clamp(st.speed, 0, sp.vmax);
          st.yaw -= clamp(yawIn + rollIn * 0.5, -1, 1) * 0.6 * dt * Math.min(1, st.speed / 8);
          const f = fwdH();
          const g0 = surf(st.pos), gf = surf(st.pos.clone().addScaledVector(f, 4));
          const slope = Math.atan2(gf - g0, 4);
          if (!st.belly && st.speed > sp.vr * 0.9 && pitchIn > 0.05) st.rot = Math.min(0.28, (st.rot || 0) + pitchIn * sp.pitch * 0.5 * dt);
          else st.rot = Math.max(0, (st.rot || 0) - dt * 0.3);
          st.pitch = slope + st.rot; st.roll *= Math.exp(-dt * 4);
          const prev = st.pos.clone();
          st.pos.addScaledVector(f, st.speed * dt);
          st.pos.y = surf(st.pos) + hgt;
          if (st.speed > 6 && tips().some(q => pointInBuilding(D, q))) { crash(st.pos.clone(), sp.crash * S.r ** 0.4); return true; }
          if (st.speed <= 6 && tips().some(q => pointInBuilding(D, q))) { st.pos.copy(prev); st.speed = 0; }
          if (st.speed > 15 && R() < 0.3) fx.dust(v3(st.pos.x, st.pos.y - hgt, st.pos.z), 0.8 + st.speed * 0.01);
          if (st.belly && st.speed > 3 && R() < 0.8) fx.sparks(v3(st.pos.x, st.pos.y - hgt, st.pos.z), UP, 3);
          if (!st.belly && st.speed >= sp.vr && st.rot > 0.06) { st.ground = false; st.liftT = 0; audio.whoosh(1); }
          if (!H.warn.textContent) H.land.textContent = st.belly ? '동체 착륙 — 기체가 손상돼 다시 뜰 수 없어요' : st.speed < sp.vr * 0.9 ? `W 로 스로틀을 올리세요 · 이륙 속도 ${Math.round(sp.vr * 3.6)} km/h` : '이륙 속도 도달! 넘버패드 5 · K · ↓ 로 기수를 드세요';
          const lim = grid.span * 4; st.pos.x = clamp(st.pos.x, -lim, lim); st.pos.z = clamp(st.pos.z, -lim, lim);
        } else {
          if (st.liftT !== undefined) { st.liftT += dt; if (st.gear && st.pos.y - groundAt(game, st.pos.x, st.pos.z) > 45) { st.gear = false; st.gearG.visible = false; audio.clack(); st.liftT = undefined; } }
          const target = ab ? sp.boost : sp.vmin + st.thr * (sp.vmax - sp.vmin);
          st.speed += (target - st.speed) * dt * 0.4 - Math.sin(st.pitch) * 9.8 * dt * 0.6;
          st.speed = Math.max(0, st.speed);
          // 자세는 사원수로: 기수·기울기·방향타를 기체 기준 축으로 돌림 → 배면비행·공중제비 가능
          const q = st.q, tq = new THREE.Quaternion();
          const ax = (x, y, z, ang) => q.multiply(tq.setFromAxisAngle(v3(x, y, z), ang));
          ax(1, 0, 0, -clamp(pitchIn, -1.3, 1.3) * sp.pitch * 1.25 * dt);
          ax(0, 0, 1, clamp(rollIn, -1.3, 1.3) * sp.roll * 1.2 * dt);
          ax(0, 1, 0, -clamp(yawIn, -1, 1) * sp.turn * 0.3 * dt);
          ypr(q, st);
          // 기울인 쪽으로 선회 (거꾸로 뒤집히면 선회 안 함)
          const turn = clamp(9.8 * Math.sin(st.roll) * Math.cos(st.pitch) / Math.max(25, st.speed) * 2.2, -sp.turn * 1.3, sp.turn * 1.3);
          q.premultiply(tq.setFromAxisAngle(UP, turn * dt));
          // 조작이 없으면 날개를 천천히 수평으로 (크게 기울어 있거나 뒤집혀 있을 때는 그대로)
          if (Math.abs(rollIn) < 0.05 && Math.abs(st.roll) < 1.0) { const fw = v3(0, 0, 1).applyQuaternion(q); q.premultiply(tq.setFromAxisAngle(fw, st.roll * (1 - Math.exp(-dt * 0.7)))); }
          const stalling = st.speed < sp.stall;
          if (stalling) {
            // 실속: 기수가 땅 쪽으로 떨어짐
            const fw = v3(0, 0, 1).applyQuaternion(q), axis = v3().crossVectors(fw, v3(0, -1, 0));
            if (axis.lengthSq() > 1e-6) q.premultiply(tq.setFromAxisAngle(axis.normalize(), dt * 0.7));
            H.warn.textContent = '실속! 속도를 올리세요'; st.warnT = 0.2;
          }
          q.normalize(); ypr(q, st);
          dirOf();
          const step = st.speed * dt;
          // 부서진 건물의 남은 조각·파편
          const h = D.raycast(st.pos.clone().addScaledVector(dir, st.nose * 0.8), dir, step + 2);
          if (h && h.info && h.info.chunk) { if (h.info.chunk.state === 0) { crash(h.point, sp.crash * S.r ** 0.4); return true; } D.explode({ x: h.point.x, y: h.point.y, z: h.point.z, r: 3, power: st.speed * 0.5, lift: 0.2, lod: 2 }); damage(8, '파편에 맞았어요'); }
          st.pos.addScaledVector(dir, step);
          if (stalling) st.pos.y -= (sp.stall - st.speed) * 0.3 * dt;
          if (tips().some(q => pointInBuilding(D, q))) { crash(st.pos.clone(), sp.crash * S.r ** 0.4); return true; }
          const g2 = surf(st.pos);
          // 땅에 닿음: 세 단계 (착륙 / 튕기며 손상 / 추락)
          const contactH = st.gear ? st.gearH : st.bellyH;
          if (st.pos.y <= g2 + contactH) {
            const sink = -st.speed * Math.sin(st.pitch), rollA = Math.abs(st.roll);
            const touch = v3(st.pos.x, g2, st.pos.z);
            if (st.gear && sink < sp.sink && rollA < 0.6 && st.pitch > -0.3 && st.speed < sp.vmax * 0.95) {
              st.ground = true; st.belly = false; st.rot = Math.max(0, st.pitch); st.pos.y = g2 + st.gearH; st.roll = 0;
              fx.dust(touch, 3); audio.thud(); H.warn.textContent = '착륙!'; st.warnT = 1.5;
            } else if (st.gear && sink < sp.sink * 1.8 && rollA < 0.95) {
              damage((sink - sp.sink * 0.6) * 6 + rollA * 30 + 12, '거친 착륙! 튕겼어요');
              if (st.hp <= 0) { crash(touch, sp.crash * S.r ** 0.4); return true; }
              st.pos.y = g2 + st.gearH + 1.2; st.pitch = Math.max(st.pitch, 0.06); st.roll *= 0.4; st.speed *= 0.85; fx.dust(touch, 4); qFromYPR(st.yaw, st.pitch, st.roll, st.q);
            } else if (!st.gear && sink < 6 && rollA < 0.4 && st.speed < sp.vr * 1.5) {
              st.ground = true; st.belly = true; st.rot = 0; st.pos.y = g2 + st.bellyH; st.roll = 0; damage(40, '바퀴 없이 동체 착륙!');
            } else { crash(touch, sp.crash * S.r ** 0.4); return true; }
          }
          if (st.hp <= 0) { crash(st.pos.clone(), sp.crash * S.r ** 0.4); return true; }
          const lim = grid.span * 4; if (Math.abs(st.pos.x) > lim || Math.abs(st.pos.z) > lim) { st.q.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, dt * 2)); ypr(st.q, st); }
          // 착륙 도우미
          const agl = st.pos.y - g2 - contactH;
          if (agl < 150 && (st.gear || agl < 60)) {
            const sink = -st.speed * Math.sin(st.pitch);
            let t = `강하 ${sink.toFixed(1)} m/s${sink > sp.sink ? ' · 너무 빨라요' : ''}`;
            if (!st.gear) t += ' · G 로 바퀴를 내리세요';
            if (st.rw) { const ri = st.rw.info(st.pos), ang = Math.atan2(Math.sin(st.yaw - Math.atan2(st.rw.dir.x, st.rw.dir.z)), Math.cos(st.yaw - Math.atan2(st.rw.dir.x, st.rw.dir.z))); if (ri.s > -2000 && ri.s < st.rw.L + 300) t += ` · 활주로 ${Math.abs(ri.l) < st.rw.W / 2 ? '정렬' : (ri.l > 0 ? '← ' : '→ ') + Math.round(Math.abs(ri.l)) + 'm'} ${Math.abs(ang) > 0.15 ? '(방향 틀어짐)' : ''}`; }
            H.land.textContent = t;
          }
        }
        if (st.ground) qFromYPR(st.yaw, st.pitch, st.roll, st.q);
        st.vel.copy(dirOf()).multiplyScalar(st.speed);
        mesh.position.copy(st.pos);
        mesh.quaternion.copy(st.q);
        if (mesh.userData.prop) mesh.userData.prop.rotation.z += dt * (12 + st.thr * 40);
        if (mesh.userData.flame) mesh.userData.flame.scale.setScalar(ab ? 1.8 : 0.3 + st.thr * 0.7);
        if (st.smoke && R() < 0.9) fx.smoke.emit(st.pos.x - dir.x * 4, st.pos.y - dir.y * 4, st.pos.z - dir.z * 4, 0, 0.5, 0, 6, 1.5, 6, [1, 0.35, 0.5, 0.8], [0.9, 0.6, 0.8, 0], 0.2, 0.1);
        if (st.hp < 40 && R() < 0.5) fx.smoke.emit(st.pos.x, st.pos.y, st.pos.z, 0, 1, 0, 2.5, 1.5, 5, [0.25, 0.25, 0.25, 0.7], [0.35, 0.35, 0.35, 0], 0.3, 0.3);
        st.cool -= dt; st.cool2 -= dt;
        const air = !st.ground;
        if (id === 'plane') { if (pressed('Space') || (inp.lmb && st.cool <= 0)) { st.cool = 0.4; st.smoke = !st.smoke; } }
        if (id === 'fighter' && air && st.mode === 1) {
          if (fire1 && st.cool <= 0) { st.cool = 0.9; const side = v3(-dir.z, 0, dir.x).normalize(); fireGuided(st.pos.clone().addScaledVector(side, (st.alt = -(st.alt || 1)) * 4).add(v3(0, -1, 0)), dir, 22 * S.r ** 0.7, 420, 2.6); }
          if (fire2 && st.cool2 <= 0) { st.cool2 = 0.05; fireShell(st.pos.clone().addScaledVector(dir, 8), dir.clone().add(v3((R() - 0.5) * 0.01, (R() - 0.5) * 0.01, (R() - 0.5) * 0.01)).normalize(), 3.5 * S.r ** 0.4); }
        } else if (id === 'fighter' && air) {
          if (fire1 && st.cool <= 0) { st.cool = 0.05; fireShell(st.pos.clone().addScaledVector(dir, 8), dir.clone().add(v3((R() - 0.5) * 0.01, (R() - 0.5) * 0.01, (R() - 0.5) * 0.01)).normalize(), 3.5 * S.r ** 0.4); if (R() < 0.3) audio.buzz(0.05); }
          if (fire2 && st.cool2 <= 0) { st.cool2 = 0.8; const side = v3(-dir.z, 0, dir.x).normalize(); fireRocket(st.pos.clone().addScaledVector(side, (R() < 0.5 ? -1 : 1) * 4).add(v3(0, -1, 0)), dir, 22 * S.r ** 0.7); }
        }
        if (id === 'bomber' && air && st.mode === 1) {
          if (fire1 && st.cool <= 0) { st.cool = 1.2; fireGuided(st.pos.clone().add(v3(0, -4, 0)), dir.clone().add(v3(0, -0.3, 0)).normalize(), 26 * S.r ** 0.7, Math.max(120, st.speed), 1.2, makeBomb(), 1.6, 9.8); }
        } else if (id === 'bomber' && air) {
          if (fire1 && st.cool <= 0) { st.cool = 0.35; dropBomb(false); }
          if (fire2 && st.cool2 <= 0) { st.cool2 = 3; let k = 0; A.addActive({ t: 0, update(d2) { this.t += d2; while (k < 12 && this.t > k * 0.12) { k++; if (!st.crashed) dropBomb(true); } return k < 12; } }); }
        }
        const g3 = groundAt(game, st.pos.x, st.pos.z);
        if (snd) snd.set({ rpm: 0.15 + st.thr * 0.85 + (ab ? 0.2 : 0), load: st.thr, ab, wind: st.speed / (sp.vmax * 1.2), roll: st.ground && !st.belly ? Math.min(1, st.speed / 40) : 0, skid: st.belly && st.speed > 3 ? 1 : 0 });
        H.spd.textContent = Math.round(st.speed * 3.6); H.alt.textContent = Math.max(0, Math.round(st.pos.y - surf(st.pos) - (st.ground ? hgt : st.gear ? st.gearH : st.bellyH)));
        H.thrBox.hidden = false; H.thr.style.width = (ab ? 100 : st.thr * 100) + '%';
        H.hpBox.hidden = false; H.hp.style.width = st.hp + '%'; H.hpBox.classList.toggle('low', st.hp < 35);
      }
      updateLock(realDt, id === 'heli' ? aimDir() : dirOf().clone());
      p.endPoint = st.pos;
      return true;
    },
    camera(c) {
      mesh.visible = st.cam !== 2 && !st.crashed;
      c.anchor = st.pos;
      const f = id === 'car' || id === 'heli' ? fwdH() : dirOf().clone();
      // 마우스 둘러보기 + 뒤 보기(C)
      const behind = game._keys && game._keys.has('KeyC');
      const yawOff = st.lookYaw + (behind ? Math.PI : 0);
      const fr = f.clone().applyAxisAngle(UP, yawOff);
      const right = v3(-fr.z, 0, fr.x).normalize();
      if (st.lookPitch) fr.applyAxisAngle(right, st.lookPitch);
      c.up = null;
      if (st.cam === 2) {
        const seat = id === 'car' ? v3(0, 2.3, 0.3) : id === 'heli' ? v3(0, 1.2, 3.5) : id === 'bomber' ? v3(0, 3, 14) : v3(0, 1.2, 2.5);
        if (st.q && id !== 'car' && id !== 'heli') {
          // 비행기 조종석: 기체와 함께 기울고 뒤집힘
          c.pos.copy(st.pos).add(seat.applyQuaternion(st.q));
          const lf = v3(0, 0, 1).applyAxisAngle(UP, yawOff); if (st.lookPitch) lf.applyAxisAngle(v3(1, 0, 0), -st.lookPitch);
          c.look.copy(c.pos).addScaledVector(lf.applyQuaternion(st.q), 100);
          c.up = v3(0, 1, 0).applyQuaternion(st.q);
        } else {
          c.pos.copy(st.pos).add(seat.applyAxisAngle(UP, st.yaw));
          c.look.copy(c.pos).addScaledVector(fr, 100).add(v3(0, id === 'car' ? -4 : 0, 0));
        }
        c.fov = 72;
      } else {
        const far = st.cam === 1 ? 2 : 1;
        const back = (id === 'car' ? 13 : id === 'heli' ? 32 : SPEC[id].back) * far, up = (id === 'car' ? 5 : id === 'heli' ? 11 : SPEC[id].up) * far;
        const ff = fr.clone(); if (id !== 'car' && id !== 'heli') ff.y *= 0.5;
        c.pos.copy(st.pos).addScaledVector(ff, -back).add(v3(0, up, 0));
        c.look.copy(st.pos).addScaledVector(fr, id === 'heli' ? 40 : 30);
        c.fov = 62 + (id === 'fighter' ? Math.min(14, st.speed * 0.03) : 0);
      }
    },
    click() {},
    abort() { game.endPilot(true); },
    dispose() { H.el.hidden = true; H.lock.hidden = true; scene.remove(mesh); if (snd) snd.stop(); audio.hornOff(); if (st.rw) st.rw.dispose(); if (st.pad) st.pad.dispose(); },
  };
  p._st = st;
  game.startPilot(p);
  if (A.ctx.hud && A.ctx.hud.toast) A.ctx.hud.toast(`${def.name} 탑승 — F 또는 Esc 로 내리기`, 'info');
  return p;
}

// 탈것 고르기 창 (비행기·헬기는 하늘에서 / 활주로·이착륙장에서 출발 선택)
const START_KEY = 'we.vehStart';
const getStart = () => { try { const v = localStorage.getItem(START_KEY); return v === 'runway' || v === 'ground' ? 'ground' : 'air'; } catch (e) { return 'air'; } };
const setStart = (v) => { try { localStorage.setItem(START_KEY, v); } catch (e) { /* 저장 못 해도 이번엔 적용 */ } };
export function openVehiclePicker(onPick) {
  let el = document.getElementById('vehPick');
  if (!el) {
    el = document.createElement('div'); el.id = 'vehPick';
    el.innerHTML = '<div class="vp-card"><h3>탈것</h3><div class="vp-list"></div><div class="vp-start"><span>비행기·헬기 출발</span><button data-v="air">하늘에서</button><button data-v="ground">활주로·이착륙장에서</button></div><p class="vp-note">지금 보고 있는 곳에 나타나요 · R 출발 바꾸기 · Esc 닫기</p></div>';
    document.body.appendChild(el);
  }
  let start = getStart();
  const sBtns = [...el.querySelectorAll('.vp-start button')];
  const paint = () => sBtns.forEach(b => b.classList.toggle('on', b.dataset.v === start));
  sBtns.forEach(b => { b.onclick = () => { start = b.dataset.v; setStart(start); paint(); }; });
  paint();
  const list = el.querySelector('.vp-list'); list.innerHTML = '';
  let onNum = null;
  const close = () => { el.hidden = true; window.removeEventListener('keydown', onKey, true); if (onNum) window.removeEventListener('keydown', onNum, true); };
  const pick = (v) => { close(); onPick(v.id, { ground: (!!v.wing || !!v.pad) && start === 'ground' }); };
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.code === 'KeyR') { e.preventDefault(); e.stopPropagation(); start = start === 'air' ? 'ground' : 'air'; setStart(start); paint(); }
  };
  VEHICLES.forEach((v, i) => {
    const b = document.createElement('button'); b.className = 'vp-item';
    b.innerHTML = `<span class="vp-ic">${v.icon}</span><b>${i + 1}. ${v.name}</b><small>${v.desc}</small>`;
    b.onclick = () => pick(v);
    list.appendChild(b);
  });
  onNum = (e) => { const n = +e.key; if (n >= 1 && n <= VEHICLES.length && !el.hidden) { e.preventDefault(); e.stopPropagation(); pick(VEHICLES[n - 1]); } };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keydown', onNum, true);
  el.hidden = false;
}
