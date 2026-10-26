// ×100(위력 75 이상) 세계 멸망 결말: 무기마다 그 무기다운 방식으로 지도와 지평선, 행성까지 끝장냄
import * as THREE from 'three';
import { makeMeteor, makeRod, makeBomb, makeBomber } from './models.js';
import { worldEnd, wipeMap, crustCollapse, isWorldEnd } from './apocalypse.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

// 지도 안 아무 지점
export function mapPoint(A, margin = 0.92, near = null, spread = 1) {
  const { grid } = A.ctx;
  const h = grid.span / 2 * margin;
  let x, z;
  if (near) { const a = R() * 6.28, d = Math.sqrt(R()) * h * spread; x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d; x = Math.max(-h, Math.min(h, x)); z = Math.max(-h, Math.min(h, z)); }
  else { x = (R() * 2 - 1) * h; z = (R() * 2 - 1) * h; }
  return v3(x, grid.sample(x, z), z);
}

// 물리 없이 보이기만 하는 큰 폭발 (지도 전체에 수십 개를 뿌릴 때)
export function fxBlast(A, q, r, opts = {}) {
  const { fx, world, audio, camera } = A.ctx;
  fx.explosion(q, r * 0.75, { ring: true, smokeColumn: opts.smoke !== false });
  world.paintScorch(q.x, q.z, r * 1.1, 0.8);
  world.blastTrees(q.x, q.z, r * 1.2, r * 0.6);
  if (!opts.silent) audio.boom(Math.min(3, r / 15), camera.position.distanceTo(q));
}

// n개의 사건을 dur 초 동안 고르게
export function over(A, n, dur, fn, delay = 0) {
  let k = 0;
  A.addActive({ t: 0, update(dt) { this.t += dt; while (k < n && this.t >= delay + (k / n) * dur) fn(k++); return k < n; } });
}

// 다른 무기를 같은 위력으로 여러 번 (연출 카메라는 끔, 결말 재귀 방지)
export function copies(A, id, n, dur, spread = 1) {
  over(A, n, dur, () => {
    const p = mapPoint(A, 0.9, v3(0, 0, 0), spread);
    const cine = A.opts.cinematic; A.opts.cinematic = false; A._noEnding = true;
    try { A.fireAs(id, { point: p, info: null }); } finally { A.opts.cinematic = cine; A._noEnding = false; }
  });
}

// 하늘에서 떨어지는 투사체 폭우
export function rain(A, n, dur, { model = makeMeteor, size = 6, r = 40, speed = 260, angle = 0.5, phys = 0.25 } = {}) {
  const az = R() * 6.28;
  const dirIn = v3(Math.cos(az) * angle, -1, Math.sin(az) * angle).normalize();
  over(A, n, dur, (k) => {
    const q = mapPoint(A, 0.95);
    const sz = size * (0.6 + R() * 0.8);
    A.addProjectile({
      mesh: A.spawn(model(), sz), pos: q.clone().addScaledVector(dirIn, -900), vel: dirIn.clone().multiplyScalar(speed), align: model === makeMeteor ? null : 'down',
      trail: { size: sz * 0.8, fire: true, every: 0.02 }, spin: model === makeMeteor,
      onHit: (qq) => { const rr = r * (0.7 + R() * 0.6); if (R() < phys) A.blast(qq, rr, 40, { vap: rr * 0.2, crater: [rr * 0.4, rr * 0.15], silent: R() > 0.3 }); else { fxBlast(A, qq, rr, { silent: R() > 0.2 }); A.crater(qq.x, qq.z, rr * 0.4, rr * 0.12); } },
    });
  });
}

// 지도 전체가 물에 잠김
export function flood(A, { dur = 12, color = 0x2a5c7a, height = 1 } = {}) {
  const { scene, grid, D, fx, world } = A.ctx;
  let lo = Infinity, hi = -Infinity;
  for (const h of grid.h) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  let top = hi;
  for (const b of D.buildings) top = Math.max(top, b.baseY + b.height);
  top = lo + (top - lo) * height;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.86 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), mat);
  sea.rotation.x = -Math.PI / 2; sea.scale.set(grid.span * 8, grid.span * 8, 1); sea.renderOrder = 3;
  scene.add(sea);
  const done = new Set();
  A.addActive({
    t: 0, acc: 0,
    update(dt) {
      this.t += dt;
      const u = Math.min(1, this.t / dur);
      const y = lo - 5 + (top + 30 - lo) * (1 - (1 - u) ** 2);
      sea.position.y = y;
      // 잠긴 건물은 물살에 무너짐
      if ((this.acc += dt) > 0.25) {
        this.acc = 0;
        for (const b of D.buildings) {
          if (done.has(b) || b.state !== 'intact' || b.baseY + b.height * 0.35 > y) continue;
          done.add(b);
          D.flatten(b, 0.5 + R() * 0.4, R() - 0.5, R() - 0.5, 2.5);
        }
        for (let i = 0; i < 8; i++) { const p = mapPoint(A, 0.95); fx.smoke.emit(p.x, y + 2, p.z, (R() - 0.5) * 10, 3, (R() - 0.5) * 10, 4, 10, 30, [0.85, 0.9, 0.95, 0.5], [0.8, 0.85, 0.9, 0], 0.5, 0.3); }
      }
      return u < 1 || this.t < dur + 60;
    },
    dispose() { scene.remove(sea); sea.geometry.dispose(); mat.dispose(); },
  });
}

// 지도 위 모든 건물이 하늘로 떨어져 사라짐
export function liftAll(A, c, dur = 7) {
  const { D } = A.ctx;
  const list = D.buildings.filter(b => b.state === 'intact').sort((a, b) => Math.hypot(a.cx - c.x, a.cz - c.z) - Math.hypot(b.cx - c.x, b.cz - c.z));
  list.forEach((b, i) => D.levitate(b, 2500 + R() * 2500, 6 + R() * 4, (i / list.length) * dur));
  // 흩어진 파편도 위로
  for (const ch of D.loose) { if (ch.state === 3) continue; if (D.launch(ch, (R() - 0.5) * 4, 30 + R() * 30, (R() - 0.5) * 4)) { ch.body.setGravityScale(-0.6, true); ch.float = true; } }
}

// 줄지어 지나가는 폭격기 편대 (그림만, 폭탄은 rain 으로)
export function fleet(A, n = 14, dur = 10) {
  const { grid } = A.ctx;
  const half = grid.span / 2;
  const dir = v3(R() - 0.5, 0, R() - 0.5).normalize();
  const side = v3(-dir.z, 0, dir.x);
  const planes = [];
  for (let i = 0; i < n; i++) {
    const m = A.spawn(makeBomber(), 1.6);
    const off = (i - n / 2) * (half * 2 / n);
    planes.push({ m, p: v3(0, 0, 0).addScaledVector(dir, -half * 2.2).addScaledVector(side, off).add(v3(0, grid.sample(0, 0) + 520 + R() * 120, 0)), d: R() * 2 });
    m.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
  }
  A.addActive({ t: 0, update(dt) { this.t += dt; for (const pl of planes) { if (this.t < pl.d) continue; pl.p.addScaledVector(dir, 210 * dt); pl.m.position.copy(pl.p); } return this.t < dur + 20; }, dispose() { for (const pl of planes) A.remove(pl.m); } });
}

// 무기별 결말. c = 겨눈 지점
export const ENDINGS = {
  bomb: (A, c) => { rain(A, 70, 9, { model: makeBomb, size: 3, r: 45, speed: 160, angle: 0.1, phys: 0.2 }); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 2 }); },
  missile: (A, c) => { copies(A, 'missile', 50, 8); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 2 }); },
  cluster: (A, c) => { copies(A, 'cluster', 14, 7); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 2 }); },
  thermobaric: (A, c) => { over(A, 40, 5, () => fxBlast(A, mapPoint(A), 70 + R() * 50, { silent: R() > 0.3 })); wipeMap(A, c, 'nuke', { dur: 5 }); worldEnd(A, c, 'fire', { delay: 1 }); },
  napalm: (A, c) => { over(A, 80, 8, () => { const p = mapPoint(A); A.ctx.fx.column(p, 8 + R() * 10, 20 + R() * 15); A.ctx.world.paintScorch(p.x, p.z, 60, 0.9); }); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'fire', { delay: 3 }); },
  railgun: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 3 }); wipeMap(A, c, 'nuke', { dur: 6 }); worldEnd(A, c, 'crack', { delay: 1, planetKind: 'shatter' }); },
  carpet: (A, c) => { fleet(A, 16, 10); rain(A, 90, 10, { model: makeBomb, size: 2.5, r: 40, speed: 140, angle: 0.15, phys: 0.15 }); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'fire', { delay: 3 }); },
  bunker: (A, c) => { crustCollapse(A, c, { level: 1 }); wipeMap(A, c, 'nuke', { dur: 7 }); worldEnd(A, c, 'crack', { delay: 1 }); },
  cruise: (A, c) => { copies(A, 'cruise', 12, 6); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'fire', { delay: 4 }); },
  drones: (A, c) => { copies(A, 'drones', 5, 4); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'fire', { delay: 4 }); },
  naval: (A, c) => { copies(A, 'naval', 4, 5); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'fire', { delay: 5 }); },
  laser: (A, c) => { over(A, 24, 8, () => { const p = mapPoint(A); fxBlast(A, p, 50, { smoke: false, silent: true }); A.ctx.fx.column(p, 6, 10); }); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 2 }); },
  meteor: (A, c) => { rain(A, 120, 12, { model: makeMeteor, size: 8, r: 55, speed: 240, angle: 0.6, phys: 0.2 }); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'impact', { delay: 3 }); },
  rod: (A, c) => { rain(A, 45, 8, { model: makeRod, size: 4, r: 70, speed: 600, angle: 0.05, phys: 0.3 }); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'impact', { delay: 2 }); },
  mothership: (A, c) => { copies(A, 'mothership', 3, 4, 0.8); worldEnd(A, c, 'fire', { delay: 6, finaleDelay: 12 }); },
  solar: (A, c) => { A.ctx.fx.flash = Math.max(A.ctx.fx.flash, 0.9); over(A, 60, 6, () => { const p = mapPoint(A); A.ctx.fx.column(p, 10, 25); }); wipeMap(A, c, 'nuke', { dur: 9 }); worldEnd(A, c, 'fire', { delay: 0.5 }); },
  lightning: (A, c) => { copies(A, 'lightning', 4, 3); wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'water', { delay: 4, planetKind: 'crack' }); },
  quake: (A, c) => { crustCollapse(A, c, { level: 1, dur: 11 }); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'crack', { delay: 2 }); },
  tornado: (A, c) => { copies(A, 'tornado', 5, 4); wipeMap(A, c, 'nuke', { dur: 18 }); worldEnd(A, c, 'dust', { delay: 4, planetKind: 'ash' }); },
  sinkhole: (A, c) => { A.crater(c.x, c.z, A.ctx.grid.span * 0.45, 120); crustCollapse(A, c, { level: 1 }); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'crack', { delay: 1 }); },
  tsunami: (A, c) => { flood(A, { dur: 14 }); worldEnd(A, c, 'water', { delay: 4, wave: true }); },
  volcano: (A, c) => { copies(A, 'volcano', 3, 6, 0.8); crustCollapse(A, c, { level: 1, dur: 12 }); worldEnd(A, c, 'ash', { delay: 3, planetKind: 'ash' }); },
  landslide: (A, c) => { copies(A, 'landslide', 4, 4); crustCollapse(A, c, { level: 0.8 }); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'dust', { delay: 3, planetKind: 'crack' }); },
  iceage: (A, c) => { wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'ice', { delay: 2 }); },
  blackhole: (A, c) => { wipeMap(A, c, 'void', { dur: 10 }); worldEnd(A, c, 'void', { delay: 4 }); },
  whitehole: (A, c) => { wipeMap(A, c, 'anti', { dur: 6 }); worldEnd(A, c, 'anti', { delay: 2, planetKind: 'shatter' }); },
  antigrav: (A, c) => { liftAll(A, c, 6); worldEnd(A, c, 'void', { delay: 3, planetKind: 'shatter' }); },
  gravflip: (A, c) => { liftAll(A, c, 4); A.ctx.D.phys.setGravity(0, 6, 0); worldEnd(A, c, 'void', { delay: 2, planetKind: 'shatter' }); },
  ball: (A, c) => { crustCollapse(A, c, { level: 0.8, cracks: 6 }); wipeMap(A, c, 'nuke', { dur: 7 }); worldEnd(A, c, 'impact', { delay: 2 }); },
  bowling: (A, c) => { crustCollapse(A, c, { level: 0.8, cracks: 4 }); worldEnd(A, c, 'impact', { delay: 5 }); },
  domino: (A, c) => { wipeMap(A, c, 'nuke', { dur: 16 }); worldEnd(A, c, 'dust', { delay: 6, planetKind: 'crack' }); },
  finger: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 10 }); wipeMap(A, c, 'nuke', { dur: 5 }); worldEnd(A, c, 'crack', { delay: 1, planetKind: 'shatter' }); },
  stomp: (A, c) => { crustCollapse(A, c, { level: 1 }); wipeMap(A, c, 'nuke', { dur: 7 }); worldEnd(A, c, 'crack', { delay: 2 }); },
  kaiju: (A, c) => { crustCollapse(A, c, { level: 1, dur: 14 }); worldEnd(A, c, 'crack', { delay: 10 }); },
  train: (A, c) => { wipeMap(A, c, 'nuke', { dur: 9 }); worldEnd(A, c, 'fire', { delay: 6 }); },
  // 핵 계열(nuke, bomber, icbm, tsar, antimatter)과 소행성은 폭발 자체가 위력에 맞춰 세계를 끝냄
};

// 무기를 쏜 직후 불림
export function runEnding(A, id, point) {
  if (A._noEnding || !isWorldEnd(A) || !ENDINGS[id] || !point) return;
  const c = v3(point.x, A.ctx.grid.sample(point.x, point.z), point.z);
  // 무기 자체의 연출이 먼저 보이도록 살짝 늦게
  const delay = { kaiju: 10, bowling: 3, train: 3, mothership: 8, volcano: 5, tsunami: 4, domino: 3, cruise: 3, naval: 4 }[id] ?? 1.2;
  A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t >= delay) { ENDINGS[id](A, c); return false; } return true; } });
  if (A.ctx.hud && A.ctx.hud.toast) A.ctx.hud.toast('세계 멸망', 'info');
}
