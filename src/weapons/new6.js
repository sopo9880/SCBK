// v1.5 새 무기 (종말): 떠돌이 블랙홀 통과, 초신성, 대기 증발
import * as THREE from 'three';
import { makeBlackHole, glow } from './models4.js';
import { cineGame, watch, orbit, camDir } from './cam.js';
import { over, mapPoint, flood, liftAll } from './endings.js';
import { worldEnd, wipeMap } from './apocalypse.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const sideOf = (f) => v3(-f.z, 0, f.x);
const disposeObj = (scene, o) => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); }); };
const SCORCH = new THREE.Color(0x2a1a12);

export const NEW6 = {
  // ---- 떠돌이 블랙홀 통과: 하늘을 가로지르며 아래의 도시를 빨아올려 삼킴 ----
  roguehole: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), dir = sideOf(f);
      const T = 12, span = 7000, Hc = 650;
      const Rt = 150 * S.r ** 0.8, size = 30 * S.r ** 0.5;
      if (game) game.ensureView(span, 2500);
      const bh = A.spawn(makeBlackHole(), size);
      const st = { pos: v3(), eaten: 0 };
      const lifted = new Set();
      audio.hum(T); audio.rumble(T);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const s = (this.t / T - 0.5) * span;
          st.pos.copy(c).addScaledVector(dir, s).add(v3(0, Hc + s * s / 7000, 0));
          bh.position.copy(st.pos); bh.lookAt(camera.position);
          bh.userData.disk.material.uniforms.uT.value = this.t;
          const close = Math.max(0, 1 - Math.abs(s) / 2600);
          if (close > 0) {
            fx.addShake(dt * 1.5 * close);
            const q = v3(st.pos.x, grid.sample(st.pos.x, st.pos.z), st.pos.z);
            st.eaten += D.field({ x: st.pos.x, y: st.pos.y, z: st.pos.z, r: Rt * 3 * close + 50, mode: 'gravity', core: size * 1.2, grab: Rt * close, strength: 45 * S.v * close, consume: true }, dt);
            this.acc += dt;
            if (this.acc > 0.3 && close > 0.6) {
              this.acc = 0;
              for (const b of D.buildingsNear(q.x, q.z, Rt * 0.6 * close)) if (b.state === 'intact' && !lifted.has(b)) { lifted.add(b); D.levitate(b, st.pos.y - b.baseY, 3 + R() * 2, R() * 0.5); }
              A.crater(q.x, q.z, Rt * 0.5, -1.5 * close);
            }
            for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = R() * Rt * close; fx.smoke.emit(q.x + Math.cos(a) * d, q.y + 2, q.z + Math.sin(a) * d, (st.pos.x - q.x) * 0.02, 25 + R() * 25, (st.pos.z - q.z) * 0.02, 5, 5, 18, [0.55, 0.5, 0.48, 0.6], [0.4, 0.38, 0.4, 0], 0.15, 0.5); }
          }
          return this.t < T;
        },
        dispose() { A.remove(bh); },
      });
      const g = cineGame(A); if (!g) return;
      const ground = c.clone().addScaledVector(f, -Rt * 2 - 300).add(v3(0, 25, 0));
      g.cine.play([
        watch(ground, () => st.pos.clone().lerp(c, 0.5), { dur: T * 0.45, fov: 72, caption: '떠돌이 블랙홀 통과', smooth: 0.35 }),
        watch(ground.clone().addScaledVector(f, Rt).add(v3(0, 60, 0)), () => st.pos.clone().lerp(v3(st.pos.x, c.y, st.pos.z), 0.6), { dur: T * 0.4, fov: 62, ts: 0.6, smooth: 0.4 }),
        watch(ground.clone().add(v3(0, 150, 0)), c.clone().add(v3(0, 30, 0)), { dur: 4, fov: 58 }),
      ]);
    },
  },

  // ---- 초신성: 하늘의 별 하나가 태양보다 밝아지고, 빛과 열의 벽이 한쪽에서 밀려옴 ----
  supernova: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), from = f.clone().negate().applyAxisAngle(v3(0, 1, 0), 0.6);   // 빛이 오는 방향 (카메라 옆 뒤쪽 하늘)
      const sd = sideOf(from);
      const star = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 12), glow(0xffffff, 1)); star.add(core);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), glow(0xbfd8ff, 0.2)); star.add(halo);
      star.position.copy(c).addScaledVector(from, 14000).add(v3(0, 3500, 0)); scene.add(star);
      const W = 260 * S.r ** 0.8, T0 = 5;
      const half = grid.span / 2;
      const list = D.buildings.map(b => [(b.cx - c.x) * -from.x + (b.cz - c.z) * -from.z, Math.abs((b.cx - c.x) * sd.x + (b.cz - c.z) * sd.z), b]).filter(x => x[1] < W).sort((a, b) => a[0] - b[0]);
      let k = 0;
      audio.hum(T0 + 6);
      A.addActive({
        t: 0, wave: -half * 1.4,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T0);
          star.scale.setScalar(0.3 + 2.5 * u * u); halo.material.opacity = 0.2 + 0.5 * u;
          fx.light(c.x, c.y + 400, c.z, 2e4 * u * u, 6000, 0.05, 0xdfe8ff);
          if (this.t < T0) return true;
          if (!this.flashed) { this.flashed = true; fx.flash = Math.max(fx.flash, 0.95); audio.nuke(); audio.wind(8); }
          this.wave += dt * 260;
          // 빛의 벽이 지나가며 그을리고, 띠 안 건물은 쓰러짐
          while (k < list.length && list[k][0] <= this.wave) {
            const [, off, b] = list[k++];
            if (b.state !== 'intact') continue;
            const sev = 1 - off / W;
            D.tint(b, SCORCH, 0.5 * sev);
            if (sev > 0.25) D.flatten(b, 0.5 + 0.5 * sev, -from.x, -from.z, 1.5 + R());
          }
          for (let i = 0; i < 10; i++) { const l = (R() - 0.5) * 2 * W; const q = c.clone().addScaledVector(from, -this.wave).addScaledVector(sd, l); if (Math.abs(q.x) > half || Math.abs(q.z) > half) continue; q.y = grid.sample(q.x, q.z); fx.smoke.emit(q.x, q.y + 3, q.z, -from.x * 50, 6, -from.z * 50, 4, 8, 28, [0.75, 0.62, 0.5, 0.5], [0.5, 0.45, 0.42, 0], 0.4, 0.5); }
          if (R() < 0.5) { const l = (R() - 0.5) * 2 * W; const q = c.clone().addScaledVector(from, -this.wave).addScaledVector(sd, l); world.paintScorch(q.x, q.z, 30, 0.5); world.blastTrees(q.x, q.z, 30, 30); }
          return this.wave < half * 1.4;
        },
        dispose() { disposeObj(scene, star); },
      });
      const g = cineGame(A); if (!g) return;
      const view = c.clone().addScaledVector(from, -W * 0.6 - 200).addScaledVector(sd, W * 1.4).add(v3(0, 60, 0));
      g.cine.play([
        watch(c.clone().addScaledVector(from, -200).add(v3(0, 20, 0)), () => star.position, { dur: T0 + 0.5, fov: 60, caption: '초신성', smooth: 0.3 }),
        watch(view, c.clone().add(v3(0, 20, 0)), { dur: 7, fov: 60, ts: 0.8, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 대기 증발: 하늘이 검게 변하고 공기가 빠져나가며 물이 끓고 건물이 부풀어 터짐 ----
  airloss: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 160 * S.r ** 0.8, T = 10;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false }));
      dome.position.copy(c); dome.scale.setScalar(R0 * 1.3); scene.add(dome);
      const blds = D.buildingsNear(c.x, c.z, R0).filter(b => Math.hypot(b.cx - c.x, b.cz - c.z) < R0).map(b => [b, 3 + R() * (T - 4)]);
      audio.wind(T); audio.hum(T);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / 3);
          dome.material.opacity = 0.55 * u * Math.min(1, (T + 2 - this.t) / 2);
          // 위로 빠져나가는 바람: 흩어진 파편과 먼지가 하늘로
          this.acc += dt;
          if (this.acc > 0.2 && this.t < T) {
            this.acc = 0;
            for (const ch of D.gather(c.x, c.z, R0, 2)) if (ch.state === 1 && R() < 0.3) ch.body.applyImpulse({ x: 0, y: ch.body.mass() * 6, z: 0 });
            world.blastTrees(c.x, c.z, R0 * u, R0 * u);
          }
          for (let i = 0; i < 8; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * R0; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.smoke.emit(x, grid.sample(x, z) + 2, z, 0, 25 + R() * 30, 0, 3, 3, 14, [0.85, 0.88, 0.92, 0.4 * u], [0.8, 0.82, 0.86, 0], 0.1, 1); }
          // 안팎 압력 차로 건물이 바깥으로 부풀어 터짐
          for (const it of blds) {
            if (it[1] < 0 || this.t < it[1]) continue;
            const b = it[0]; it[1] = -1;
            if (b.state === 'intact') { D.explode({ x: b.cx, y: b.baseY + b.height * 0.5, z: b.cz, r: Math.max(b.maxx - b.minx, b.maxz - b.minz) * 0.8 + 6, power: 14 * S.v, lift: 0.5, lod: 1 }); fx.sparks(v3(b.cx, b.baseY + b.height * 0.6, b.cz), v3(0, 1, 0), 12); audio.crumble(20); }
          }
          return this.t < T + 2;
        },
        dispose() { disposeObj(scene, dome); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.5 - 100).addScaledVector(sd, 50).add(v3(0, 30, 0)), c.clone().add(v3(0, 50, 0)), { dur: 5, fov: 62, caption: '대기 증발', smooth: 0.3 }),
        orbit(c, { dist: R0 * 1.3 + 80, h: 70, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.7, dur: 6, fov: 58, look: 20 }),
      ]);
    },
  },
};

export const NEW6_ENDINGS = {
  roguehole: (A, c) => { liftAll(A, c, 5); wipeMap(A, c, 'void', { dur: 10 }); worldEnd(A, c, 'void', { delay: 6, planetKind: 'void' }); },
  supernova: (A, c) => { A.ctx.fx.flash = Math.max(A.ctx.fx.flash, 1); wipeMap(A, c, 'nuke', { dur: 6 }); over(A, 80, 6, () => A.ctx.fx.column(mapPoint(A), 10, 25)); worldEnd(A, c, 'fire', { delay: 6, planetKind: 'fire' }); },
  airloss: (A, c) => { wipeMap(A, c, 'nuke', { dur: 12 }); flood(A, { dur: 10, color: 0xb8c4cc, height: 0.15 }); worldEnd(A, c, 'space', { delay: 3, planetKind: 'ash' }); },
};
