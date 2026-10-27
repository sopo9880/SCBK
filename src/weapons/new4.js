// v1.4 새 무기 (폭발·공습·하늘·자연재해)
// 철거 발파, 지뢰밭, EMP 폭탄, 분진 폭발 / 헬기 로켓 강습, 극초음속 활공체, 비행선 추락, 전투기 기총소사
// 우주 엘리베이터 붕괴, 거대 우박, 중성자별 근접 통과, 궤도 거울 집광 / 지반 액상화, 대형 산불, 간헐천, 빙산 충돌, 메탄 분출
import * as THREE from 'three';
import { makeBomb, makeMissile, makeBomber } from './models.js';
import { makeHeli, makeJet, makeGlider, makeAirship, makeSilo, makeMine, makeIceberg, makeClimateSat, lumpy, glow, std } from './models4.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';
import { fxBlast, over, mapPoint, flood, liftAll, rain, copies } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';
import { boltMesh } from './storms.js';
import { sharedUniforms } from '../materials.js';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const UP = v3(0, 1, 0);
const hitB = (hit) => hit && hit.info && (hit.info.b || (hit.info.chunk && hit.info.chunk.b));
const sideOf = (f) => v3(-f.z, 0, f.x);
const disposeObj = (scene, o) => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); }); };
const ICE = new THREE.Color(0xdcefff), HOT = new THREE.Color(0xff6a20), RUST = new THREE.Color(0x7a5236);
// 겨눈 지점 근처의 온전한 건물 (없으면 null)
function nearestIntact(D, x, z, r = 80) {
  let best = null, bd = 1e9;
  for (const b of D.buildingsNear(x, z, r)) { if (b.state !== 'intact') continue; const d = Math.hypot(b.cx - x, b.cz - z); if (d < bd) { bd = d; best = b; } }
  return best;
}
// 지면 높이 (지도 밖이면 바깥 지형)
const groundY = (A, x, z) => (A.ctx.game && A.ctx.game.groundAt ? A.ctx.game.groundAt(x, z) : A.ctx.grid.sample(x, z));
// 화면용 짧은 큰 물체 연기
function puff(fx, p, size, col = [0.62, 0.6, 0.57], n = 6, up = 4) {
  for (let i = 0; i < n; i++) fx.smoke.emit(p.x + (R() - 0.5) * size, p.y + R() * size * 0.3, p.z + (R() - 0.5) * size, (R() - 0.5) * size * 0.4, up + R() * up, (R() - 0.5) * size * 0.4, 4 + R() * 4, size * 0.5, size * 2, [col[0], col[1], col[2], 0.6], [col[0], col[1], col[2], 0], 0.6, 0.5);
}

// ---- EMP 공통: 하늘의 섬광 + 번개 줄기 + 변압기 폭발 + 추락하는 비행기 + 도시 정전 ----
function empStrike(A, c, { alt = 400, R0 = 400, planes = 3, big = false } = {}) {
  const { scene, fx, D, audio, grid } = A.ctx;
  const burst = v3(c.x, c.y + alt, c.z);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), glow(0x9fd4ff, 0.55));
  shell.position.copy(burst); scene.add(shell);
  fx.flash = Math.max(fx.flash, big ? 0.9 : 0.45);
  fx.light(burst.x, burst.y, burst.z, big ? 6e5 : 6e4, R0 * 6, 1.4, 0x9fd4ff);
  audio.crack(); audio.buzz(3);
  // 높은 건물 지붕으로 번개 줄기
  const tall = D.buildingsNear(c.x, c.z, R0).filter(b => b.state === 'intact').sort((a, b) => b.height - a.height).slice(0, Math.round(10 + R0 / 40));
  const bolts = [];
  let bi = 0, blasts = 0;
  A.addActive({
    t: 0, acc: 0,
    update(dt) {
      this.t += dt;
      const u = Math.min(1, this.t / 1.4);
      shell.scale.setScalar(R0 * 1.2 * ease.out(u));
      shell.material.opacity = 0.55 * (1 - u);
      sharedUniforms.uPower.value = Math.max(0, 1 - this.t / 0.6);
      this.acc += dt;
      while (this.acc > 0.09 && bi < tall.length) {
        this.acc -= 0.09;
        const b = tall[bi++];
        const top = v3(b.cx, b.baseY + b.height + 1, b.cz);
        const m = boltMesh(v3(burst.x + (R() - 0.5) * 60, burst.y - 10, burst.z + (R() - 0.5) * 60), top);
        scene.add(m); bolts.push({ m, t: 0 });
        fx.sparks(top, UP, 16); fx.light(top.x, top.y, top.z, 3000, 120, 0.3, 0xbfe0ff);
        // 변압기·전력망 폭발
        if (blasts < (big ? 18 : 8) && R() < 0.6) { blasts++; A.blast(top, 6 + R() * 6, 18, { lift: 0.3, scorch: 0.6, silent: R() > 0.3, lod: 1 }); fx.column(top, 3, 8); }
      }
      for (let i = bolts.length - 1; i >= 0; i--) { const bo = bolts[i]; bo.t += dt; if (bo.t > 0.22) { disposeObj(scene, bo.m); bolts.splice(i, 1); } }
      return this.t < 3 || bolts.length > 0;
    },
    dispose() { disposeObj(scene, shell); for (const bo of bolts) disposeObj(scene, bo.m); },
  });
  // 추락하는 비행기
  const list = [];
  for (let i = 0; i < planes; i++) {
    const a = R() * 6.28, d = 250 + R() * R0 * 0.8;
    const pos = v3(c.x + Math.cos(a) * d, c.y + 280 + R() * 220, c.z + Math.sin(a) * d);
    const head = v3(Math.cos(a + 1.6 + (R() - 0.5)), 0, Math.sin(a + 1.6 + (R() - 0.5))).normalize();
    const big2 = R() < 0.4;
    const mesh = A.spawn(big2 ? makeBomber() : makeJet(), big2 ? 0.9 : 1.3);
    const pr = A.addProjectile({
      mesh, pos, vel: head.multiplyScalar(85 + R() * 30), align: 'fwd', g: 0, ignoreHits: true, dead: false, k: i,
      onUpdate(p, dt) {
        p.age = (p.age || 0) + dt;
        if (!p.dead && p.age > 0.3 + R() * 0.2) { p.dead = true; p.g = 9.8; p.ignoreHits = false; if (mesh.userData.flame) mesh.userData.flame.visible = false; p.vel.y -= 8; }
        if (p.dead) {
          p.vel.y -= dt * 4;
          if (R() < 0.7) fx.smoke.emit(p.pos.x, p.pos.y, p.pos.z, 0, 2, 0, 5, 3, 12, [0.15, 0.15, 0.15, 0.7], [0.3, 0.3, 0.3, 0], 0.4, 0.5);
          if (R() < 0.4) fx.fire.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.4, 3, 1, [1, 0.6, 0.2, 1], [0.8, 0.2, 0, 0], 1, 0);
        }
        return p.age < 40;
      },
      onHit(q) { A.blast(q, big2 ? 26 : 18, 40, { lift: 0.4, crater: [7, 3], scorch: 0.8 }); fx.column(q, 6, 18); },
    });
    list.push(pr);
  }
  return list;
}

export const NEW4 = {
  // ---- 철거 발파: 기둥마다 장약을 달고 아래층부터 끊어, 건물이 제자리에서 수직으로 주저앉음 ----
  demolition: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, scene, camera } = A.ctx;
      const first = (hitB(hit) && hitB(hit).state === 'intact' ? hitB(hit) : null) || nearestIntact(D, p.x, p.z, 120);
      if (!first) return;
      const n = Math.max(1, Math.round(S.n * 0.8));
      const list = [first, ...D.buildingsNear(first.cx, first.cz, 160 * S.r ** 0.5).filter(b => b !== first && b.state === 'intact').sort((a, b) => Math.hypot(a.cx - first.cx, a.cz - first.cz) - Math.hypot(b.cx - first.cx, b.cz - first.cz)).slice(0, n - 1)];
      const marks = [];
      for (const b of list) for (let i = 0; i < 8; i++) {
        const u = i / 8, onX = i % 2 === 0;
        const x = onX ? b.minx + (b.maxx - b.minx) * ((i >> 1) / 3) : (i % 4 === 1 ? b.minx : b.maxx);
        const z = onX ? (i % 4 === 0 ? b.minz : b.maxz) : b.minz + (b.maxz - b.minz) * ((i >> 1) / 3);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), glow(0xff2a10, 1));
        m.position.set(x, b.baseY + 1.2 + (u > 0.5 ? Math.min(b.height * 0.25, 12) : 0), z); scene.add(m); marks.push({ m, b });
      }
      audio.charge(2.2);
      const T0 = 2.4, step = 0.9;
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          for (const mk of marks) if (mk.m.parent) mk.m.visible = ((this.t * (this.t > T0 - 0.8 ? 14 : 5)) | 0) % 2 === 0;
          while (this.k < list.length && this.t > T0 + this.k * step) {
            const b = list[this.k++];
            // 장약 폭발: 아래층 연쇄 섬광
            for (const mk of marks) if (mk.b === b) { fx.explosion(mk.m.position, 3.5, { smokeColumn: false }); disposeObj(scene, mk.m); }
            audio.boom(1.2, camera.position.distanceTo(v3(b.cx, b.baseY, b.cz)));
            if (b.state === 'intact') D.fracture(b, 0);
            if (b.state !== 'fractured') { D.flatten(b, 1, 0, 0, 3); continue; }
            const cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2;
            for (const c of b.chunks) {
              if (c.state !== 0) continue;
              const base = b.colMin.get(c.i + ',' + c.j) || 0;
              if (c.k <= base + 1) { D.removeChunk(c); continue; }       // 끊긴 기둥
              const m = c.body.mass();
              D.release(c, (cx - c.x) * m * 0.06, -m * 1.5, (cz - c.z) * m * 0.06, 0.05);
            }
            A.addActive({ t: 0, update(dt2) { this.t += dt2; if (this.t > 0.9 && !this.d) { this.d = true; fx.collapseDust(b); fx.collapseDust(b); audio.crumble(90); fx.addShake(0.8); const ext = Math.max(b.maxx - b.minx, b.maxz - b.minz); for (let i = 0; i < 40; i++) { const a = R() * 6.28; fx.smoke.emit(cx + Math.cos(a) * ext * 0.5, b.baseY + 2, cz + Math.sin(a) * ext * 0.5, Math.cos(a) * 18, 2 + R() * 3, Math.sin(a) * 18, 7 + R() * 5, 10, 34, [0.66, 0.63, 0.58, 0.6], [0.6, 0.58, 0.55, 0], 0.7, 0.4); } } return this.t < 1; } });
          }
          return this.k < list.length || this.t < T0 + list.length * step + 1;
        },
        dispose() { for (const mk of marks) disposeObj(scene, mk.m); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, v3(first.cx, first.baseY, first.cz)), sd = sideOf(f);
      const H = first.height, ext = Math.max(first.maxx - first.minx, first.maxz - first.minz);
      const ctr = v3(first.cx, first.baseY, first.cz);
      const wide = ctr.clone().addScaledVector(f, -(H * 1.6 + ext + 90)).addScaledVector(sd, H * 0.5).add(v3(0, H * 0.45 + 12, 0));
      const base = ctr.clone().addScaledVector(f, -(ext * 0.5 + 45)).addScaledVector(sd, -ext * 0.4).add(v3(0, 4, 0));
      g.cine.play([
        watch(wide, ctr.clone().add(v3(0, H * 0.45, 0)), { dur: T0 - 0.6, fov: 48, caption: '철거 발파', smooth: 0.3 }),
        watch(base, ctr.clone().add(v3(0, H * 0.5, 0)), { dur: 1.6, fov: 62, ts: (u) => (u < 0.4 ? 1 : 0.35) }),
        watch(wide.clone().add(v3(0, 10, 0)), ctr.clone().add(v3(0, H * 0.3, 0)), { dur: (list.length - 1) * step + 4, fov: list.length > 1 ? 60 : 50, ts: 0.6, smooth: 0.4 }),
      ]);
    },
  },

  // ---- 지뢰밭: 깔린 지뢰가 서로의 폭발에 연달아 터짐 ----
  minefield: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const R0 = 70 * S.r ** 0.8, n = Math.min(170, Math.round(16 + 14 * S.n ** 0.8));
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const chainR = R0 * 2.4 / Math.sqrt(n) * 1.6;
      const mines = [];
      for (let i = 0; i < n; i++) {
        const a = R() * 6.28, d = Math.sqrt(R()) * R0;
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        const m = A.spawn(makeMine(), 0.9 * S.r ** 0.3); m.position.set(x, grid.sample(x, z) + 0.2, z);
        mines.push({ m, x, z, d, at: Infinity, done: false });
      }
      mines.sort((a, b) => a.d - b.d); mines[0].at = 1.0;
      audio.charge(1);
      let phys = 0;
      const r = 9 * S.r ** 0.6;
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          let left = 0, pend = false;
          for (const mi of mines) {
            if (mi.done) continue;
            left++;
            if (mi.m.userData.led) mi.m.userData.led.visible = ((this.t * 4 + mi.d) | 0) % 2 === 0;
            if (this.t < mi.at) { if (mi.at < Infinity) pend = true; continue; }
            mi.done = true; A.remove(mi.m);
            const q = v3(mi.x, grid.sample(mi.x, mi.z), mi.z);
            if (phys < 45) { phys++; A.blast(q, r, 22 * S.v, { crater: [r * 0.35, r * 0.15], lod: 1, silent: phys % 3 !== 0, lift: 0.6 }); }
            else fxBlast(A, q, r, { silent: R() > 0.25, smoke: R() < 0.3 });
            for (const o of mines) if (!o.done && Math.hypot(o.x - mi.x, o.z - mi.z) < chainR) o.at = Math.min(o.at, this.t + 0.1 + R() * 0.25);
          }
          // 사슬이 끊기면 가장 가까운 지뢰가 이어서 터짐 (밟힘)
          if (left && !pend) { const nx = mines.find(o => !o.done); if (nx) nx.at = this.t + 0.35; }
          return left > 0;
        },
        dispose() { for (const mi of mines) if (!mi.done) A.remove(mi.m); },
      });
      const g = cineGame(A); if (!g) return;
      const a0 = Math.atan2(camera.position.z - c.z, camera.position.x - c.x);
      g.cine.play([
        orbit(c, { dist: R0 * 1.4 + 70, h: 30 + R0 * 0.25, a0, a1: a0 + 0.35, dur: 1.4, fov: 52, caption: '지뢰밭' }),
        orbit(c, { dist: R0 * 1.6 + 90, h: 45 + R0 * 0.4, a0: a0 + 0.35, a1: a0 + 1.1, dur: 2 + n * 0.035, fov: 55, ts: 0.65, cut: false }),
      ]);
    },
  },

  // ---- EMP 폭탄: 상공 400m 에서 터져 도시 불이 꺼지고, 전력망이 터지고, 비행기가 떨어짐 ----
  emp: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { grid, camera, audio } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 300 * S.r ** 0.8;
      const bomb = A.spawn(makeBomb(), 2);
      const st = { planes: null };
      A.addProjectile({
        mesh: bomb, pos: c.clone().add(v3(0, 900, 0)), vel: v3(0, -160, 0), align: 'down', ignoreHits: true,
        onUpdate(pr) { if (pr.pos.y < c.y + 400) { st.planes = empStrike(A, c, { alt: 400, R0, planes: Math.round(2 + 2 * S.n ** 0.5) }); return false; } return true; },
      });
      audio.whoosh(2);
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      const low = c.clone().addScaledVector(f, -R0 * 0.9 - 120).addScaledVector(sd, 80).add(v3(0, 18, 0));
      const plane = () => (st.planes && st.planes[0] && st.planes[0].pos) || c.clone().add(v3(0, 400, 0));
      g.cine.play([
        watch(low, c.clone().add(v3(0, 380, 0)), { dur: 3.4, fov: 64, caption: 'EMP', smooth: 0.25 }),
        watch(c.clone().addScaledVector(f, -R0 * 1.1 - 120).addScaledVector(sd, R0 * 0.4).add(v3(0, R0 * 0.45 + 90, 0)), c.clone().add(v3(0, 30, 0)), { dur: 3, fov: 58, caption: '전력망 붕괴', smooth: 0.3 }),
        chase(plane, () => (st.planes && st.planes[0] ? st.planes[0].vel : v3(1, -0.3, 0)), { back: 70, up: 20, ahead: 60, dur: 4.5, fov: 60 }),
        orbit(c, { dist: R0 * 1.2 + 150, h: 140, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.5, dur: 4, fov: 55 }),
      ]);
    },
  },

  // ---- 분진 폭발: 곡물 창고가 터지고, 거리를 따라 퍼진 먼지 구름이 줄줄이 폭발 ----
  dustex: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const Hs = 30 * S.r ** 0.4;
      const silo = A.spawn(makeSilo(), Hs); silo.position.copy(c);
      const nb = Math.round(3 + S.n * 0.9), L = 150 * S.r ** 0.7, stepL = 14;
      const branches = [];
      for (let i = 0; i < nb; i++) {
        let a = (i / nb) * 6.28 + R() * 0.6, x = c.x, z = c.z;
        const pts = [];
        for (let d = 0; d < L * (0.6 + R() * 0.6); d += stepL) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * stepL; z += Math.sin(a) * stepL; pts.push(v3(x, grid.sample(x, z) + 3, z)); }
        branches.push({ pts, k: 0 });
      }
      audio.rumble(2);
      let phys = 0;
      A.addActive({
        t: 0, boom: false,
        update(dt) {
          this.t += dt;
          // 먼지 구름이 길을 따라 깔림
          if (this.t < 1.6) for (const br of branches) for (let i = 0; i < 2; i++) { const q = br.pts[Math.floor(R() * br.pts.length * Math.min(1, this.t / 1.4))]; if (q) fx.smoke.emit(q.x + (R() - 0.5) * 10, q.y + R() * 4, q.z + (R() - 0.5) * 10, (R() - 0.5) * 2, 0.5, (R() - 0.5) * 2, 3, 6, 14, [0.86, 0.8, 0.62, 0.35], [0.8, 0.75, 0.6, 0], 0.5, 0.1); }
          if (!this.boom && this.t > 1.6) {
            this.boom = true; A.remove(silo);
            A.blast(c.clone().add(v3(0, Hs * 0.5, 0)), 25 * S.r ** 0.6, 40 * S.v, { lift: 0.5, crater: [8, 3] });
            fx.flash = Math.max(fx.flash, 0.25);
          }
          if (this.boom) {
            const reach = (this.t - 1.6) * 70;
            for (const br of branches) {
              while (br.k < br.pts.length && br.k * stepL < reach) {
                const q = br.pts[br.k++];
                fx.explosion(q, 7 * S.r ** 0.4, { smokeColumn: false });
                if (br.k % 3 === 0 && phys < 60) { phys++; D.explode({ x: q.x, y: q.y, z: q.z, r: 13 * S.r ** 0.4, power: 20 * S.v, lift: 0.4, scorch: 0.6, lod: 2 }); A.ctx.world.paintScorch(q.x, q.z, 12, 0.7); }
                if (br.k % 4 === 0) audio.boom(1, camera.position.distanceTo(q));
              }
            }
          }
          return !this.boom || branches.some(b => b.k < b.pts.length);
        },
        dispose() { A.remove(silo); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -110).addScaledVector(sd, 50).add(v3(0, 25, 0)), c.clone().add(v3(0, Hs * 0.5, 0)), { dur: 1.9, fov: 50, caption: '분진 폭발' }),
        watch(c.clone().addScaledVector(f, -L * 1.1 - 80).add(v3(0, L * 0.5 + 60, 0)), c, { dur: 2.2 + L / 70, fov: 55, ts: 0.7, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 헬기 로켓 강습: 편대가 낮게 선회하며 로켓을 퍼부음 ----
  heli: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const n = Math.max(2, Math.min(6, Math.round(2 + S.n ** 0.6)));
      const Ro = 150 * S.r ** 0.3, alt = 55 + S.r * 10, T = 10 * S.t;
      const f0 = camDir(camera, c);
      const helis = [];
      for (let i = 0; i < n; i++) {
        const m = A.spawn(makeHeli(), 1.4);
        const a = Math.atan2(-f0.z, -f0.x) + (i - (n - 1) / 2) * 0.35;
        helis.push({ m, ang: a + Math.PI, pos: c.clone().add(v3(Math.cos(a) * 480, alt + 40, Math.sin(a) * 480)), vel: v3(), fireT: 0.8 + R() * 0.6, phase: 0, off: i * (6.28 / n) });
      }
      audio.drone(T + 6);
      let phys = 0;
      const hs = { list: helis };
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          for (const h of helis) {
            let goal;
            if (this.t < T) {
              const a = this.t * 0.35 + h.off;
              goal = c.clone().add(v3(Math.cos(a) * Ro, alt + 10 * Math.sin(this.t + h.off), Math.sin(a) * Ro));
            } else goal = h.pos.clone().add(h.pos.clone().sub(c).setY(0).normalize().multiplyScalar(400)).add(v3(0, 80, 0));
            const want = goal.sub(h.pos); const dist = want.length();
            want.normalize().multiplyScalar(Math.min(90, dist * 0.8 + 20));
            h.vel.lerp(want, Math.min(1, dt * 1.2));
            h.pos.addScaledVector(h.vel, dt);
            const gyy = groundY(A, h.pos.x, h.pos.z); if (h.pos.y < gyy + 25) h.pos.y = gyy + 25;
            h.m.position.copy(h.pos);
            // 기수는 표적 쪽, 진행 방향으로 기울어짐
            h.m.lookAt(this.t < T ? c.x : h.pos.x + h.vel.x, h.pos.y - (this.t < T ? 6 : 0), this.t < T ? c.z : h.pos.z + h.vel.z);
            h.m.rotateZ(-h.vel.dot(sideOf(camDir({ position: h.pos }, c))) * 0.004);
            h.m.userData.rotor.rotation.y += dt * 38; h.m.userData.tail.rotation.x += dt * 50;
            // 로켓 일제 사격
            h.fireT -= dt;
            if (this.t < T && h.fireT <= 0 && h.pos.distanceTo(c) < Ro * 2.5) {
              h.fireT = 0.7 + R() * 0.5;
              const cand = D.buildingsNear(c.x, c.z, Ro * 1.2).filter(b => b.state !== 'gone');
              const tb = cand.length ? cand[Math.floor(R() * cand.length)] : null;
              for (let k = 0; k < 4; k++) {
                const tgt = tb ? v3(tb.cx + (R() - 0.5) * 10, tb.baseY + R() * Math.max(4, (tb.flatH || tb.height)) * 0.8, tb.cz + (R() - 0.5) * 10) : c.clone().add(v3((R() - 0.5) * 60, 0, (R() - 0.5) * 60));
                const from = h.pos.clone().add(v3((k % 2 ? 3 : -3), -1.5, 0));
                const dir = tgt.clone().sub(from).normalize();
                A.addProjectile({ mesh: A.spawn(makeMissile(), 0.55), pos: from, vel: dir.multiplyScalar(230), align: 'fwd', delay: k * 0.08, trail: { size: 0.8, fire: true, every: 0.015 },
                  onHit(q) { if (phys < 70) { phys++; A.blast(q, 7 * S.r ** 0.5, 26 * S.v, { lift: 0.3, silent: phys % 2 === 0, lod: 1 }); } else fxBlast(A, q, 7, { silent: true, smoke: false }); } });
              }
              audio.rocket(0.6);
            }
          }
          return this.t < T + 7;
        },
        dispose() { for (const h of helis) A.remove(h.m); },
      });
      const g = cineGame(A); if (!g) return;
      const h0 = helis[0];
      const sd = sideOf(f0);
      g.cine.play([
        chase(() => h0.pos, () => h0.vel, { back: 34, up: 9, side: 8, ahead: 80, dur: 4.2, fov: 60, caption: '헬기 로켓 강습' }),
        watch(() => h0.pos.clone().add(v3(0, 6, 0)).addScaledVector(h0.pos.clone().sub(c).setY(0).normalize(), 30), () => c.clone().add(v3(0, 10, 0)), { dur: 4, fov: 50, smooth: 0.2 }),
        watch(c.clone().addScaledVector(f0, -Ro * 2.2).addScaledVector(sd, Ro).add(v3(0, 60, 0)), c.clone().add(v3(0, 25, 0)), { dur: 4, fov: 55, ts: 0.7 }),
      ]);
      void hs;
    },
  },

  // ---- 극초음속 활공체: 성층권에서 S자로 꺾으며 마하 20 으로 내리꽂힘 ----
  hypersonic: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, audio, grid, camera, game } = A.ctx;
      const n = Math.max(1, Math.min(4, Math.round(S.n ** 0.6)));
      const f = camDir(camera, v3(p.x, p.y, p.z)), sd = sideOf(f);
      const T = 7;
      const gl = [];
      if (game) game.ensureView(30000, 3000);
      for (let i = 0; i < n; i++) {
        const tgt = i === 0 ? v3(p.x, grid.sample(p.x, p.z), p.z) : mapPoint(A, 0.9, v3(p.x, 0, p.z), 0.12);
        const back = f.clone().multiplyScalar(-1).applyAxisAngle(UP, (R() - 0.5) * 0.8);
        const P0 = tgt.clone().addScaledVector(back, -16000).add(v3(0, 11000, 0));
        const P1 = tgt.clone().addScaledVector(back, -8000).addScaledVector(sd, 3500 * (R() < 0.5 ? 1 : -1)).add(v3(0, 6500, 0));
        const P2 = tgt.clone().addScaledVector(back, -2500).addScaledVector(sd, -1500).add(v3(0, 3200, 0));
        const m = A.spawn(makeGlider(), 3);
        gl.push({ m, P: [P0, P1, P2, tgt], t: -i * 1.2, pos: P0.clone(), dir: v3(0, -1, 0), done: false, tgt });
      }
      const bez = (P, u, out) => { const a = 1 - u; return out.set(0, 0, 0).addScaledVector(P[0], a * a * a).addScaledVector(P[1], 3 * a * a * u).addScaledVector(P[2], 3 * a * u * u).addScaledVector(P[3], u * u * u); };
      const tmp = v3();
      A.addActive({
        update(dt) {
          let alive = 0;
          for (const g of gl) {
            if (g.done) continue; alive++;
            g.t += dt;
            if (g.t < 0) { g.m.visible = false; continue; }
            g.m.visible = true;
            const u = Math.min(1, g.t / T), uu = u * u * (1.6 - 0.6 * u);
            bez(g.P, uu, tmp);
            g.dir.subVectors(tmp, g.pos); if (g.dir.lengthSq() > 1e-4) g.dir.normalize();
            g.pos.copy(tmp); g.m.position.copy(tmp);
            g.m.lookAt(tmp.x + g.dir.x, tmp.y + g.dir.y, tmp.z + g.dir.z);
            g.m.userData.sheath.material.opacity = 0.35 + 0.3 * u;
            for (let k = 0; k < 3; k++) fx.trail(g.pos.clone().addScaledVector(g.dir, -k * 8), 4 + u * 5, true);
            fx.light(g.pos.x, g.pos.y, g.pos.z, 4000, 600, 0.05, 0xffb070);
            if (u >= 1) {
              g.done = true; A.remove(g.m);
              const r = 45 * S.r ** 0.7;
              A.blast(g.tgt, r, 70 * S.v, { vap: r * 0.3, crater: [r * 0.6, r * 0.25], lift: 0.5 });
              fx.flash = Math.max(fx.flash, 0.35); fx.ring(g.tgt, r * 4, 1.2, 0xffe0b0, 0.6);
              audio.boom(3, camera.position.distanceTo(g.tgt)); audio.crack();
            }
          }
          return alive > 0;
        },
        dispose() { for (const g of gl) A.remove(g.m); },
      });
      audio.whoosh(T);
      const g = cineGame(A); if (!g) return;
      const g0 = gl[0];
      const ground = g0.tgt.clone().addScaledVector(f, -360).addScaledVector(sd, 140).add(v3(0, 140, 0));
      g.cine.play([
        chase(() => g0.pos, () => g0.dir, { back: 28, up: 6, side: 5, ahead: 300, dur: T * 0.8, fov: 52, caption: '극초음속 활공체 — 마하 20', smooth: 0.05 }),
        watch(ground, () => (g0.done ? g0.tgt.clone().add(v3(0, 30, 0)) : g0.pos.clone().lerp(g0.tgt, 0.6)), { dur: T * 0.2 + 3.5, fov: 55, ts: (u) => (u < 0.28 ? 1 : 0.4), smooth: 0.15 }),
      ]);
    },
  },

  // ---- 비행선 추락: 불붙은 거대 비행선이 꼬리부터 내려앉아 도시를 덮침 ----
  airship: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const L = 220 * S.r ** 0.5, alt = 200 + L * 0.35;
      const f = camDir(camera, c), sd = sideOf(f);
      const head = sd.clone();             // 옆으로 지나가는 모습이 잘 보이도록 화면 가로 방향
      const ship = A.spawn(makeAirship(), L * 0.5);
      const start = c.clone().addScaledVector(head, -L * 1.2).add(v3(0, alt, 0));
      ship.position.copy(start); ship.lookAt(start.clone().add(head));
      const skin = ship.userData.skin;
      const st = { pos: start.clone(), vy: 0, pitch: 0, hit: new Set(), crashed: false, fire: 0 };
      audio.drone(6);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          if (st.crashed) return this.t < st.ct + 6;
          // 4초 떠다니다 꼬리에 불, 3초 뒤 추락
          const drift = Math.min(this.t, 7);
          st.pos.copy(start).addScaledVector(head, drift * L * 1.2 / 7);
          if (this.t > 2.5) st.fire = Math.min(1, (this.t - 2.5) / 3.5);
          if (this.t > 4.5) { const tf = this.t - 4.5; st.vy = -0.5 * 14 * tf * tf; st.pitch = Math.min(0.42, tf * 0.12); }
          st.pos.y = start.y + st.vy;
          ship.position.copy(st.pos);
          ship.lookAt(st.pos.clone().add(head)); ship.rotateX(st.pitch);
          skin.color.setRGB(0.72 - 0.55 * st.fire, 0.7 - 0.6 * st.fire, 0.64 - 0.58 * st.fire);
          // 불길: 꼬리 → 머리로 번짐
          const n = Math.round(30 * st.fire * A.ctx.quality.fxScale);
          for (let i = 0; i < n; i++) {
            const along = -1 + 2 * st.fire * R();
            const q = v3(0, 0, along * L * 0.5).applyQuaternion(ship.quaternion).add(st.pos);
            fx.fire.emit(q.x + (R() - 0.5) * L * 0.12, q.y + (R() - 0.3) * L * 0.1, q.z + (R() - 0.5) * L * 0.12, 0, 8 + R() * 10, 0, 1 + R(), L * 0.05, L * 0.14, [1, 0.62, 0.22, 1], [0.7, 0.15, 0.02, 0], 0.4, 2);
            if (R() < 0.4) fx.smoke.emit(q.x, q.y + L * 0.06, q.z, 0, 10, 0, 6, L * 0.06, L * 0.2, [0.12, 0.11, 0.1, 0.7], [0.3, 0.29, 0.28, 0], 0.3, 1);
          }
          if (st.fire > 0) fx.light(st.pos.x, st.pos.y, st.pos.z, 8000 * st.fire, L * 3, 0.05, 0xff8a30);
          // 바닥에 닿으면 몸통 길이를 따라 폭발
          const tail = v3(0, 0, -L * 0.5).applyQuaternion(ship.quaternion).add(st.pos);
          const noseP = v3(0, 0, L * 0.5).applyQuaternion(ship.quaternion).add(st.pos);
          for (const end of [tail, noseP]) for (const b of D.buildingsNear(end.x, end.z, L * 0.1)) {
            if (st.hit.has(b) || b.state === 'gone' || end.y - L * 0.09 > b.baseY + (b.flatH || b.height)) continue;
            st.hit.add(b); D.blastFrom(b, end, 24 * S.v, { lift: 0.05, lod: 1 });
          }
          const lowY = Math.min(tail.y, noseP.y) - L * 0.09;
          if (lowY <= Math.max(grid.sample(tail.x, tail.z), grid.sample(noseP.x, noseP.z)) + 2 || this.t > 16) {
            st.crashed = true; st.ct = this.t;
            const a = v3(tail.x, grid.sample(tail.x, tail.z), tail.z), b2 = v3(noseP.x, grid.sample(noseP.x, noseP.z), noseP.z);
            A.ctx.D.lineBlast(a.clone().add(v3(0, 6, 0)), b2.clone().add(v3(0, 6, 0)), L * 0.12, 30 * S.v);
            for (let i = 0; i <= 6; i++) { const q = a.clone().lerp(b2, i / 6); if (i % 2 === 0) A.blast(q, L * 0.12, 30 * S.v, { lift: 0.4, silent: i > 0 }); else fxBlast(A, q, L * 0.13, { silent: true }); fx.column(q, L * 0.04, 25); }
            A.remove(ship); fx.addShake(2);
          }
          return true;
        },
        dispose() { A.remove(ship); },
      });
      const g = cineGame(A); if (!g) return;
      const low = c.clone().addScaledVector(f, -L * 1.4 - 160).add(v3(0, 14, 0));
      const mid = c.clone().addScaledVector(f, -L * 1.0 - 60).addScaledVector(sd, L * 0.9).add(v3(0, alt * 0.55, 0));
      g.cine.play([
        watch(low, () => st.pos, { dur: 3.2, fov: 50, caption: '비행선 추락', smooth: 0.25 }),
        watch(mid, () => st.pos, { dur: 3, fov: 55, smooth: 0.25 }),
        watch(low.clone().addScaledVector(sd, -L * 0.4).add(v3(0, 30, 0)), () => (st.crashed ? c.clone().add(v3(0, 20, 0)) : st.pos), { dur: 7, fov: 58, ts: (u) => (u > 0.25 && u < 0.6 ? 0.5 : 1), smooth: 0.3 }),
      ]);
    },
  },

  // ---- 전투기 기총소사: 저공으로 내려와 기관포로 거리를 쓸고 폭탄을 떨굼 ----
  strafe: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const passes = Math.max(1, Math.min(4, Math.round(1 + S.n ** 0.5)));
      const f0 = camDir(camera, c);
      const runs = [];
      for (let i = 0; i < passes; i++) {
        const dir = f0.clone().applyAxisAngle(UP, (R() - 0.5) * 0.5 + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0));
        const sd = sideOf(dir);
        for (let w = 0; w < 2; w++) runs.push({ dir, off: sd.clone().multiplyScalar((w - 0.5) * 30), t0: i * 4.5 + w * 0.4, m: A.spawn(makeJet(), 1.5), pos: v3(), bombed: false, acc: 0, vel: v3() });
      }
      const sp = 170, half = 1300;
      let shots = 0, phys = 0;
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          let live = 0;
          for (const r of runs) {
            const s = (this.t - r.t0) * sp - half;
            if (s > half) { r.m.visible = false; continue; }
            live++;
            if (s < -half) { r.m.visible = false; continue; }
            r.m.visible = true;
            // 고도: 들어올 때 높게 → 표적 근처에서 40m → 다시 상승
            const h = 40 + Math.min(1, Math.abs(s) / 600) ** 1.6 * 220;
            const prev = r.pos.clone();
            r.pos.copy(c).addScaledVector(r.dir, s).add(r.off); r.pos.y = Math.max(groundY(A, r.pos.x, r.pos.z) + 30, c.y + h);
            r.vel.subVectors(r.pos, prev).divideScalar(Math.max(dt, 1e-4));
            r.m.position.copy(r.pos); r.m.lookAt(r.pos.clone().add(r.vel));
            // 기관포: 표적 앞뒤 200m
            if (s > -260 && s < 120) {
              r.acc += dt;
              while (r.acc > 0.03) {
                r.acc -= 0.03; shots++;
                const gp = r.pos.clone().addScaledVector(r.dir, 70 + R() * 30).add(v3((R() - 0.5) * 8, 0, (R() - 0.5) * 8));
                const h2 = D.raycast(v3(gp.x, r.pos.y, gp.z), v3(0, -1, 0), 400);
                const q = h2 ? h2.point : v3(gp.x, grid.sample(gp.x, gp.z), gp.z);
                fx.sparks(q, UP, 3); if (shots % 3 === 0) fx.dust(q, 1.5);
                if (shots % 5 === 0 && phys < 120) { phys++; D.explode({ x: q.x, y: q.y, z: q.z, r: 4.5 * S.r ** 0.4, power: 22 * S.v, lift: 0.25, lod: 2 }); }
              }
              if (shots % 12 === 0) audio.buzz(0.15);
            }
            // 폭탄 한 발
            if (!r.bombed && s > -120) {
              r.bombed = true;
              A.addProjectile({ mesh: A.spawn(makeBomb(), 1.4), pos: r.pos.clone().add(v3(0, -3, 0)), vel: r.dir.clone().multiplyScalar(sp * 0.6), g: 30, align: 'fwd',
                onHit: (q) => A.blast(q, 22 * S.r ** 0.6, 45 * S.v, { crater: [6, 3], lift: 0.4 }) });
            }
          }
          return live > 0;
        },
        dispose() { for (const r of runs) A.remove(r.m); },
      });
      audio.whoosh(3);
      const g = cineGame(A); if (!g) return;
      const r0 = runs[0], sd = sideOf(r0.dir);
      g.cine.play([
        chase(() => r0.pos, () => r0.dir, { back: 45, up: 8, side: 12, ahead: 120, dur: (half - 250) / sp, fov: 58, caption: '전투기 기총소사' }),
        watch(c.clone().addScaledVector(sd, 130).addScaledVector(r0.dir, 60).add(v3(0, 12, 0)), () => (r0.m.visible === false ? c : r0.pos.clone().lerp(c, 0.5)), { dur: 4.5, fov: 60, ts: 0.5, smooth: 0.15 }),
      ]);
    },
  },

  // ---- 우주 엘리베이터 붕괴: 끊어진 케이블이 채찍처럼 도시를 가르며 쓰러짐 ----
  elevator: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const H = 3200 * S.r ** 0.5, N = 70;
      const f = camDir(camera, c), dir = f.clone().applyAxisAngle(UP, 0.35), sd = sideOf(dir);
      if (game) game.ensureView(H * 3, H * 0.6);
      const rad = 2.4 * S.r ** 0.3;
      const mat = std(0x6a6e74, { metalness: 0.85, roughness: 0.35 });
      const lit = glow(0xffe08a, 1);
      const geo = new THREE.CylinderGeometry(rad, rad, 1, 8, 1, true);
      const segs = [];
      const hs = [];
      for (let i = 0; i <= N; i++) hs.push(H * (i / N) ** 1.25);
      for (let i = 0; i < N; i++) { const m = new THREE.Mesh(geo, i % 7 === 3 ? lit : mat); scene.add(m); segs.push(m); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(rad * 8, rad * 12, 24, 16), std(0x8a8f96, { metalness: 0.6 })); base.position.copy(c).add(v3(0, 12, 0)); scene.add(base);
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(rad * 18, 0), std(0x9aa0a8, { metalness: 0.8 })); scene.add(top);
      const pts = hs.map(h => c.clone().add(v3(0, h, 0)));
      const land = hs.map(() => false);
      const T0 = 2.4;
      const Tj = hs.map(h => 1.2 + 8.5 * Math.sqrt(h / H));
      const half = grid.span / 2;
      let phys = 0;
      const tmp = v3(), mid = v3();
      audio.hum(3);
      A.addActive({
        t: 0, snapped: false,
        update(dt) {
          this.t += dt;
          if (!this.snapped && this.t > T0) { this.snapped = true; fx.flash = Math.max(fx.flash, 0.35); audio.crack(); audio.rumble(12); fx.light(pts[N].x, pts[N].y, pts[N].z, 2e5, H, 1, 0xffffff); }
          const te = this.t - T0;
          for (let j = 1; j <= N; j++) {
            const k = te > 0 ? Math.min(1, te / Tj[j]) : 0;
            const th = (Math.PI / 2) * k * k;
            pts[j].copy(c).addScaledVector(dir, Math.sin(th) * hs[j]).add(v3(0, Math.cos(th) * hs[j], 0));
            const gyy = groundY(A, pts[j].x, pts[j].z);
            if (pts[j].y < gyy + rad) pts[j].y = gyy + rad;
            if (k >= 1 && !land[j]) {
              land[j] = true;
              const q = v3(pts[j].x, gyy, pts[j].z);
              const r = (14 + hs[j] * 0.006) * S.r ** 0.4;
              const inside = Math.abs(q.x) < half * 0.98 && Math.abs(q.z) < half * 0.98;
              if (inside && phys < 40 && j % 2 === 0) { phys++; A.blast(q, r, 40 * S.v, { lift: 0.5, crater: [r * 0.35, r * 0.15], silent: j % 4 !== 0 }); }
              else if (inside || hs[j] < H * 0.6) fxBlast(A, q, r * 1.2, { silent: j % 3 !== 0, smoke: j % 2 === 0 });
              if (!inside && A.ctx.world && A.ctx.world.ravageOuter) A.ctx.world.ravageOuter(q.x, q.z, 0, r * 2, 1);
              fx.addShake(0.25);
            }
          }
          for (let i = 0; i < N; i++) {
            mid.addVectors(pts[i], pts[i + 1]).multiplyScalar(0.5);
            tmp.subVectors(pts[i + 1], pts[i]);
            const len = tmp.length();
            segs[i].position.copy(mid); segs[i].scale.set(1, len + 0.5, 1);
            if (len > 1e-3) segs[i].quaternion.setFromUnitVectors(UP, tmp.divideScalar(len));
          }
          top.position.copy(pts[N]); top.rotation.y += dt * 0.3;
          return te < Tj[N] + 6;
        },
        dispose() { for (const m of segs) scene.remove(m); geo.dispose(); mat.dispose(); lit.dispose(); disposeObj(scene, base); disposeObj(scene, top); },
      });
      const g = cineGame(A); if (!g) return;
      const foot = c.clone().addScaledVector(dir, -160).addScaledVector(sd, 90).add(v3(0, 10, 0));
      const sideCam = c.clone().addScaledVector(sd, H * 0.55).addScaledVector(dir, H * 0.3).add(v3(0, H * 0.18, 0));
      const along = c.clone().addScaledVector(sd, 160).addScaledVector(dir, 200).add(v3(0, 45, 0));
      g.cine.play([
        watch(foot, c.clone().add(v3(0, H * 0.5, 0)), { dur: T0 + 0.6, fov: 70, caption: '우주 엘리베이터 붕괴', smooth: 0.3 }),
        watch(sideCam, () => c.clone().addScaledVector(dir, H * 0.3).add(v3(0, H * 0.15, 0)), { dur: 6, fov: 60, smooth: 0.3 }),
        watch(along, () => c.clone().addScaledVector(dir, Math.min(half * 0.9, H * 0.5)), { dur: 5, fov: 62, ts: 0.7, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 거대 우박: 먹구름 아래로 얼음덩이가 쏟아짐 (큰 것은 굴러다님) ----
  hail: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, world, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 130 * S.r ** 0.8, T = 10 * S.t, alt = 340;
      const iceMat = std(0xe2f2ff, { roughness: 0.15, metalness: 0.05, emissive: 0x1a2a38, flatShading: true });
      const iceGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 3);
      const cloud = [];
      let balls = 0, phys = 0;
      audio.wind(T + 3); audio.thunder();
      if (A.ctx.game) A.ctx.game.storm = Math.max(A.ctx.game.storm || 0, 0.5);
      A.addActive({
        t: 0, acc: 0, cacc: 0,
        update(dt) {
          this.t += dt;
          // 먹구름
          this.cacc += dt;
          while (this.cacc > 0.02) { this.cacc -= 0.02; const a = R() * 6.28, d = Math.sqrt(R()) * R0 * 1.3; fx.smoke.emit(c.x + Math.cos(a) * d, c.y + alt + (R() - 0.5) * 30, c.z + Math.sin(a) * d, (R() - 0.5) * 3, (R() - 0.5), (R() - 0.5) * 3, 6, 40, 90, [0.22, 0.23, 0.26, 0.8], [0.2, 0.2, 0.22, 0], 0.2, 0, 0.3); }
          if (this.t > T) return this.t < T + 4;
          const rate = 34 * S.n ** 0.6 * Math.min(1, this.t / 1.5);
          this.acc += dt * rate;
          while (this.acc > 1) {
            this.acc -= 1;
            const a = R() * 6.28, d = Math.sqrt(R()) * R0;
            const sz = (0.5 + R() ** 2 * 1.6) * S.r ** 0.6;
            const pos = v3(c.x + Math.cos(a) * d, c.y + alt, c.z + Math.sin(a) * d);
            const vel = v3(6, -70 - sz * 12, 3);
            if (sz > 2 && balls < 26 && R() < 0.5) {
              balls++;
              const m = new THREE.Mesh(iceGeo, iceMat); m.castShadow = true; m.scale.setScalar(sz); scene.add(m);
              D.addBall(pos, vel, sz, m, { life: 25 });
              continue;
            }
            const m = new THREE.Mesh(iceGeo, iceMat); m.scale.setScalar(sz);
            A.addProjectile({ mesh: A.spawn(m, 1), pos, vel, align: null, spin: true,
              onHit(q) {
                fx.sparks(q, UP, 4); fx.dust(q, sz);
                for (let i = 0; i < 4; i++) fx.smoke.emit(q.x, q.y + 0.5, q.z, (R() - 0.5) * 10, 3 + R() * 5, (R() - 0.5) * 10, 1, sz * 0.4, sz * 0.2, [0.95, 0.98, 1, 0.9], [0.9, 0.95, 1, 0], 1.2, -6);
                if (sz > 1.1 && phys < 140) { phys++; D.explode({ x: q.x, y: q.y, z: q.z, r: sz * 2.4, power: 14 + sz * 4, lift: 0.15, lod: 2 }); }
                if (R() < 0.3) world.paintFrost(q.x, q.z, sz * 5, 0.25);
              } });
          }
          if (R() < dt * 0.4) audio.thunder();
          return true;
        },
        dispose() { iceGeo.dispose(); iceMat.dispose(); if (A.ctx.game) A.ctx.game.storm = 0; },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 - 120).addScaledVector(sd, 60).add(v3(0, 22, 0)), c.clone().add(v3(0, 60, 0)), { dur: 5, fov: 62, caption: '거대 우박', smooth: 0.3 }),
        watch(c.clone().addScaledVector(f, -90).addScaledVector(sd, -40).add(v3(0, 38, 0)), c.clone().add(v3(0, 6, 0)), { dur: 3.5, fov: 55, ts: 0.4 }),
        orbit(c, { dist: R0 * 1.5 + 100, h: 90, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.5, dur: 4, fov: 55 }),
      ]);
    },
  },

  // ---- 중성자별 근접 통과: 하늘을 가로지르는 별의 조석력에 건물이 하늘로 뜯겨 나감 ----
  neutron: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), dir = sideOf(f);
      const T = 10, Hs = 1100, span = 9000;
      if (game) game.ensureView(span, 2000);
      const star = new THREE.Group();
      star.add(new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), glow(0xffffff, 1)));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), glow(0x9fc8ff, 0.35)); star.add(halo);
      const halo2 = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 16), glow(0x5f88ff, 0.12)); star.add(halo2);
      scene.add(star);
      const Rt = 150 * S.r ** 0.8;
      const st = { pos: v3(), q: v3() };
      let launched = 0;
      audio.hum(T); audio.rumble(T);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const s = (this.t / T - 0.5) * span;
          st.pos.copy(c).addScaledVector(dir, s).add(v3(0, Hs + s * s / 9000, 0));
          star.position.copy(st.pos); halo.scale.setScalar(1 + 0.08 * Math.sin(this.t * 30));
          fx.light(st.pos.x, Math.min(st.pos.y, c.y + 600), st.pos.z, 3e5, 4000, 0.05, 0xbfd8ff);
          const close = Math.max(0, 1 - Math.abs(s) / 2400);
          st.q.set(st.pos.x, 0, st.pos.z); st.q.y = grid.sample(st.q.x, st.q.z);
          if (close > 0) {
            fx.addShake(dt * 2 * close);
            this.acc += dt;
            if (this.acc > 0.12) {
              this.acc = 0;
              const rr = Rt * (0.5 + 0.5 * close);
              for (const ch of D.gather(st.q.x, st.q.z, rr, 1)) {
                if (R() > 0.5 * close || launched > 6000) continue;
                const pos = D.chunkPos(ch);
                const k = 1 - Math.hypot(pos.x - st.q.x, pos.z - st.q.z) / rr;
                if (D.launch(ch, (st.pos.x - pos.x) * 0.01 + (R() - 0.5) * 4, (25 + 40 * k) * S.v * close, (st.pos.z - pos.z) * 0.01 + (R() - 0.5) * 4, 2)) { ch.body.setGravityScale(-0.3, true); ch.float = true; launched++; }
              }
              A.crater(st.q.x, st.q.z, rr * 0.7, -1.2 * close * S.r ** 0.5);
              for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = R() * rr; fx.smoke.emit(st.q.x + Math.cos(a) * d, st.q.y + 2, st.q.z + Math.sin(a) * d, 0, 20 + R() * 20, 0, 5, 6, 20, [0.6, 0.58, 0.55, 0.6], [0.6, 0.6, 0.62, 0], 0.2, 1); }
            }
          }
          if (this.t > T) {
            // 떠오른 파편이 다시 쏟아짐
            for (const ch of D.loose) if (ch.float && ch.state === 1) { ch.body.setGravityScale(1, true); ch.float = false; }
            return false;
          }
          return true;
        },
        dispose() { disposeObj(scene, star); },
      });
      const g = cineGame(A); if (!g) return;
      const ground = c.clone().addScaledVector(f, -Rt * 2 - 260).add(v3(0, 20, 0));
      g.cine.play([
        watch(ground, () => st.pos.clone().lerp(c, 0.55), { dur: T * 0.45, fov: 75, caption: '중성자별 근접 통과', smooth: 0.35 }),
        watch(ground.clone().addScaledVector(f, Rt * 0.9).add(v3(0, 30, 0)), () => st.q.clone().add(v3(0, 60, 0)), { dur: T * 0.4, fov: 60, ts: 0.6, smooth: 0.4 }),
        watch(ground.clone().add(v3(0, 120, 0)), c.clone().add(v3(0, 40, 0)), { dur: 4, fov: 58 }),
      ]);
    },
  },

  // ---- 궤도 거울 집광: 우주 거울들이 햇빛을 모아 일대를 달궈 녹임 ----
  mirror: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 95 * S.r ** 0.8, T = 12, top = 2600;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.25, R0, top, 40, 1, true), glow(0xffd27a, 0));
      cone.position.copy(c).add(v3(0, top / 2, 0)); scene.add(cone);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(R0, 48), glow(0xffe0a0, 0)); spot.rotation.x = -Math.PI / 2; spot.position.copy(c).add(v3(0, 1.5, 0)); scene.add(spot);
      const mirrors = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.28; const m = new THREE.Mesh(new THREE.SphereGeometry(30, 8, 6), glow(0xfff4d0, 0.9)); m.position.copy(c).add(v3(Math.cos(a) * 1600, 3200 + R() * 400, Math.sin(a) * 1600)); scene.add(m); mirrors.push(m); }
      const blds = D.buildingsNear(c.x, c.z, R0).map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).sort((a, b) => a[0] - b[0]);
      let k = 0;
      audio.hum(T);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T), on = Math.min(1, this.t / 1.5) * Math.min(1, (T + 2 - this.t) / 2);
          cone.material.opacity = 0.18 * on; spot.material.opacity = 0.35 * on * (0.8 + 0.2 * Math.sin(this.t * 9));
          for (const m of mirrors) m.material.opacity = 0.9 * on;
          fx.light(c.x, c.y + 60, c.z, 2e4 * on, R0 * 4, 0.05, 0xffc060);
          if (this.t > T + 2) return false;
          this.acc += dt;
          if (this.acc > 0.25 && u < 1) {
            this.acc = 0;
            world.paintScorch(c.x, c.z, R0 * Math.min(1, u * 1.5), 0.12);
            for (const [, b] of blds) if (b.state === 'intact') D.tint(b, HOT, 0.05 * on);
            if (u > 0.3) world.blastTrees(c.x, c.z, R0 * u, 0);
            for (let i = 0; i < 4; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * R0; const q = v3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d); q.y = grid.sample(q.x, q.z); fx.smoke.emit(q.x, q.y + 1, q.z, 0, 6 + R() * 6, 0, 4, 4, 18, [0.9, 0.85, 0.75, 0.25], [0.7, 0.7, 0.7, 0], 0.2, 1.5); if (u > 0.4 && R() < 0.4) fx.column(q, 4, 10); }
          }
          // 바깥쪽 → 가운데 순서가 아니라 가운데부터 녹아 주저앉음
          while (u > 0.35 && k < blds.length && blds[k][0] <= R0 * (u - 0.35) / 0.65) {
            const b = blds[k++][1];
            if (b.state !== 'intact') continue;
            D.flatten(b, 0.55 + R() * 0.4, R() - 0.5, R() - 0.5, 3 + R() * 2);
            fx.sparks(v3(b.cx, b.baseY + b.height, b.cz), UP, 10);
            for (let i = 0; i < 8; i++) fx.fire.emit(b.cx + (R() - 0.5) * 10, b.baseY + R() * b.height, b.cz + (R() - 0.5) * 10, 0, -6, 0, 1.2, 2, 0.6, [1, 0.75, 0.3, 1], [1, 0.3, 0.05, 0], 0.4, -4);
          }
          return true;
        },
        dispose() { disposeObj(scene, cone); disposeObj(scene, spot); for (const m of mirrors) disposeObj(scene, m); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 3 - 200).add(v3(0, 60, 0)), c.clone().add(v3(0, 300, 0)), { dur: 3, fov: 60, caption: '궤도 거울 집광', smooth: 0.3 }),
        watch(c.clone().addScaledVector(f, -R0 * 1.3 - 60).addScaledVector(sd, R0 * 0.6).add(v3(0, 30, 0)), c.clone().add(v3(0, 15, 0)), { dur: 6, fov: 55, ts: 0.8, smooth: 0.3 }),
        orbit(c, { dist: R0 * 2 + 120, h: R0 + 60, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.6, dur: 4.5, fov: 55 }),
      ]);
    },
  },

  // ---- 지반 액상화: 땅이 물처럼 변해 건물이 기울며 가라앉음 ----
  liquefy: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 115 * S.r ** 0.8, T = 11;
      const mud = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }));
      mud.rotation.x = -Math.PI / 2; mud.position.copy(c).add(v3(0, 0.3, 0)); mud.renderOrder = 2; scene.add(mud);
      const blds = D.buildingsNear(c.x, c.z, R0).filter(b => Math.hypot(b.cx - c.x, b.cz - c.z) < R0).sort(() => R() - 0.5);
      let k = 0, dug = 0;
      audio.rumble(T + 2);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T);
          D.quake(c.x, c.z, R0, 0.25 * (1 - u), dt);
          fx.addShake(dt * 0.8 * (1 - u));
          mud.scale.setScalar(R0 * 0.95 * ease.out(Math.min(1, this.t / 4)));
          mud.position.y = grid.sample(c.x, c.z) + 0.3 + 0.2 * Math.sin(this.t * 3);
          // 모래 분출
          this.acc += dt;
          if (this.acc > 0.08 && u < 0.9) {
            this.acc = 0;
            const a = R() * 6.28, d = Math.sqrt(R()) * R0, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = grid.sample(x, z);
            for (let i = 0; i < 5; i++) fx.smoke.emit(x, y + 0.5, z, (R() - 0.5) * 3, 8 + R() * 8, (R() - 0.5) * 3, 2, 1.5, 5, [0.45, 0.37, 0.27, 0.9], [0.5, 0.42, 0.32, 0], 0.8, -5);
          }
          if (this.t > 1.5 + dug * 2.2 && dug < 4) { dug++; A.crater(c.x, c.z, R0, 1.2 * S.r ** 0.5); }
          while (this.t > 1.5 && k < blds.length && k < (this.t - 1.5) / 6 * blds.length * 1.2) {
            const b = blds[k++];
            const ang = R() * 6.28;
            if (b.state === 'intact') D.sinkBuilding(b, Math.min(b.height * (0.2 + R() * 0.3), 6 + 10 * S.r ** 0.5), 0.12 + R() * 0.3 * Math.min(1.5, 30 / b.height + 0.4), Math.cos(ang), Math.sin(ang), 4 + R() * 3);
            if (R() < 0.3) fx.collapseDust(b);
          }
          if (u > 0.2) D.sink(c.x, c.z, R0, dt, 6);
          if (u > 0.3 && R() < dt * 2) world.blastTrees(c.x, c.z, R0 * u, 0);
          return this.t < T + 3;
        },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.3 - 70).addScaledVector(sd, 40).add(v3(0, 16, 0)), c.clone().add(v3(0, 18, 0)), { dur: 5, fov: 55, caption: '지반 액상화', smooth: 0.3 }),
        orbit(c, { dist: R0 * 1.6 + 80, h: 60 + R0 * 0.3, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.8, dur: 6, fov: 55, ts: 0.8 }),
      ]);
    },
  },

  // ---- 대형 산불: 바람을 타고 불길이 번지고, 화염 회오리가 솟음 ----
  wildfire: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const w = camDir(camera, c), wa = Math.atan2(w.z, w.x);
      const M = 72, rr = new Float32Array(M).fill(4);
      const base = 9 * S.v, Rmax = 280 * S.r ** 0.8, T = 26;
      const whirls = [];
      audio.wind(T); audio.rumble(6);
      A.addActive({
        t: 0, acc: 0, wacc: 3,
        update(dt) {
          this.t += dt;
          let grow = false;
          for (let i = 0; i < M; i++) {
            const a = (i / M) * 6.28;
            const down = Math.max(0, Math.cos(a - wa));
            const v = base * (0.25 + 0.95 * down ** 1.5) * (0.7 + 0.6 * R());
            if (rr[i] < Rmax * (0.45 + 0.55 * down)) { rr[i] += v * dt; grow = true; }
          }
          // 불 앞쪽 띠
          const n = Math.round(40 * A.ctx.quality.fxScale);
          for (let k = 0; k < n; k++) {
            const i = Math.floor(R() * M), a = (i / M) * 6.28 + (R() - 0.5) * 0.08, r = rr[i] - R() * 10;
            const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = grid.sample(x, z);
            fx.fire.emit(x, y + 1, z, w.x * 3, 5 + R() * 8, w.z * 3, 0.9 + R() * 0.8, 3 + R() * 3, 8 + R() * 6, [1, 0.55, 0.15, 1], [0.7, 0.12, 0.02, 0], 0.6, 2);
            if (R() < 0.35) fx.smoke.emit(x, y + 8, z, w.x * 8, 10 + R() * 6, w.z * 8, 8 + R() * 6, 8, 30, [0.16, 0.14, 0.13, 0.65], [0.35, 0.33, 0.32, 0], 0.2, 1);
          }
          this.acc += dt;
          if (this.acc > 0.3) {
            this.acc = 0;
            for (let k = 0; k < 6; k++) {
              const i = Math.floor(R() * M), a = (i / M) * 6.28, r = rr[i] - 8;
              const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
              D.burn(x, z, 26, 1.2);
              world.paintScorch(x, z, 18, 0.7);
              world.blastTrees(x, z, 16, 0);
            }
          }
          // 화염 회오리
          this.wacc -= dt;
          if (this.wacc < 0 && this.t < T - 4) {
            this.wacc = 4 + R() * 3;
            const i = Math.floor(R() * M), a = (i / M) * 6.28;
            whirls.push({ x: c.x + Math.cos(a) * rr[i] * 0.8, z: c.z + Math.sin(a) * rr[i] * 0.8, t: 0 });
            audio.wind(4);
          }
          for (let j = whirls.length - 1; j >= 0; j--) {
            const wh = whirls[j]; wh.t += dt;
            const y = grid.sample(wh.x, wh.z);
            for (let k = 0; k < 10; k++) { const h = R() * 90, ang = wh.t * 6 + h * 0.15 + R(); const rad = 3 + h * 0.08; fx.fire.emit(wh.x + Math.cos(ang) * rad, y + h, wh.z + Math.sin(ang) * rad, -Math.sin(ang) * 12, 14, Math.cos(ang) * 12, 0.7, 4, 2, [1, 0.6, 0.2, 1], [0.8, 0.15, 0.02, 0], 0.5, 2); }
            if (wh.t > 0.5) D.burn(wh.x, wh.z, 15, dt * 3);
            if (wh.t > 4) whirls.splice(j, 1);
          }
          return (grow || whirls.length) && this.t < T;
        },
      });
      const g = cineGame(A); if (!g) return;
      const sd = sideOf(w);
      g.cine.play([
        watch(c.clone().addScaledVector(w, -110).addScaledVector(sd, 40).add(v3(0, 45, 0)), c.clone().addScaledVector(w, 40), { dur: 5, fov: 58, caption: '대형 산불', smooth: 0.3 }),
        watch(c.clone().addScaledVector(sd, Rmax * 0.6).addScaledVector(w, Rmax * 0.3).add(v3(0, 20, 0)), c.clone().addScaledVector(w, Rmax * 0.35).add(v3(0, 15, 0)), { dur: 6, fov: 55, smooth: 0.3 }),
        watch(c.clone().addScaledVector(w, -Rmax * 0.6).add(v3(0, Rmax * 0.7 + 60, 0)), c.clone().addScaledVector(w, Rmax * 0.4), { dur: 5, fov: 55, ts: 1.4 }),
      ]);
    },
  },

  // ---- 간헐천 폭발: 땅이 갈라지고 증기 기둥이 연달아 솟아 건물을 밀어올림 ----
  geyser: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const nV = Math.round(2 + 2 * S.n ** 0.6), R0 = 60 * S.r ** 0.7;
      const Hc = 140 * S.r ** 0.6, vr = 14 * S.r ** 0.5;
      const vents = [];
      for (let i = 0; i < nV; i++) { const a = R() * 6.28, d = i ? R0 * (0.4 + R() * 0.6) : 0; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; vents.push({ x, z, at: 1.6 + i * (0.7 + R() * 0.5), on: false, t: 0 }); }
      audio.rumble(4);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          if (this.t < 1.6) { fx.addShake(dt); for (const v of vents) if (R() < 0.3) { const y = grid.sample(v.x, v.z); fx.smoke.emit(v.x + (R() - 0.5) * vr, y + 1, v.z + (R() - 0.5) * vr, 0, 4, 0, 3, 3, 10, [0.9, 0.92, 0.95, 0.5], [0.9, 0.9, 0.92, 0], 0.4, 1); } }
          let live = false;
          for (const v of vents) {
            if (this.t < v.at) { live = true; continue; }
            const y = grid.sample(v.x, v.z);
            if (!v.on) {
              v.on = true;
              A.crater(v.x, v.z, vr * 0.8, 5);
              world.paintScorch(v.x, v.z, vr * 1.5, 0.4);
              fx.addShake(1.2); audio.boom(1.5, camera.position.distanceTo(v3(v.x, y, v.z))); audio.wind(6);
              for (const ch of D.gather(v.x, v.z, vr * 1.4, 0)) { const pos = D.chunkPos(ch); const k = 1 - Math.hypot(pos.x - v.x, pos.z - v.z) / (vr * 1.4); D.launch(ch, (pos.x - v.x) * 0.4, (35 + 50 * k) * S.v, (pos.z - v.z) * 0.4, 1.5); }
            }
            v.t += dt;
            if (v.t < 7) {
              live = true;
              const k = Math.min(1, v.t / 0.5) * Math.min(1, (7 - v.t) / 2);
              const n = Math.round(26 * k * A.ctx.quality.fxScale);
              for (let i = 0; i < n; i++) {
                const vy = Hc * (0.5 + R() * 0.5) * k;
                fx.smoke.emit(v.x + (R() - 0.5) * vr * 0.6, y + 2, v.z + (R() - 0.5) * vr * 0.6, (R() - 0.5) * 8, vy, (R() - 0.5) * 8, 3 + R() * 2, vr * 0.5, vr * 2.2, [0.95, 0.97, 1.0, 0.85], [0.85, 0.88, 0.92, 0], 1.0, -2);
              }
              if (v.t < 4 && R() < 0.4) for (const ch of D.gather(v.x, v.z, vr, 2)) if (R() < 0.2) { const pos = D.chunkPos(ch); D.launch(ch, (pos.x - v.x) * 0.3, 30 * S.v * k, (pos.z - v.z) * 0.3, 1); }
            }
          }
          return live;
        },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 - 140).addScaledVector(sd, 50).add(v3(0, 14, 0)), c.clone().add(v3(0, 10, 0)), { dur: 1.9, fov: 55, caption: '간헐천 폭발' }),
        watch(c.clone().addScaledVector(f, -R0 - 200).addScaledVector(sd, 60).add(v3(0, 25, 0)), c.clone().add(v3(0, Hc * 0.45, 0)), { dur: 5, fov: 60, ts: (u) => (u < 0.4 ? 0.45 : 0.9), smooth: 0.3 }),
        orbit(c, { dist: R0 * 2 + 200, h: Hc * 0.5, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.7, dur: 4, fov: 55, look: Hc * 0.3 }),
      ]);
    },
  },

  // ---- 빙산 충돌: 해일에 실린 거대 빙산이 도시를 갈아엎으며 밀고 들어옴 ----
  iceberg: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const dir = camDir(camera, c).negate();            // 카메라 쪽으로 밀려옴
      const sd = sideOf(dir);
      const W = 70 * S.r ** 0.6, Hw = 8 * S.r ** 0.5;
      const s0 = -Math.min(grid.span * 0.45, 600 + W), s1 = Math.min(grid.span * 0.35, 260 + W);
      const berg = A.spawn(makeIceberg(R() * 100), W);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x2b5a6e, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 }));
      water.rotation.x = -Math.PI / 2; water.renderOrder = 2; scene.add(water);
      const st = { s: s0, prev: s0, v: 42, pos: v3(), hit: new Set(), acc: 0 };
      audio.rumble(14); audio.wind(10);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          if (st.s < s1) { st.v = Math.max(6, 42 * Math.min(1, (s1 - st.s) / 200 + 0.15)); st.s += st.v * dt; }
          const front = c.clone().addScaledVector(dir, st.s);
          const gyy = grid.sample(front.x, front.z);
          st.pos.copy(front); st.pos.y = gyy + Hw * 0.4;
          berg.position.copy(st.pos); berg.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(this.t * 0.4) * 0.05; berg.rotation.z = Math.sin(this.t * 0.7) * 0.04;
          // 뒤따르는 물
          const len = st.s - s0 + W;
          water.scale.set(W * 3.2, len, 1);
          water.position.copy(c).addScaledVector(dir, st.s - len / 2 + W * 0.3); water.position.y = gyy + Hw * Math.min(1, (s1 - st.s) / 120 + 0.3);
          water.rotation.z = Math.atan2(dir.x, dir.z);
          // 부딪힌 건물
          for (const b of D.buildingsNear(st.pos.x, st.pos.z, W * 1.05)) {
            if (st.hit.has(b) || b.state === 'gone') continue;
            st.hit.add(b);
            D.blastFrom(b, st.pos.clone().addScaledVector(dir, -W * 1.5), (22 + st.v) * S.v * 0.8, { lift: 0.12, lod: 1 });
            audio.crumble(20);
          }
          if (st.s < s1) {
            D.sweep({ ox: c.x, oz: c.z, dx: dir.x, dz: dir.z, prev: st.prev - 20, front: st.s + W, halfW: W * 1.4, waterY: gyy + Hw + W * 0.5, power: 16 * S.v }, dt);
            st.prev = st.s;
            st.acc += dt;
            if (st.acc > 0.4) { st.acc = 0; A.crater(front.x, front.z, W * 0.6, 1.5); world.blastTrees(front.x, front.z, W * 1.4, W); world.paintFrost(front.x, front.z, W * 1.3, 0.4); }
            for (let i = 0; i < 6; i++) { const q = st.pos.clone().addScaledVector(dir, W * 0.9).addScaledVector(sd, (R() - 0.5) * W * 2); fx.smoke.emit(q.x, gyy + 2, q.z, dir.x * 10 + (R() - 0.5) * 10, 8 + R() * 10, dir.z * 10 + (R() - 0.5) * 10, 2, 3, 12, [0.92, 0.96, 1, 0.8], [0.85, 0.9, 0.95, 0], 0.8, -2); }
            fx.addShake(dt * 0.6);
          }
          return this.t < 40 && (st.s < s1 || this.t < (s1 - s0) / 30 + 8);
        },
        dispose() { A.remove(berg); disposeObj(scene, water); },
      });
      const g = cineGame(A); if (!g) return;
      const ahead = c.clone().addScaledVector(dir, s1 + 260).addScaledVector(sd, 130).add(v3(0, 28 + W * 0.2, 0));
      g.cine.play([
        watch(ahead, () => st.pos.clone().add(v3(0, W * 0.4, 0)), { dur: 7, fov: 55, caption: '빙산 충돌', smooth: 0.3 }),
        chase(() => st.pos, () => dir, { back: -W * 2.6, up: W * 0.5 + 10, side: W * 1.6, ahead: 0, dur: 5, fov: 60 }),
        watch(c.clone().addScaledVector(sd, -W * 3 - 120).addScaledVector(dir, s1 * 0.5).add(v3(0, W + 40, 0)), () => st.pos, { dur: 5, fov: 55, ts: 0.8, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 메탄 분출: 땅이 부풀어 터지며 깊은 구덩이가 열리고, 새어 나온 가스가 한꺼번에 불붙음 ----
  methane: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const nC = Math.round(2 + 2 * S.n ** 0.6), R0 = 75 * S.r ** 0.7;
      const pits = [];
      for (let i = 0; i < nC; i++) { const a = R() * 6.28, d = i ? R0 * (0.35 + R() * 0.65) : 0; pits.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, r: (9 + R() * 6) * S.r ** 0.5, at: 2.2 + i * 0.6, done: false }); }
      for (const pt of pits) A.crater(pt.x, pt.z, pt.r * 1.6, -pt.r * 0.25);
      const ign = 2.2 + nC * 0.6 + 1.8;
      audio.rumble(ign);
      A.addActive({
        t: 0, lit: false,
        update(dt) {
          this.t += dt;
          for (const pt of pits) {
            const y = grid.sample(pt.x, pt.z);
            if (!pt.done && this.t < pt.at && R() < 0.4) fx.smoke.emit(pt.x + (R() - 0.5) * pt.r, y + 1, pt.z + (R() - 0.5) * pt.r, 0, 3, 0, 2, 2, 6, [0.85, 0.88, 0.9, 0.4], [0.8, 0.8, 0.8, 0], 0.5, 0.5);
            if (!pt.done && this.t >= pt.at) {
              pt.done = true;
              A.blast(v3(pt.x, y, pt.z), pt.r * 1.6, 38 * S.v, { crater: [pt.r * 1.3, pt.r * 1.1], lift: 0.8, scorch: 0.2 });
              for (let i = 0; i < 40; i++) { const a = R() * 6.28, sp = 10 + R() * 25; fx.smoke.emit(pt.x, y + 2, pt.z, Math.cos(a) * sp, 20 + R() * 30, Math.sin(a) * sp, 3 + R() * 2, 3, 9, [0.35, 0.28, 0.2, 0.9], [0.4, 0.34, 0.27, 0], 0.6, -6); }
            }
            // 새어 나온 가스 (옅은 녹회색)
            if (pt.done && !this.lit) for (let i = 0; i < 3; i++) fx.smoke.emit(pt.x + (R() - 0.5) * pt.r, y + 2, pt.z + (R() - 0.5) * pt.r, (R() - 0.5) * 14, 2 + R() * 3, (R() - 0.5) * 14, 6, 6, 22, [0.68, 0.74, 0.62, 0.2], [0.65, 0.7, 0.6, 0], 0.25, 0.2);
          }
          if (!this.lit && this.t >= ign) {
            this.lit = true;
            fx.flash = Math.max(fx.flash, 0.3); audio.boom(3, camera.position.distanceTo(c)); audio.rumble(4);
            over(A, 18, 1.4, (k) => { const a = R() * 6.28, d = (k / 18) * R0 * 1.3; const q = v3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d); q.y = grid.sample(q.x, q.z) + 4; if (k % 3 === 0) A.blast(q, 26 * S.r ** 0.5, 26 * S.v, { lift: 0.5, silent: k > 0, scorch: 0.8 }); else fxBlast(A, q, 24 * S.r ** 0.5, { silent: true, smoke: false }); });
            for (const pt of pits) fx.column(v3(pt.x, grid.sample(pt.x, pt.z), pt.z), pt.r * 0.6, 25);
            world.paintScorch(c.x, c.z, R0 * 1.3, 0.6);
          }
          return this.t < ign + 3;
        },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 - 150).addScaledVector(sd, 60).add(v3(0, 30, 0)), c.clone().add(v3(0, 8, 0)), { dur: ign - 0.3, fov: 55, caption: '메탄 분출', smooth: 0.3 }),
        watch(c.clone().addScaledVector(f, -R0 * 1.6 - 200).addScaledVector(sd, -80).add(v3(0, 60, 0)), c.clone().add(v3(0, 25, 0)), { dur: 4.5, fov: 60, ts: (u) => (u < 0.4 ? 0.45 : 1), smooth: 0.3 }),
      ]);
    },
  },
};

// ---- ×100 세계 멸망 결말 ----
export const NEW4_ENDINGS = {
  demolition: (A, c) => {
    // 지도의 모든 건물이 동시에 주저앉으며 먼지 바다
    const { D, fx } = A.ctx;
    over(A, 1, 0.1, () => { let k = 0; for (const b of D.buildings) if (b.state === 'intact') { D.flatten(b, 1, 0, 0, 2.5 + R()); if (k++ % 9 === 0) fx.collapseDust(b); } });
    worldEnd(A, c, 'dust', { delay: 3, planetKind: 'crack' });
  },
  minefield: (A, c) => { over(A, 240, 14, () => fxBlast(A, mapPoint(A), 22 + R() * 18, { silent: R() > 0.15, smoke: R() < 0.3 })); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'fire', { delay: 4 }); },
  emp: (A, c) => {
    const { game } = A.ctx;
    for (let i = 0; i < 3; i++) over(A, 1, 0.1, () => empStrike(A, mapPoint(A, 0.7), { alt: 600, R0: 900, planes: 6, big: true }), i * 2.5);
    rain(A, 50, 14, { model: makeClimateSat, size: 9, r: 50, speed: 300, angle: 0.4, phys: 0.15 });
    wipeMap(A, c, 'nuke', { dur: 14 });
    if (game) game.setTime && game.setTime('night');
    worldEnd(A, c, 'space', { delay: 5, planetKind: 'fire' });
  },
  dustex: (A, c) => {
    const { fx, grid } = A.ctx;
    fx.flash = Math.max(fx.flash, 0.5);
    over(A, 160, 6, () => { const p = mapPoint(A, 1); const y = grid.sample(p.x, p.z) + 200 + R() * 600; for (let i = 0; i < 10; i++) fx.fire.emit(p.x + (R() - 0.5) * 120, y, p.z + (R() - 0.5) * 120, (R() - 0.5) * 30, (R() - 0.5) * 10, (R() - 0.5) * 30, 2.5, 40, 120, [1, 0.6, 0.2, 0.9], [0.7, 0.15, 0.02, 0], 0.3, 0); });
    wipeMap(A, c, 'nuke', { dur: 7 }); worldEnd(A, c, 'fire', { delay: 1.5 });
  },
  heli: (A, c) => {
    const { grid } = A.ctx;
    const half = grid.span / 2;
    const ms = [];
    for (let i = 0; i < 40; i++) { const m = A.spawn(makeHeli(), 2.2); const a = R() * 6.28; ms.push({ m, p: v3(Math.cos(a) * half * 1.3, grid.sample(0, 0) + 120 + R() * 200, Math.sin(a) * half * 1.3), v: v3(-Math.cos(a), 0, -Math.sin(a)).multiplyScalar(60 + R() * 30) }); }
    A.addActive({ t: 0, update(dt) { this.t += dt; for (const h of ms) { h.p.addScaledVector(h.v, dt); h.m.position.copy(h.p); h.m.lookAt(h.p.clone().add(h.v)); h.m.userData.rotor.rotation.y += dt * 40; } return this.t < 40; }, dispose() { for (const h of ms) A.remove(h.m); } });
    over(A, 160, 14, () => fxBlast(A, mapPoint(A), 14 + R() * 14, { silent: R() > 0.2, smoke: R() < 0.4 }), 2);
    wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'fire', { delay: 4 });
  },
  hypersonic: (A, c) => {
    const { fx } = A.ctx;
    over(A, 160, 6, () => { const q = mapPoint(A); for (let i = 0; i < 8; i++) fx.trail(q.clone().add(v3(i * 20, 60 + i * 140, i * 12)), 6, true); fxBlast(A, q, 40 + R() * 30, { silent: R() > 0.25 }); });
    wipeMap(A, c, 'nuke', { dur: 6 }); worldEnd(A, c, 'fire', { delay: 1, planetKind: 'nuke' });
  },
  airship: (A, c) => { copies(A, 'airship', 10, 8); wipeMap(A, c, 'nuke', { dur: 16 }); worldEnd(A, c, 'fire', { delay: 8 }); },
  strafe: (A, c) => { copies(A, 'strafe', 8, 6); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'fire', { delay: 4 }); },
  elevator: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 4, dur: 10 }); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'crack', { delay: 6, planetKind: 'crack' }); },
  hail: (A, c) => {
    const m = () => new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 3), std(0xe2f2ff, { roughness: 0.15, emissive: 0x1a2a38, flatShading: true }));
    rain(A, 120, 12, { model: m, size: 7, r: 35, speed: 200, angle: 0.15, phys: 0.15 });
    wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'ice', { delay: 3 });
  },
  neutron: (A, c) => { liftAll(A, c, 6); crustCollapse(A, c, { level: 1, cracks: 6 }); worldEnd(A, c, 'void', { delay: 4, planetKind: 'shatter' }); },
  mirror: (A, c) => { A.ctx.fx.flash = Math.max(A.ctx.fx.flash, 0.8); over(A, 80, 6, () => A.ctx.fx.column(mapPoint(A), 10, 25)); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 1 }); },
  liquefy: (A, c) => {
    const { D } = A.ctx;
    for (const b of D.buildings) if (b.state === 'intact') { const a = R() * 6.28; D.sinkBuilding(b, b.height * (0.3 + R() * 0.5), 0.1 + R() * 0.4, Math.cos(a), Math.sin(a), 5 + R() * 6); }
    A.crater(c.x, c.z, A.ctx.grid.span * 0.7, 8);
    flood(A, { dur: 16, color: 0x4e4434, height: 0.35 });
    worldEnd(A, c, 'water', { delay: 4, planetKind: 'crack' });
  },
  wildfire: (A, c) => { copies(A, 'wildfire', 6, 5); over(A, 90, 10, () => A.ctx.fx.column(mapPoint(A), 10, 30)); wipeMap(A, c, 'nuke', { dur: 18 }); worldEnd(A, c, 'fire', { delay: 5 }); },
  geyser: (A, c) => { copies(A, 'geyser', 8, 6); crustCollapse(A, c, { level: 1, dur: 10 }); worldEnd(A, c, 'ash', { delay: 4, planetKind: 'crack' }); },
  iceberg: (A, c) => { copies(A, 'iceberg', 5, 5); flood(A, { dur: 16, color: 0x3a6a80 }); worldEnd(A, c, 'ice', { delay: 6 }); },
  methane: (A, c) => { copies(A, 'methane', 8, 6); flood(A, { dur: 14, color: 0x3a3a2a, height: 0.5 }); over(A, 80, 10, () => A.ctx.fx.column(mapPoint(A), 12, 30), 6); worldEnd(A, c, 'fire', { delay: 7 }); },
};
