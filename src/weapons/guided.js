// 직접 조종 유도 미사일: 발사하면 미사일 시점으로 바뀌고, 마우스·방향키로 조종해 표적에 꽂음
import * as THREE from 'three';
import { makeMissile } from './models.js';
import { worldEnd, wipeMap } from './apocalypse.js';
import { copies } from './endings.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

// 조종 화면 (조준선 + 속도·고도·연료)
function pilotHud() {
  let el = document.getElementById('pilotHud');
  if (!el) {
    el = document.createElement('div'); el.id = 'pilotHud';
    el.innerHTML = `<div class="ph-cross"></div><div class="ph-ring"></div>
      <div class="ph-left"><div><span>속도</span><b id="phSpd">0</b><small>km/h</small></div><div><span>고도</span><b id="phAlt">0</b><small>m</small></div></div>
      <div class="ph-right"><span>연료</span><div class="ph-fuel"><i id="phFuel"></i></div></div>
      <div class="ph-title" id="phTitle"></div>
      <div class="ph-help">마우스를 움직인 쪽으로 방향 전환 · W/S/A/D(방향키)로도 조종 · Shift 가속 · 클릭 기폭 · Esc 자폭</div>`;
    document.body.appendChild(el);
  }
  el.hidden = false;
  return el;
}

export function guidedPilot(A, from, dir0, { title = '유도 미사일', speed = 95, boostMul = 2, fuel = 26, radius = null, onBoom = null } = {}) {
  const { game, D, fx, audio, grid } = A.ctx;
  const S = A.S;
  const r = radius || 30 * S.r ** 0.8;
  const m = A.spawn(makeMissile(), 2.2);
  const pos = from.clone(), dir = dir0.clone().normalize();
  let yaw = Math.atan2(dir.x, dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  let spd = speed, left = fuel, t = 0, done = false;
  const el = pilotHud();
  el.querySelector('#phTitle').textContent = title;
  const $s = el.querySelector('#phSpd'), $a = el.querySelector('#phAlt'), $f = el.querySelector('#phFuel');
  audio.rocket(2);
  let roll = 0;
  const p = {
    endPoint: null,
    boom(q) {
      if (done) return;
      done = true;
      const at = v3(q.x, q.y, q.z);
      p.endPoint = at;
      A.remove(m);
      if (onBoom) onBoom(at); else A.blast(at, r, 60 * S.v, { vap: r * 0.25, crater: [r * 0.5, r * 0.22], lift: 0.5 });
      fx.flash = Math.max(fx.flash, 0.25);
      audio.boom(3, 50);
    },
    update(dt, inp) {
      if (done) return false;
      t += dt;
      // 조종: 화면 가운데에서 마우스가 벗어난 만큼 회전 (가운데 근처는 무시) + 키보드
      const dz = (v) => (Math.abs(v) < 0.06 ? 0 : (v - Math.sign(v) * 0.06) / 0.94);
      let sx = dz(inp.x), sy = dz(inp.y);
      if (inp.left) sx = -1; if (inp.right) sx = 1; if (inp.up) sy = 1; if (inp.down) sy = -1;
      const turn = 1.5;
      yaw -= sx * turn * dt; pitch += sy * turn * dt * 0.8;
      pitch = Math.max(-1.45, Math.min(1.2, pitch));
      roll += (-sx * 0.7 - roll) * Math.min(1, dt * 4);
      const boosting = inp.boost && left > 0;
      if (left > 0) left -= dt * (boosting ? 2.2 : 1);
      const want = left > 0 ? speed * (boosting ? boostMul : 1) : spd;
      spd += (want - spd) * Math.min(1, dt * 1.5);
      dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      // 연료가 떨어지면 아래로 처짐
      if (left <= 0) { pitch = Math.max(-1.45, pitch - dt * 0.35); }
      const step = spd * dt;
      const hit = D.raycast(pos, dir, step + 1);
      const gy = game.groundAt(pos.x + dir.x * step, pos.z + dir.z * step);
      if (hit) { p.boom(hit.point); return false; }
      pos.addScaledVector(dir, step);
      if (pos.y <= gy + 0.5) { p.boom(v3(pos.x, gy, pos.z)); return false; }
      const half = grid.span / 2;
      if (Math.abs(pos.x) > half * 3 || Math.abs(pos.z) > half * 3 || pos.y > gy + 6000 || t > 90) { p.boom(pos); return false; }
      m.position.copy(pos);
      m.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
      m.rotateZ(roll);
      // 불꽃 꼬리
      fx.trail(pos.clone().addScaledVector(dir, -3), boosting ? 1.6 : 1.1, left > 0);
      $s.textContent = Math.round(spd * 3.6);
      $a.textContent = Math.round(pos.y - gy);
      $f.style.height = Math.max(0, left / fuel * 100) + '%';
      $f.classList.toggle('low', left < fuel * 0.25);
      return true;
    },
    camera(c) {
      const up = v3(0, 1, 0);
      c.pos.copy(pos).addScaledVector(dir, -16).addScaledVector(up, 4.5);
      c.look.copy(pos).addScaledVector(dir, 80);
      c.fov = 68 + Math.min(14, (spd - speed) * 0.1);
    },
    click() { p.boom(pos); game.endPilot(false); },
    abort() { p.boom(pos); game.endPilot(true); },
    dispose() { el.hidden = true; if (!done) A.remove(m); },
  };
  game.startPilot(p);
  return p;
}

export const GUIDED = {
  guided: {
    fire(A, hit, cam) {
      const { game, grid } = A.ctx;
      const p = hit.point;
      const tgt = v3(p.x, p.y, p.z);
      // 카메라 뒤 높은 곳에서 발사해 표적 쪽으로 출발
      const back = v3().subVectors(cam, tgt); back.y = 0; if (back.lengthSq() < 1) back.set(1, 0, 0); back.normalize();
      const from = tgt.clone().addScaledVector(back, Math.min(grid.span * 0.6, 900)); from.y = Math.max(cam.y, grid.sample(from.x, from.z) + 260);
      if (!game) { A.blast(tgt, 30 * A.S.r ** 0.8, 60 * A.S.v, {}); return; }
      guidedPilot(A, from, tgt.clone().sub(from));
    },
  },
};

export const GUIDED_ENDINGS = {
  guided: (A, c) => { copies(A, 'missile', 50, 8); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 2 }); },
};
