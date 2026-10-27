// v1.5 영화 오마주 6종 — 장면의 흐름만 빌리고 디자인은 모두 새로
// 행성 파괴 요새, 거대 모래벌레, 기후 위성 오작동, 초능력 폭주, 공룡 떼 질주, 데이터 붕괴
import * as THREE from 'three';
import { makeFortress, makeWorm, makeDino, makeClimateSat, glyphTexture, glow } from './models4.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';
import { fxBlast, over, mapPoint, copies } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const UP = v3(0, 1, 0);
const sideOf = (f) => v3(-f.z, 0, f.x);
const disposeObj = (scene, o) => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); }); };
const NEON = [new THREE.Color(0x39ff88), new THREE.Color(0xff3fd0), new THREE.Color(0x3fd8ff)];

// 다른 무기를 한 번 (연출 끄고, 결말 없이)
function fireOther(A, id, p, powerMul = 1) {
  const cine = A.opts.cinematic, pw = A.power;
  A.opts.cinematic = false; A._noEnding = true; A.power = Math.max(1, Math.min(100, pw * powerMul));
  try { A.fireAs(id, { point: p, info: null }); } finally { A.opts.cinematic = cine; A._noEnding = false; A.power = pw; }
}

export const MOVIE2 = {
  // ---- 행성 파괴 요새: 하늘에 나타난 요새가 빛을 모아 쏘아 일대를 지워버림 ----
  fortress: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, game, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), sd = sideOf(f);
      const size = 900, pos = c.clone().addScaledVector(f, 6000).addScaledVector(sd, -2500).add(v3(0, 4200, 0));
      if (game) game.ensureView(16000, 3000);
      const fort = A.spawn(makeFortress(), size); fort.position.copy(pos); fort.lookAt(c);
      const Rb = 90 * S.r ** 0.8, T0 = 5;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), glow(0x7dffb0, 0));
      scene.add(beam);
      const emitW = () => fort.userData.emit.getWorldPosition(v3());
      const list = D.buildings.map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).filter(x => x[0] < Rb * 3.2).sort((a, b) => a[0] - b[0]);
      let k = 0;
      audio.hum(T0 + 3); audio.charge(T0);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          for (const r of fort.userData.rings) r.rotation.z += dt * 0.4;
          const u = Math.min(1, this.t / T0);
          fort.userData.emit.scale.setScalar(1 + u * 3);
          fx.light(pos.x, pos.y, pos.z, 1e5 * u, 9000, 0.05, 0x7dffb0);
          if (this.t < T0) return true;
          const e = emitW(), te = this.t - T0;
          const on = Math.min(1, te / 0.2) * Math.max(0, 1 - Math.max(0, te - 1.5) / 0.6);
          beam.position.copy(e).lerp(c, 0.5); beam.scale.set(Rb * 0.25 * on + 0.01, e.distanceTo(c), Rb * 0.25 * on + 0.01);
          beam.quaternion.setFromUnitVectors(UP, c.clone().sub(e).normalize());
          beam.material.opacity = 0.85 * on;
          if (!this.hit && te > 0.25) {
            this.hit = true;
            fx.flash = Math.max(fx.flash, 0.7); audio.boom(3, camera.position.distanceTo(c)); audio.rumble(6);
            A.crater(c.x, c.z, Rb, Rb * 0.35);
            for (const ch of [...D.loose]) if (Math.hypot(ch.x - c.x, ch.z - c.z) < Rb) D.removeChunk(ch);
            fx.ring(c, Rb * 4, 1.8, 0xc8ffe0, 0.6); fx.explosion(c, Rb * 0.6, { ring: true });
            world.paintScorch(c.x, c.z, Rb * 2.2, 0.9); world.blastTrees(c.x, c.z, Rb * 3, Rb * 1.5);
          }
          if (this.hit) {
            const cur = Rb * 3.2 * Math.min(1, (te - 0.25) / 2);
            while (k < list.length && list[k][0] <= cur) {
              const [d, b] = list[k++];
              if (d < Rb) { D.vaporizeBuilding(b); continue; }
              if (d < Rb * 1.6) D.blastFrom(b, c, 50 * S.v, { lift: 0.3, lod: 2 });
              else D.flatten(b, 1 - (d - Rb * 1.6) / (Rb * 1.6) * 0.7, (b.cx - c.x) / d, (b.cz - c.z) / d, 1.4);
            }
            if (R() < 0.5) fx.fire.emit(c.x + (R() - 0.5) * Rb, c.y + 2, c.z + (R() - 0.5) * Rb, 0, 20 + R() * 30, 0, 2, Rb * 0.2, Rb * 0.5, [0.7, 1, 0.8, 1], [0.2, 0.6, 0.3, 0], 0.4, 2);
          }
          return te < 4;
        },
        dispose() { A.remove(fort); disposeObj(scene, beam); },
      });
      const g = cineGame(A); if (!g) return;
      const ground = c.clone().addScaledVector(f, -Rb * 3 - 400).addScaledVector(sd, 200).add(v3(0, 40, 0));
      g.cine.play([
        watch(ground, pos, { dur: T0 - 1.2, fov: 55, caption: '행성 파괴 요새', smooth: 0.3 }),
        watch(ground.clone().add(v3(0, 120, 0)), c.clone().add(v3(0, 60, 0)), { dur: 5, fov: 60, ts: (u) => (u > 0.25 && u < 0.5 ? 0.4 : 1), smooth: 0.3 }),
      ]);
    },
  },

  // ---- 거대 모래벌레: 땅속에서 다가와 솟구쳐 일대를 통째로 삼키고 다시 파고듦 ----
  sandworm: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), dir = sideOf(f);
      const rw = 18 * S.r ** 0.6, segs = 18, H = rw * 8;
      const e = c.clone().addScaledVector(dir, rw * 7);
      const worm = makeWorm(segs); worm.scale.setScalar(1); scene.add(worm);
      const { parts, jaw, petals } = worm.userData;
      const startTrail = c.clone().addScaledVector(dir, -500);
      const T1 = 4;                    // 땅속 접근
      const path = (u, out) => { out.copy(c).lerp(e, u); out.y = grid.sample(out.x, out.z) + H * Math.sin(Math.PI * Math.max(0, Math.min(1, u))) - (u < 0 ? -u * H * 2 : u > 1 ? (u - 1) * H * 2 : 0); return out; };
      const tmp = v3(), tmp2 = v3();
      let eatenOnce = false, dove = false;
      const st = { trail: startTrail.clone() };
      audio.rumble(T1 + 6);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          if (this.t < T1) {
            // 땅 밑으로 다가오는 흙먼지 띠
            const q = startTrail.clone().lerp(c, this.t / T1); q.y = grid.sample(q.x, q.z); st.trail.copy(q);
            for (let i = 0; i < 2; i++) fx.smoke.emit(q.x + (R() - 0.5) * rw * 1.5, q.y + 1, q.z + (R() - 0.5) * rw * 1.5, (R() - 0.5) * 4, 4 + R() * 4, (R() - 0.5) * 4, 2, rw * 0.3, rw * 0.8, [0.62, 0.52, 0.4, 0.45], [0.6, 0.55, 0.48, 0], 0.6, 0.2);
            this.acc += dt; if (this.acc > 0.3) { this.acc = 0; A.crater(q.x, q.z, rw * 0.8, 1.2); world.blastTrees(q.x, q.z, rw, rw); D.quake(q.x, q.z, rw * 4, 0.6, 0.3); }
            fx.addShake(dt * 0.5);
            worm.visible = false;
            return true;
          }
          worm.visible = true;
          const uh = -0.25 + (this.t - T1) * 0.17;
          const du = 0.042;
          for (let i = 0; i < segs; i++) {
            const u = uh - i * du;
            path(u, tmp); path(u + 0.01, tmp2);
            const part = parts[i];
            part.position.copy(tmp); part.scale.set(rw, rw * 1.5, rw);
            part.quaternion.setFromUnitVectors(UP, tmp2.sub(tmp).normalize());
            part.visible = tmp.y > grid.sample(tmp.x, tmp.z) - rw * 2;
          }
          path(uh + 0.02, tmp); path(uh + 0.03, tmp2);
          jaw.position.copy(tmp); jaw.scale.setScalar(rw * 1.05);
          jaw.quaternion.setFromUnitVectors(UP, tmp2.sub(tmp).normalize());
          const open = Math.max(0, Math.min(1, (uh + 0.1) / 0.15)) * Math.max(0, Math.min(1, (0.45 - uh) / 0.1));
          for (const pt of petals) pt.children.forEach(ch => { ch.rotation.x = -0.9 * open; });
          // 솟구치는 순간 삼킴
          if (!eatenOnce && uh > -0.05) {
            eatenOnce = true;
            fx.addShake(2); audio.roar(3); audio.boom(2.5, camera.position.distanceTo(c));
            A.crater(c.x, c.z, rw * 2, rw * 1.2);
            for (const b of D.buildingsNear(c.x, c.z, rw * 1.8)) { if (b.state === 'intact') D.sinkBuilding(b, b.height + 20, 0.4, R() - 0.5, R() - 0.5, 1.8); else D.vaporizeBuilding(b); }
            for (const ch of D.gather(c.x, c.z, rw * 2.2, 1)) { const pos = D.chunkPos(ch); D.launch(ch, (c.x - pos.x) * 0.5, 25, (c.z - pos.z) * 0.5, 2); }
            for (let i = 0; i < 35; i++) { const a = R() * 6.28, sp = 10 + R() * 30; fx.smoke.emit(c.x, c.y + 2, c.z, Math.cos(a) * sp, 10 + R() * 25, Math.sin(a) * sp, 3, rw * 0.4, rw * 1.3, [0.62, 0.52, 0.4, 0.8], [0.6, 0.55, 0.48, 0], 0.5, -2); }
          }
          if (eatenOnce && uh < 0.3) for (const ch of D.gather(c.x, c.z, rw * 1.5, 2)) { const pos = D.chunkPos(ch); if (Math.hypot(pos.x - c.x, pos.z - c.z) < rw * 1.2) D.removeChunk(ch); }
          if (!dove && uh > 1) {
            dove = true;
            A.blast(e, rw * 2, 30 * S.v, { crater: [rw * 1.6, rw * 1.2], lift: 0.6 }); fx.addShake(1.5);
          }
          return uh - segs * du < 1.35;
        },
        dispose() { disposeObj(scene, worm); },
      });
      const g = cineGame(A); if (!g) return;
      const low = c.clone().addScaledVector(f, -rw * 10 - 120).add(v3(0, 40, 0));
      g.cine.play([
        watch(low, () => st.trail, { dur: T1, fov: 58, caption: '거대 모래벌레', smooth: 0.3 }),
        watch(low.clone().add(v3(0, rw * 1.5, 0)), c.clone().addScaledVector(dir, rw * 3.5).add(v3(0, H * 0.55, 0)), { dur: 7.5, fov: 62, ts: (u) => (u < 0.3 ? 0.55 : 1), smooth: 0.3 }),
      ]);
    },
  },

  // ---- 기후 위성 오작동: 고장 난 위성망이 도시마다 다른 재해를 동시에 일으킴 ----
  climatesat: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, audio, grid, camera, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sat = A.spawn(makeClimateSat(), 40); sat.position.copy(c).add(v3(0, 900, 0));
      const f = camDir(camera, c), sd = sideOf(f);
      const spread = 180 * S.r ** 0.5;
      const plan = [['tornado', -1, 0], ['lightning', 1, 0.3], ['hail', 0, -1], ['mirror', 0.8, -0.9], ['flashfreeze', -0.8, 0.9]];
      audio.buzz(2);
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          sat.rotation.y += dt * (this.t < 2 ? 0.3 : 3); sat.userData.lamp.visible = ((this.t * 8) | 0) % 2 === 0;
          if (this.t < 2 && R() < 0.3) fx.sparks(sat.position, UP, 6);
          while (this.k < plan.length && this.t > 2 + this.k * 1.4) {
            const [id, a, b] = plan[this.k++];
            const q = c.clone().addScaledVector(sd, a * spread).addScaledVector(f, b * spread); q.y = grid.sample(q.x, q.z);
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 900, 8, 1, true), glow(0xff5050, 0.6)); beam.position.copy(q).add(v3(0, 450, 0)); scene.add(beam);
            A.addActive({ t: 0, update(d2) { this.t += d2; beam.material.opacity = 0.6 * (1 - this.t); return this.t < 1; }, dispose() { disposeObj(scene, beam); } });
            fireOther(A, id, q, 0.6);
          }
          return this.t < 2 + plan.length * 1.4 + 20;
        },
        dispose() { A.remove(sat); },
      });
      const g = cineGame(A); if (!g) return;
      g.cine.play([
        watch(c.clone().addScaledVector(f, -300).add(v3(0, 40, 0)), sat.position, { dur: 2.4, fov: 50, caption: '기후 위성 오작동' }),
        watch(c.clone().addScaledVector(f, -spread * 3 - 200).add(v3(0, spread * 1.4 + 100, 0)), c.clone().add(v3(0, 40, 0)), { dur: plan.length * 1.4 + 6, fov: 60, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 초능력 폭주: 공중의 빛이 파편을 띄우다 순식간에 부풀어 모든 걸 지움 ----
  psychic: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const o = c.clone().add(v3(0, 40, 0));
      const Rp = 75 * S.r ** 0.8, T0 = 4;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), glow(0xf2f6ff, 1)); orb.position.copy(o); orb.scale.setScalar(2); scene.add(orb);
      audio.hum(T0 + 4); audio.charge(T0);
      A.addActive({
        t: 0, burst: false,
        update(dt) {
          this.t += dt;
          if (this.t < T0) {
            orb.scale.setScalar(2 + Math.sin(this.t * 25) * 0.8 + this.t);
            D.field({ x: c.x, y: c.y, z: c.z, r: Rp * 1.2, mode: 'lift', grab: Rp * 0.8 * (this.t / T0) }, dt);
            fx.light(o.x, o.y, o.z, 5000, Rp * 3, 0.05, 0xdfe8ff); fx.addShake(dt * 0.4);
            return true;
          }
          const u = Math.min(1, (this.t - T0) / 0.9);
          if (!this.burst) {
            this.burst = true; fx.flash = Math.max(fx.flash, 0.6); audio.nuke();
            for (const b of D.buildingsNear(c.x, c.z, Rp)) if (Math.hypot(b.cx - c.x, b.cz - c.z) < Rp * 0.95) D.vaporizeBuilding(b);
          }
          orb.scale.setScalar(Rp * (u < 1 ? u : 1)); orb.material.opacity = u < 1 ? 1 : Math.max(0, 1 - (this.t - T0 - 0.9) / 2.5);
          for (const ch of [...D.loose]) if (Math.hypot(ch.x - o.x, ch.y - o.y, ch.z - o.z) < Rp * u) D.removeChunk(ch);
          if (u >= 1 && !this.dug) { this.dug = true; A.crater(c.x, c.z, Rp, Rp * 0.45); D.field({ x: c.x, y: c.y, z: c.z, r: Rp * 3, mode: 'slam' }, dt); fx.ring(c, Rp * 2.5, 1.4, 0xffffff, 0.5); }
          return this.t < T0 + 4;
        },
        dispose() { disposeObj(scene, orb); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -Rp * 2.4 - 80).add(v3(0, 20, 0)), o, { dur: T0, fov: 55, caption: '초능력 폭주', smooth: 0.3 }),
        watch(c.clone().addScaledVector(f, -Rp * 3 - 150).add(v3(0, Rp + 60, 0)), c, { dur: 5, fov: 58, ts: (u) => (u < 0.25 ? 0.4 : 1) }),
      ]);
    },
  },

  // ---- 공룡 떼 질주: 거대한 공룡 무리가 도시를 가로질러 달려감 ----
  dinos: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), dir = sideOf(f);
      const n = Math.min(36, Math.round(10 + 6 * S.n ** 0.6));
      const W = 90 + 40 * S.r;
      const herd = [];
      const cols = [0x5b6a3a, 0x6e5a3a, 0x4a5a52, 0x7a6a48];
      for (let i = 0; i < n; i++) {
        const kind = R() < 0.35 ? 1 : 0;
        const h = (kind ? 32 : 20) * S.r ** 0.4 * (0.8 + R() * 0.4);
        const m = A.spawn(makeDino(kind, cols[i % cols.length]), h);
        const lat = (R() - 0.5) * 2 * W;
        herd.push({ m, h, kind, pos: c.clone().addScaledVector(dir, -620 - R() * 260).addScaledVector(f, lat), sp: (kind ? 16 : 26) * (0.85 + R() * 0.3), ph: R() * 6.28, hit: new Set(), e: A.summon(m) });
      }
      audio.rumble(18); audio.roar(2);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          for (const d of herd) {
            if (d.e.captured) continue;
            d.pos.addScaledVector(dir, d.sp * dt);
            const gy = grid.sample(d.pos.x, d.pos.z);
            const bob = Math.abs(Math.sin(this.t * d.sp * 0.25 + d.ph)) * d.h * 0.04;
            d.m.position.set(d.pos.x, gy + bob, d.pos.z);
            d.m.lookAt(d.pos.x + dir.x, gy + bob, d.pos.z + dir.z);
            d.m.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * d.sp * 0.25 + d.ph + i * Math.PI) * 0.6; });
            for (const b of D.buildingsNear(d.pos.x, d.pos.z, d.h * 0.35)) {
              if (d.hit.has(b) || b.state === 'gone') continue;
              d.hit.add(b); D.blastFrom(b, d.pos.clone().addScaledVector(dir, -15), (18 + d.h * 0.6) * S.v * 0.5, { lift: 0.15, lod: 1 });
            }
            if (R() < 0.3) fx.smoke.emit(d.pos.x, gy + 1, d.pos.z, -dir.x * 4, 2, -dir.z * 4, 3, d.h * 0.15, d.h * 0.5, [0.6, 0.55, 0.47, 0.5], [0.6, 0.58, 0.55, 0], 0.6, 0.3);
          }
          if (R() < dt * 0.4) audio.roar(1.5);
          fx.addShake(dt * 0.3);
          return this.t < 50;
        },
        dispose() { for (const d of herd) A.remove(d.m); },
      });
      const g = cineGame(A); if (!g) return;
      const lead = herd.reduce((a, b) => (a.sp > b.sp ? a : b));
      g.cine.play([
        watch(c.clone().addScaledVector(dir, -120).addScaledVector(f, -30).add(v3(0, 8, 0)), () => lead.pos.clone().add(v3(0, lead.h * 0.6, 0)), { dur: 6, fov: 60, caption: '공룡 떼 질주', smooth: 0.3 }),
        chase(() => lead.pos, () => dir, { back: lead.h * 1.5 + 20, up: lead.h * 0.8, side: -lead.h * 2.5 - 20, ahead: 30, dur: 6, fov: 60, smooth: 0.2 }),
        watch(c.clone().addScaledVector(f, -W * 2 - 150).add(v3(0, 90, 0)), () => lead.pos.clone().lerp(c, 0.4), { dur: 5, fov: 58, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 데이터 붕괴: 도시가 깜빡이며 코드 문자로 부서져 흘러내림 ----
  datacrash: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 110 * S.r ** 0.8, T = 10;
      const blds = D.buildingsNear(c.x, c.z, R0).filter(b => Math.hypot(b.cx - c.x, b.cz - c.z) < R0);
      let top = c.y + 30; for (const b of blds) top = Math.max(top, b.baseY + b.height);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(R0 * 2, R0 * 2, 30, 30), new THREE.MeshBasicMaterial({ color: 0x39ff88, wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2; floor.position.copy(c).add(v3(0, 1, 0)); scene.add(floor);
      // 떨어지는 글자 (16가지 글자 텍스처)
      const base = glyphTexture();
      const mats = [];
      for (let i = 0; i < 16; i++) { const t = base.clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.25); t.offset.set((i % 4) * 0.25, 0.75 - Math.floor(i / 4) * 0.25); mats.push(new THREE.SpriteMaterial({ map: t, color: 0x9dffb8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); }
      const glyphs = [];
      for (let i = 0; i < 160; i++) { const s = new THREE.Sprite(mats[i % 16]); s.scale.setScalar(4 + R() * 4); s.visible = false; scene.add(s); glyphs.push({ s, v: 0 }); }
      const tinted = new Set();
      audio.buzz(T);
      A.addActive({
        t: 0, acc: 0, gi: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T), y = top - (top - c.y) * Math.max(0, (this.t - 2) / (T - 2));
          floor.material.opacity = 0.5 * Math.min(1, this.t) * Math.min(1, (T + 2 - this.t) / 2);
          // 깜빡이는 색
          this.acc += dt;
          if (this.acc > 0.15 && this.t < T) {
            this.acc = 0;
            for (const b of blds) if (b.state === 'intact' && R() < 0.15) { D.tint(b, NEON[Math.floor(R() * 3)], 0.12); tinted.add(b); }
            if (this.t > 2) for (const ch of D.gather(c.x, c.z, R0, 1)) {
              const pos = D.chunkPos(ch);
              if (pos.y < y) continue;
              D.removeChunk(ch);
              if (R() < 0.3) { const gl = glyphs[this.gi++ % glyphs.length]; gl.s.position.copy(pos); gl.s.visible = true; gl.v = 0; }
            }
          }
          for (let i = 0; i < 3; i++) { const gl = glyphs[this.gi++ % glyphs.length]; const a = R() * 6.28, d = Math.sqrt(R()) * R0; gl.s.position.set(c.x + Math.cos(a) * d, top + 20, c.z + Math.sin(a) * d); gl.s.visible = this.t < T; gl.v = 0; }
          for (const gl of glyphs) { if (!gl.s.visible) continue; gl.v += dt * 25; gl.s.position.y -= gl.v * dt + dt * 20; if (gl.s.position.y < grid.sample(gl.s.position.x, gl.s.position.z)) gl.s.visible = false; }
          fx.light(c.x, c.y + 40, c.z, 4000 * (0.5 + 0.5 * Math.sin(this.t * 30)), R0 * 2, 0.05, 0x39ff88);
          return this.t < T + 2;
        },
        dispose() { disposeObj(scene, floor); for (const gl of glyphs) scene.remove(gl.s); for (const m of mats) { m.map.dispose(); m.dispose(); } },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.5 - 90).addScaledVector(sd, 40).add(v3(0, 30, 0)), c.clone().add(v3(0, (top - c.y) * 0.45, 0)), { dur: 5, fov: 58, caption: '데이터 붕괴', smooth: 0.3 }),
        orbit(c, { dist: R0 * 1.4 + 90, h: (top - c.y) * 0.5 + 30, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.8, dur: 7, fov: 58, look: 15 }),
      ]);
    },
  },
};

export const MOVIE2_ENDINGS = {
  fortress: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 12 }); wipeMap(A, c, 'nuke', { dur: 5 }); worldEnd(A, c, 'fire', { delay: 3, planetKind: 'shatter' }); },
  sandworm: (A, c) => { copies(A, 'sandworm', 6, 6); crustCollapse(A, c, { level: 0.8 }); worldEnd(A, c, 'dust', { delay: 8, planetKind: 'crack' }); },
  climatesat: (A, c) => {
    for (const id of ['tornado', 'lightning', 'hail', 'flashfreeze', 'mirror', 'hurricane']) over(A, 2, 4, () => fireOther(A, id, mapPoint(A), 0.5), 2);
    wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'water', { delay: 6, planetKind: 'crack' });
  },
  psychic: (A, c) => { over(A, 1, 0.1, () => { A.crater(c.x, c.z, A.ctx.grid.span * 0.5, 60); }, 5); wipeMap(A, c, 'void', { dur: 4 }); worldEnd(A, c, 'void', { delay: 5, planetKind: 'void' }); },
  dinos: (A, c) => {
    // 공룡 시대의 끝처럼 하늘에서 거대한 불덩이가 떨어짐
    copies(A, 'dinos', 3, 3);
    over(A, 1, 0.1, () => { A.ctx.fx.flash = Math.max(A.ctx.fx.flash, 0.8); fireOther(A, 'asteroid', c, 1); }, 8);
    worldEnd(A, c, 'impact', { delay: 12 });
  },
  datacrash: (A, c) => { wipeMap(A, c, 'void', { dur: 10 }); worldEnd(A, c, 'data', { delay: 4, planetKind: 'void' }); },
};
