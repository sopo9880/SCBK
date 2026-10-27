// 탈것 조종: 자동차 · 헬기 · 경비행기 · 전투기 · 폭격기
// 모두 아케이드식 조작. 게임의 직접 조종(pilot) 장치를 그대로 씀
import * as THREE from 'three';
import { makeHeli, makeJet, std, glow } from './weapons/models4.js';
import { makeBomber, makeBomb, makeMissile } from './weapons/models.js';
import { pointInPoly } from './geo.js';

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
export const VEHICLES = [
  { id: 'car', name: '자동차', icon: '🚗', desc: 'W 가속 · S 브레이크/후진 · A/D 핸들 · Shift 부스트 · Space 점프 · 클릭 경적', air: false },
  { id: 'heli', name: '헬기', icon: '🚁', desc: 'W/S 앞뒤 · A/D 옆 · 마우스·Q/E 방향 · Space 상승 · Shift 하강 · 클릭 로켓 · 우클릭 기관포', air: true },
  { id: 'plane', name: '경비행기', icon: '🛩', desc: 'W/S 스로틀 · 마우스·방향키 조종 · A/D 방향타 · G 바퀴 · 클릭 연기 켜기/끄기', air: true, wing: true },
  { id: 'fighter', name: '전투기', icon: '✈', desc: 'W/S 스로틀 · Shift 애프터버너 · 마우스·방향키 조종 · G 바퀴 · 클릭 기관포 · Space/우클릭 미사일', air: true, wing: true },
  { id: 'bomber', name: '폭격기', icon: '🛫', desc: 'W/S 스로틀 · 마우스·방향키 조종 · G 바퀴 · 클릭 폭탄 · Space/우클릭 융단 투하', air: true, wing: true },
];
const SPEC = {
  // acc: 지상 가속(스로틀 최대), vr: 이륙 속도, rw: 활주로 길이, rwW: 활주로 폭
  plane: { vmin: 32, vmax: 85, stall: 28, boost: 0, turn: 0.9, pitch: 0.8, scale: 1.4, back: 22, up: 6, crash: 18, acc: 6, vr: 34, rw: 420, rwW: 30 },
  fighter: { vmin: 80, vmax: 320, stall: 70, boost: 430, turn: 1.4, pitch: 1.2, scale: 1.6, back: 34, up: 8, crash: 30, acc: 12, vr: 85, rw: 800, rwW: 40 },
  bomber: { vmin: 70, vmax: 170, stall: 60, boost: 0, turn: 0.45, pitch: 0.45, scale: 1.2, back: 75, up: 18, crash: 45, acc: 6, vr: 72, rw: 1000, rwW: 60 },
};

// ---------- 활주로 ----------
// 건물이 가장 적고 평평한 곳을 찾음 (지도 밖까지 걸쳐도 됨)
function waterTest(data) {
  const polys = [], lines = [];
  for (const a of (data && data.areas) || []) if (a.kind === 'water' && a.outer && a.outer.length > 2) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of a.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    polys.push({ pts: a.outer, x0, x1, z0, z1 });
  }
  for (const w of (data && data.waterLines) || []) for (let i = 0; i + 1 < w.pts.length; i++) lines.push([w.pts[i], w.pts[i + 1], (w.width || 8) / 2 + 4]);
  return (x, z) => {
    for (const p of polys) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && pointInPoly([x, z], p.pts)) return true;
    for (const [[ax, az], [bx, bz], r] of lines) {
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, u = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
      if ((ax + ex * u - x) ** 2 + (az + ez * u - z) ** 2 < r * r) return true;
    }
    return false;
  };
}
function findRunway(game, D, L, W, near) {
  const half = game.grid.span / 2;
  const wet = waterTest(game.data);
  const lim = half + L * 0.25, step = Math.max(40, (lim * 2) / 16);
  let best = null, bc = 1e18;
  for (let a = 0; a < 12; a++) {
    const ang = a * Math.PI / 12, dx = Math.sin(ang), dz = Math.cos(ang);
    for (let cx = -lim; cx <= lim + 1; cx += step) for (let cz = -lim; cz <= lim + 1; cz += step) {
      let cost = Math.hypot(cx - near.x, cz - near.z) * 0.05;
      if (cost > bc) continue;
      let ph = null, hmin = 1e9, hmax = -1e9;
      for (let s = -L / 2; s <= L / 2 + 1; s += 25) {
        const x = cx + dx * s, z = cz + dz * s;
        const inside = Math.abs(x) < half && Math.abs(z) < half;
        const h = game.groundAt(x, z);
        if (ph !== null) cost += Math.max(0, Math.abs(h - ph) - 0.6) * 8;
        ph = h; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
        if (inside) {
          for (const b of D.buildingsNear(x, z, W / 2 + 4)) if (b.state === 'intact' && b.height > 2) cost += 60;
          for (const k of [-0.5, 0, 0.5]) if (wet(x - dz * W * k, z + dx * W * k)) cost += 150;   // 물 위는 안 됨
        }
        else cost += 1.5;
        if (cost > bc) break;
      }
      cost += (hmax - hmin) * 1.5;
      if (cost < bc) { bc = cost; best = { cx, cz, dx, dz }; }
    }
  }
  return best;
}
function runwayTexture(L, W) {
  const cw = 128, ch = Math.min(4096, Math.round(cw * L / W));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  x.fillStyle = '#3b3e43'; x.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 2500; i++) { const v = 50 + Math.random() * 25; x.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; x.fillRect(Math.random() * cw, Math.random() * ch, 2, 2); }
  const ppm = ch / L;
  x.fillStyle = '#e8e8e2';
  x.fillRect(5, 0, 3, ch); x.fillRect(cw - 8, 0, 3, ch);                       // 가장자리 선
  for (let y = 70 * ppm; y < ch - 70 * ppm; y += 50 * ppm) x.fillRect(cw / 2 - 1.5, y, 3, 30 * ppm);   // 가운데 점선
  for (const end of [0, 1]) {
    const y0 = end ? ch - 14 * ppm : 4 * ppm;
    for (let k = 0; k < 8; k++) { const xx = 14 + k * ((cw - 28) / 8) + (k >= 4 ? 6 : 0) - (k >= 4 ? 0 : 0); x.fillRect(xx, y0, (cw - 40) / 8 - 3, 10 * ppm); }   // 문턱 줄무늬
    for (const d of [150, 300]) { const yy = end ? ch - d * ppm : d * ppm; if (d < L / 2) { x.fillRect(22, yy, 14, 22 * ppm); x.fillRect(cw - 36, yy, 14, 22 * ppm); } }   // 접지 표시
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function buildRunway(A, L, W, near) {
  const { game, D, scene, world } = A.ctx;
  const site = findRunway(game, D, L, W, near);
  if (!site) return null;
  const dir = v3(site.dx, 0, site.dz), side = v3(-dir.z, 0, dir.x);
  // 도시 쪽을 향해 이륙하도록 방향을 정함
  const ctr = v3(site.cx, 0, site.cz);
  if (dir.dot(v3(-ctr.x, 0, -ctr.z)) < 0 && ctr.length() > 30) dir.negate(), side.negate();
  const a = ctr.clone().addScaledVector(dir, -L / 2);
  const n = Math.ceil(L / 10) + 1, hs = [];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(L, i * 10), c = a.clone().addScaledVector(dir, s);
    let h = -1e9;
    for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) h = Math.max(h, game.groundAt(c.x + side.x * W * k, c.z + side.z * W * k));
    h += 0.35; hs.push(h);
    for (const k of [-0.5, 0.5]) { pos.push(c.x + side.x * W * k, h, c.z + side.z * W * k); uv.push(k + 0.5, 1 - s / L); }
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: runwayTexture(L, W), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
  // 가장자리 등, 양 끝 초록·빨강 등
  const lamp = new THREE.SphereGeometry(0.45, 6, 4);
  const lights = [];
  for (let s = 0; s <= L; s += 30) for (const k of [-0.5, 0.5]) lights.push([s, k, 0xfff6d8]);
  for (let k = -0.5; k <= 0.5001; k += 0.125) { lights.push([0, k, 0x40ff70]); lights.push([L, k, 0xff3a30]); }
  for (const [s, k, col] of lights) {
    const lm = new THREE.Mesh(lamp, glow(col, 1)); const c = a.clone().addScaledVector(dir, s).addScaledVector(side, W * (k * 1.04));
    lm.position.set(c.x, hs[Math.min(n - 1, Math.round(s / 10))] + 0.4, c.z); g.add(lm);
  }
  scene.add(g);
  // 활주로 위의 나무·작은 건물 치우기 (점수 없음)
  for (let s = 0; s <= L; s += 20) {
    const c = a.clone().addScaledVector(dir, s);
    world.blastTrees(c.x, c.z, W / 2 + 6, W / 2 + 6);
    for (const b of D.buildingsNear(c.x, c.z, W / 2 + 3)) if (b.state === 'intact') D.vaporizeBuilding(b, true);
  }
  const hAt = (p) => {
    const s = (p.x - a.x) * dir.x + (p.z - a.z) * dir.z, l = (p.x - a.x) * side.x + (p.z - a.z) * side.z;
    if (s < 0 || s > L || Math.abs(l) > W / 2 + 2) return null;
    const f = s / 10, i = Math.min(n - 2, Math.floor(f)), u = f - i;
    return hs[i] * (1 - u) + hs[i + 1] * u;
  };
  return { a, dir, side, L, W, hAt, dispose() { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } };
}
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
    el.innerHTML = '<div class="vh-title"></div><div class="vh-box"><div><span>속도</span><b class="vh-spd">0</b><small>km/h</small></div><div><span>고도</span><b class="vh-alt">0</b><small>m</small></div><div class="vh-thr"><span>스로틀</span><i><em></em></i></div></div><div class="vh-help"></div><div class="vh-warn"></div>';
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.querySelector('.vh-title').textContent = title;
  el.querySelector('.vh-help').textContent = desc + ' · C 시점 · Esc 내리기';
  return { el, spd: el.querySelector('.vh-spd'), alt: el.querySelector('.vh-alt'), thr: el.querySelector('.vh-thr em'), thrBox: el.querySelector('.vh-thr'), warn: el.querySelector('.vh-warn') };
}

// 지면 높이 (지도 밖이면 바깥 지형)
const groundAt = (game, x, z) => game.groundAt(x, z);
// 앞쪽으로 건물·파편에 닿는지
function sweepHit(D, from, dir, len) { return D.raycast(from, dir, len); }

export function startVehicle(A, id, opts = {}) {
  const { game, D, fx, audio, grid, scene } = A.ctx;
  const def = VEHICLES.find(v => v.id === id); if (!def) return;
  const t0 = game.controls.target, camPos = game.camera.position;
  const fwd0 = v3(t0.x - camPos.x, 0, t0.z - camPos.z); if (fwd0.lengthSq() < 1) fwd0.set(0, 0, -1); fwd0.normalize();
  const S = A.S;
  const H = hud(def.name, def.desc);
  const st = {
    pos: v3(t0.x, 0, t0.z), vel: v3(), yaw: Math.atan2(fwd0.x, fwd0.z), pitch: 0, roll: 0, speed: 0, thr: 0.5, vy: 0,
    cam: 'chase', cKey: false, crashed: 0, smoke: false, cool: 0, cool2: 0, air: false, hitCD: new Map(), t: 0,
  };
  let mesh;
  if (id === 'car') {
    mesh = makeCar(); mesh.scale.setScalar(1.6);
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
    if (best && bd < 600 * 600) {
      st.pos.x = best.x; st.pos.z = best.z;
      // 카메라가 보던 쪽에 가까운 방향으로
      st.yaw = Math.cos(best.yaw - st.yaw) >= 0 ? best.yaw : best.yaw + Math.PI;
    }
    // 그래도 건물 안이면 밖으로 밀어냄
    for (let i = 0; i < 40; i++) { const inB = D.buildingsNear(st.pos.x, st.pos.z, 3).some(b => b.state === 'intact'); if (!inB) break; st.pos.addScaledVector(fwd0, -6); }
    st.pos.y = groundAt(game, st.pos.x, st.pos.z);
  } else if (id === 'heli') {
    mesh = makeHeli(); mesh.scale.setScalar(1.3);
    let top = groundAt(game, st.pos.x, st.pos.z) + 90;
    for (const b of D.buildingsNear(st.pos.x, st.pos.z, 120)) top = Math.max(top, b.baseY + b.height + 45);
    st.pos.y = top;
  } else {
    const sp = SPEC[id];
    mesh = id === 'plane' ? makeLightPlane() : id === 'fighter' ? makeJet() : makeBomber();
    const gear = addGear(mesh); st.gearG = gear.g;
    mesh.scale.setScalar(sp.scale);
    st.gearH = gear.h * sp.scale;
    if (opts.runway) st.rw = buildRunway(A, sp.rw, sp.rwW, st.pos);
    if (st.rw) {
      // 활주로 끝에서 멈춘 채로 출발
      const rw = st.rw;
      st.pos.copy(rw.a).addScaledVector(rw.dir, 30); st.pos.y = rw.hAt(st.pos) + st.gearH;
      st.yaw = Math.atan2(rw.dir.x, rw.dir.z); st.speed = 0; st.thr = 0; st.ground = true; st.gear = true;
    } else {
      st.pos.addScaledVector(fwd0, -500); st.pos.y = groundAt(game, st.pos.x, st.pos.z) + (id === 'bomber' ? 320 : 180);
      st.speed = (sp.vmin + sp.vmax) * 0.5; st.thr = 0.5; st.gear = false;
    }
    st.gearG.visible = st.gear;
  }
  scene.add(mesh);
  const tmp = v3(), dir = v3();
  const dirOf = () => dir.set(Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), Math.cos(st.yaw) * Math.cos(st.pitch));

  const crash = (q, power) => {
    if (st.crashed) return;
    st.crashed = 0.001; st.endT = 0;
    mesh.visible = false;
    const r = power;
    A.blast(q, r, 40 + st.speed * 0.3, { vap: r * 0.2, crater: [r * 0.3, r * 0.12], lift: 0.5 });
    fx.addShake(1.5); audio.boom(2.5, 40);
    H.warn.textContent = '추락!';
  };
  // 건물에 부딪힘 (자동차·헬기): 속도만큼 부숨
  const bump = (q, b, sp) => {
    const last = st.hitCD.get(b) || -9; if (st.t - last < 0.4) return;
    st.hitCD.set(b, st.t);
    if (sp > 10) { D.explode({ x: q.x, y: q.y + 1, z: q.z, r: 5 + sp * 0.16, power: sp * 1.4, lift: 0.25, lod: 1 }); if (sp > 22 && b && b.cx !== undefined) D.blastFrom(b, q, sp * 1.1, { lift: 0.1, lod: 1 }); fx.dust(q, 3 + sp * 0.08); audio.crumble(Math.min(60, sp)); fx.addShake(Math.min(1.2, sp / 40)); }
    else audio.thud();
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
  // 카메라 앞쪽 조준점 (헬기 로켓용)
  const aimDir = () => { const c = game.camera; const d = v3(); c.getWorldDirection(d); return d; };

  const p = {
    endPoint: null,
    update(dt, inp, realDt) {
      st.t += dt;
      // 시점 바꾸기 (C)
      const ck = inp.has('KeyC'); if (ck && !st.cKey) st.cam = st.cam === 'chase' ? 'cockpit' : 'chase'; st.cKey = ck;
      if (st.crashed) {
        st.endT += realDt;
        p.endPoint = st.pos;
        return st.endT < 2.5;
      }
      const gy = groundAt(game, st.pos.x, st.pos.z);
      H.warn.textContent = '';
      if (id === 'car') {
        // ---- 자동차 ----
        const vmax = inp.boost ? 75 : 42;
        if (inp.w) st.speed += (inp.boost ? 30 : 18) * dt;
        else if (inp.s) st.speed -= (st.speed > 0 ? 34 : 10) * dt;
        else st.speed -= Math.sign(st.speed) * Math.min(Math.abs(st.speed), 6 * dt);
        st.speed = clamp(st.speed, -14, vmax);
        const steer = (inp.d ? -1 : 0) + (inp.a ? 1 : 0);
        st.yaw += steer * dt * 1.8 * Math.min(1, Math.abs(st.speed) / 8) * Math.sign(st.speed || 1);
        dirOf(); dir.y = 0; dir.normalize();
        // 앞을 막는 것
        const front = st.pos.clone().add(v3(0, 1.2, 0));
        const step = st.speed * dt;
        const h = Math.abs(step) > 0.01 ? sweepHit(D, front, dir.clone().multiplyScalar(Math.sign(step)), Math.abs(step) + 3.5) : null;
        if (h && h.info && !h.info.terrain) {
          const sp = Math.abs(st.speed);
          const b = h.info.b || (h.info.chunk && h.info.chunk.b);
          if (h.info.chunk && h.info.chunk.state !== 0) { D.explode({ x: h.point.x, y: h.point.y, z: h.point.z, r: 3, power: sp * 0.8, lift: 0.3, lod: 2 }); st.speed *= 0.92; }
          else { bump(h.point, b || h.info, sp); st.speed *= sp > 25 ? 0.35 : -0.3; }
        } else {
          const prev = st.pos.clone();
          st.pos.addScaledVector(dir, step);
          // 비스듬히 스쳐 들어가도 건물 안으로는 못 들어감
          for (const b of D.buildingsNear(st.pos.x, st.pos.z, 2.5)) {
            if (b.state !== 'intact' && b.state !== 'flat') continue;
            if (st.pos.x > b.minx - 1.5 && st.pos.x < b.maxx + 1.5 && st.pos.z > b.minz - 1.5 && st.pos.z < b.maxz + 1.5 && st.pos.y < b.baseY + (b.flatH || b.height)) {
              st.pos.copy(prev); bump(st.pos.clone().addScaledVector(dir, 3).add(v3(0, 1, 0)), b, Math.abs(st.speed)); st.speed *= Math.abs(st.speed) > 25 ? 0.35 : -0.3; break;
            }
          }
        }
        // 땅 따라가기 + 점프
        const g2 = groundAt(game, st.pos.x, st.pos.z);
        if (inp.space && !st.air) { st.vy = 11; st.air = true; }
        if (st.air) { st.vy -= 22 * dt; st.pos.y += st.vy * dt; if (st.pos.y <= g2) { st.pos.y = g2; st.air = false; if (st.vy < -12) { fx.dust(st.pos, 4); audio.thud(); } st.vy = 0; } }
        else { if (g2 < st.pos.y - 1.5) { st.air = true; st.vy = 0; } else st.pos.y = g2; }
        const lim = grid.span / 2 * 1.4; st.pos.x = clamp(st.pos.x, -lim, lim); st.pos.z = clamp(st.pos.z, -lim, lim);
        // 지면 기울기
        const f1 = groundAt(game, st.pos.x + dir.x * 2, st.pos.z + dir.z * 2), b1 = groundAt(game, st.pos.x - dir.x * 2, st.pos.z - dir.z * 2);
        st.pitch += (Math.atan2(f1 - b1, 4) - st.pitch) * Math.min(1, dt * 8);
        mesh.position.copy(st.pos);
        mesh.rotation.set(0, 0, 0); mesh.rotateY(st.yaw); mesh.rotateX(-st.pitch);
        for (const w of mesh.userData.wheels) w.rotation.x += st.speed * dt / 0.38;
        if (Math.abs(st.speed) > 30 && R() < 0.4) fx.dust(st.pos, 1.2);
        if (inp.lmb && st.cool <= 0) { st.cool = 0.6; audio.horn(0.4); }
        st.cool -= dt;
        st.vel.copy(dir).multiplyScalar(st.speed);
        H.spd.textContent = Math.round(Math.abs(st.speed) * 3.6); H.alt.textContent = Math.round(st.pos.y - g2);
        H.thrBox.hidden = true;
      } else if (id === 'heli') {
        // ---- 헬기 ----
        const yawIn = -dz(inp.x) * 1.4 + (inp.q ? 1 : 0) - (inp.e ? 1 : 0);
        st.yaw += yawIn * dt * 1.3;
        const f = v3(Math.sin(st.yaw), 0, Math.cos(st.yaw)), side = v3(-f.z, 0, f.x);
        const want = v3().addScaledVector(f, (inp.w ? 1 : 0) - (inp.s ? 0.6 : 0)).addScaledVector(side, (inp.a ? 1 : 0) - (inp.d ? 1 : 0)).multiplyScalar(55);
        want.y = (inp.space ? 16 : 0) - (inp.boost ? 16 : 0);
        st.vel.lerp(want, Math.min(1, dt * 1.6));
        const step = st.vel.length() * dt;
        const h = step > 0.01 ? sweepHit(D, st.pos, st.vel.clone().normalize(), step + 6) : null;
        if (h && h.info && !h.info.terrain) {
          // 벽에 부딪히면 그 방향 속도만 없애고 미끄러지듯 (빠르면 건물이 부서짐)
          const n = st.vel.clone().normalize();
          bump(h.point, h.info.b, st.vel.length());
          st.vel.addScaledVector(n, -Math.max(0, st.vel.dot(n)) * 1.05);
          st.pos.addScaledVector(n, -0.5);
        } else st.pos.addScaledVector(st.vel, dt);
        const g2 = groundAt(game, st.pos.x, st.pos.z);
        if (st.pos.y < g2 + 2) { if (st.vel.y < -12) { crash(st.pos.clone(), 14); return true; } st.pos.y = g2 + 2; st.vel.y = Math.max(0, st.vel.y); }
        st.pos.y = Math.min(st.pos.y, g2 + 1500);
        // 진행 방향으로 기울어짐
        const fwdV = st.vel.dot(f), sideV = st.vel.dot(side);
        mesh.position.copy(st.pos);
        mesh.rotation.set(0, 0, 0); mesh.rotateY(st.yaw); mesh.rotateX(fwdV * 0.006); mesh.rotateZ(-sideV * 0.006);
        mesh.userData.rotor.rotation.y += dt * 40; mesh.userData.tail.rotation.x += dt * 50;
        st.cool -= dt; st.cool2 -= dt;
        if (inp.lmb && st.cool <= 0) { st.cool = 0.3; const d = aimDir(); for (const s of [-1, 1]) fireRocket(st.pos.clone().addScaledVector(side, s * 3).add(v3(0, -1.5, 0)), d, 9 * S.r ** 0.6); }
        if (inp.rmb && st.cool2 <= 0) { st.cool2 = 0.06; fireShell(st.pos.clone().add(v3(0, -2, 0)).addScaledVector(f, 4), aimDir().add(v3((R() - 0.5) * 0.02, (R() - 0.5) * 0.02, (R() - 0.5) * 0.02)).normalize(), 3 * S.r ** 0.4); if (R() < 0.3) audio.buzz(0.05); }
        st.speed = st.vel.length();
        H.spd.textContent = Math.round(st.speed * 3.6); H.alt.textContent = Math.round(st.pos.y - g2);
        H.thrBox.hidden = true;
      } else {
        // ---- 비행기 (경비행기·전투기·폭격기) ----
        const sp = SPEC[id];
        if (inp.has(game.cfg.k_fwd)) st.thr = Math.min(1, st.thr + dt * 0.6);
        if (inp.has(game.cfg.k_back)) st.thr = Math.max(0, st.thr - dt * 0.6);
        const ab = sp.boost && inp.boost;
        // 바퀴 접기·펴기 (G)
        const gk = inp.has('KeyG'); if (gk && !st.gKey && !st.ground) { st.gear = !st.gear; st.gearG.visible = st.gear; audio.clack && audio.clack(); } st.gKey = gk;
        const surf = (q) => { const h = st.rw ? st.rw.hAt(q) : null; return h !== null ? h : groundAt(game, q.x, q.z); };
        if (st.ground) {
          // ---- 지상 활주 ----
          const yawIn = -dz(inp.x) * 0.5 - (inp.has('ArrowRight') || inp.d ? 1 : 0) + (inp.has('ArrowLeft') || inp.a ? 1 : 0);
          const pitchIn = dz(inp.y) + (inp.has('ArrowDown') ? 1 : 0) - (inp.has('ArrowUp') ? 1 : 0);
          const brake = inp.has(game.cfg.k_back) && st.thr <= 0.01 ? 14 : 0;
          st.speed += (sp.acc * st.thr + (ab ? sp.acc : 0) - brake - 0.008 * st.speed - (st.speed > 0.1 ? 0.4 : 0)) * dt;
          st.speed = clamp(st.speed, 0, sp.vmax);
          st.yaw += clamp(yawIn, -1, 1) * 0.6 * dt * Math.min(1, st.speed / 8);
          const f = v3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
          const g0 = surf(st.pos), gf = surf(st.pos.clone().addScaledVector(f, 4));
          const slope = Math.atan2(gf - g0, 4);
          if (st.speed > sp.vr * 0.9 && pitchIn > 0.05) st.rot = Math.min(0.28, (st.rot || 0) + pitchIn * sp.pitch * 0.5 * dt);
          else st.rot = Math.max(0, (st.rot || 0) - dt * 0.3);
          st.pitch = slope + st.rot; st.roll *= Math.exp(-dt * 4);
          const step = st.speed * dt;
          const h = step > 0.01 ? sweepHit(D, st.pos.clone().add(v3(0, 1, 0)), f, step + 6) : null;
          if (h && h.info && !h.info.terrain && st.speed > 6) { crash(h.point, sp.crash * S.r ** 0.4); return true; }
          if (!h || !h.info || h.info.terrain) st.pos.addScaledVector(f, step);
          st.pos.y = surf(st.pos) + st.gearH;
          if (st.speed > 15 && R() < 0.3) fx.dust(v3(st.pos.x, st.pos.y - st.gearH, st.pos.z), 0.8 + st.speed * 0.01);
          // 기수를 들고 이륙 속도를 넘으면 뜸
          if (st.speed >= sp.vr && st.rot > 0.06) { st.ground = false; st.liftT = 0; audio.whoosh && audio.whoosh(1); }
          H.warn.textContent = st.speed < sp.vr * 0.9 ? `W 로 스로틀을 올리세요 · 이륙 속도 ${Math.round(sp.vr * 3.6)} km/h` : '이륙 속도 도달! ↓ 키나 마우스를 위로 해 기수를 드세요';
          const lim = grid.span * 4; st.pos.x = clamp(st.pos.x, -lim, lim); st.pos.z = clamp(st.pos.z, -lim, lim);
          dirOf(); st.vel.copy(dir).multiplyScalar(st.speed);
          mesh.position.copy(st.pos); mesh.lookAt(st.pos.clone().add(dir)); mesh.rotateZ(-st.roll);
          if (mesh.userData.prop) mesh.userData.prop.rotation.z += dt * (12 + st.thr * 40);
          if (mesh.userData.flame) mesh.userData.flame.scale.setScalar(ab ? 1.8 : 0.3 + st.thr * 0.7);
          const gy = surf(st.pos);
          H.spd.textContent = Math.round(st.speed * 3.6); H.alt.textContent = Math.round(st.pos.y - st.gearH - gy);
          H.thrBox.hidden = false; H.thr.style.width = (ab ? 100 : st.thr * 100) + '%';
          p.endPoint = st.pos;
          return true;
        }
        if (st.liftT !== undefined) { st.liftT += dt; if (st.gear && st.pos.y - groundAt(game, st.pos.x, st.pos.z) > 45) { st.gear = false; st.gearG.visible = false; audio.clack && audio.clack(); st.liftT = undefined; } }
        const target = ab ? sp.boost : sp.vmin + st.thr * (sp.vmax - sp.vmin);
        st.speed += (target - st.speed) * dt * 0.4 - Math.sin(st.pitch) * 9.8 * dt * 0.6;
        st.speed = Math.max(0, st.speed);
        const yawIn = -dz(inp.x) - (inp.has('ArrowRight') || inp.d ? 1 : 0) + (inp.has('ArrowLeft') || inp.a ? 1 : 0);
        const pitchIn = dz(inp.y) + (inp.has('ArrowDown') ? 1 : 0) - (inp.has('ArrowUp') ? 1 : 0);
        st.yaw += clamp(yawIn, -1.3, 1.3) * sp.turn * dt;
        st.pitch += clamp(pitchIn, -1.3, 1.3) * sp.pitch * dt;
        const stalling = st.speed < sp.stall;
        if (stalling) { st.pitch -= dt * 0.7; H.warn.textContent = '실속! 속도를 올리세요'; }
        st.pitch = clamp(st.pitch, -1.35, 1.2);
        st.roll += (clamp(yawIn, -1.3, 1.3) * 0.9 - st.roll) * Math.min(1, dt * 3);
        dirOf();
        const step = st.speed * dt;
        const h = sweepHit(D, st.pos, dir, step + 4);
        if (h && h.info && !h.info.terrain) { crash(h.point, sp.crash * S.r ** 0.4); return true; }
        st.pos.addScaledVector(dir, step);
        if (stalling) st.pos.y -= (sp.stall - st.speed) * 0.3 * dt;
        const g2 = surf(st.pos);
        // 바퀴를 내리고 완만하게 내려오면 착륙, 아니면 추락
        if (st.gear && st.pos.y <= g2 + st.gearH) {
          const vy = st.speed * Math.sin(st.pitch);
          if (vy > -7 && st.pitch > -0.2 && Math.abs(st.roll) < 0.4) { st.ground = true; st.rot = Math.max(0, st.pitch); st.pos.y = g2 + st.gearH; fx.dust(v3(st.pos.x, g2, st.pos.z), 3); audio.thud(); if (A.ctx.hud && A.ctx.hud.toast) A.ctx.hud.toast('착륙!', 'info'); return true; }
          crash(v3(st.pos.x, g2, st.pos.z), sp.crash * S.r ** 0.4); return true;
        }
        if (st.pos.y <= g2 + 1) { crash(v3(st.pos.x, g2, st.pos.z), sp.crash * S.r ** 0.4); return true; }
        if (st.gear && st.pos.y - g2 < 60 && !H.warn.textContent) H.warn.textContent = '바퀴 내림 · 천천히 내려오면 착륙';
        const lim = grid.span * 4; if (Math.abs(st.pos.x) > lim || Math.abs(st.pos.z) > lim) st.yaw += dt * 2;   // 너무 멀리 가면 되돌아옴
        st.vel.copy(dir).multiplyScalar(st.speed);
        mesh.position.copy(st.pos);
        mesh.lookAt(st.pos.clone().add(dir)); mesh.rotateZ(-st.roll);
        if (mesh.userData.prop) mesh.userData.prop.rotation.z += dt * (20 + st.thr * 40);
        if (mesh.userData.flame) mesh.userData.flame.scale.setScalar(ab ? 1.8 : 0.6 + st.thr * 0.6);
        if (st.smoke && R() < 0.9) fx.smoke.emit(st.pos.x - dir.x * 4, st.pos.y - dir.y * 4, st.pos.z - dir.z * 4, 0, 0.5, 0, 6, 1.5, 6, [1, 0.35, 0.5, 0.8], [0.9, 0.6, 0.8, 0], 0.2, 0.1);
        st.cool -= dt; st.cool2 -= dt;
        if (id === 'plane') { if (inp.lmb && st.cool <= 0) { st.cool = 0.4; st.smoke = !st.smoke; } }
        if (id === 'fighter') {
          if (inp.lmb && st.cool <= 0) { st.cool = 0.05; fireShell(st.pos.clone().addScaledVector(dir, 8), dir.clone().add(v3((R() - 0.5) * 0.01, (R() - 0.5) * 0.01, (R() - 0.5) * 0.01)).normalize(), 3.5 * S.r ** 0.4); if (R() < 0.3) audio.buzz(0.05); }
          if ((inp.space || inp.rmb) && st.cool2 <= 0) { st.cool2 = 0.8; const side = v3(-dir.z, 0, dir.x).normalize(); fireRocket(st.pos.clone().addScaledVector(side, (R() < 0.5 ? -1 : 1) * 4).add(v3(0, -1, 0)), dir, 22 * S.r ** 0.7); }
        }
        if (id === 'bomber') {
          if (inp.lmb && st.cool <= 0) { st.cool = 0.35; dropBomb(false); }
          if ((inp.space || inp.rmb) && st.cool2 <= 0) { st.cool2 = 3; let k = 0; A.addActive({ t: 0, update(d2) { this.t += d2; while (k < 12 && this.t > k * 0.12) { k++; if (!st.crashed) dropBomb(true); } return k < 12; } }); }
        }
        H.spd.textContent = Math.round(st.speed * 3.6); H.alt.textContent = Math.round(st.pos.y - g2);
        H.thrBox.hidden = false; H.thr.style.width = (ab ? 100 : st.thr * 100) + '%';
      }
      p.endPoint = st.pos;
      return true;
    },
    camera(c) {
      mesh.visible = st.cam !== 'cockpit' && !st.crashed;
      c.anchor = st.pos;
      const f = id === 'car' || id === 'heli' ? v3(Math.sin(st.yaw), 0, Math.cos(st.yaw)) : dirOf().clone();
      if (st.cam === 'cockpit') {
        const seat = id === 'car' ? v3(0, 2.3, 0.3) : id === 'heli' ? v3(0, 1.2, 3.5) : id === 'bomber' ? v3(0, 3, 14) : v3(0, 1.2, 2.5);
        c.pos.copy(st.pos).add(seat.applyAxisAngle(UP, st.yaw));
        c.look.copy(c.pos).addScaledVector(f, 100).add(v3(0, id === 'car' ? -4 : 0, 0));
        c.fov = 72;
      } else {
        const back = id === 'car' ? 13 : id === 'heli' ? 32 : SPEC[id].back, up = id === 'car' ? 5 : id === 'heli' ? 11 : SPEC[id].up;
        const ff = f.clone(); if (id !== 'car' && id !== 'heli') ff.y *= 0.5;
        c.pos.copy(st.pos).addScaledVector(ff, -back).add(v3(0, up, 0));
        c.look.copy(st.pos).addScaledVector(f, id === 'heli' ? 40 : 30);
        c.fov = 62 + (id === 'fighter' ? Math.min(14, st.speed * 0.03) : 0);
      }
    },
    click() {},
    abort() { game.endPilot(true); },
    dispose() { H.el.hidden = true; scene.remove(mesh); if (st.rw) st.rw.dispose(); },
  };
  p._st = st;
  game.startPilot(p);
  if (A.ctx.hud && A.ctx.hud.toast) A.ctx.hud.toast(`${def.name} 탑승 — Esc 로 내리기`, 'info');
  return p;
}

// 탈것 고르기 창 (비행기는 하늘에서 / 활주로에서 출발 선택)
const START_KEY = 'we.vehStart';
const getStart = () => { try { return localStorage.getItem(START_KEY) || 'air'; } catch (e) { return 'air'; } };
const setStart = (v) => { try { localStorage.setItem(START_KEY, v); } catch (e) { /* 저장 못 해도 이번엔 적용 */ } };
export function openVehiclePicker(onPick) {
  let el = document.getElementById('vehPick');
  if (!el) {
    el = document.createElement('div'); el.id = 'vehPick';
    el.innerHTML = '<div class="vp-card"><h3>탈것</h3><div class="vp-list"></div><div class="vp-start"><span>비행기 출발</span><button data-v="air">하늘에서</button><button data-v="runway">활주로에서</button></div><p class="vp-note">지금 보고 있는 곳에 나타나요 · R 출발 바꾸기 · Esc 닫기</p></div>';
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
  const pick = (v) => { close(); onPick(v.id, { runway: !!v.wing && start === 'runway' }); };
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.code === 'KeyR') { e.preventDefault(); e.stopPropagation(); start = start === 'air' ? 'runway' : 'air'; setStart(start); paint(); }
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
