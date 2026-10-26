// 자연재해 추가: 화산, 산사태, 빙하기
import * as THREE from 'three';
import { makeMeteor } from './models.js';
import { makeIceSpike, glowMat } from './models2.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const ICE = new THREE.Color(0xd8eefc);

function rockMesh(size) { const m = makeMeteor(); m.material = m.material.clone(); m.material.emissiveIntensity = 0; m.material.color.set(0x6a5a4a); m.scale.setScalar(size); return m; }

export const NATURE2 = {
  // ---- 화산: 땅이 솟아 화산이 생기고 분화 (용암탄·화산재 기둥·화쇄류·용암류) ----
  volcano: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, world, camera, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const Rc = 130 * S.r ** 0.7, Hc = 85 * S.r ** 0.7;
      const T_RISE = 4.5, dur = 16 * S.t;
      const steps = 12;
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40), glowMat(0xff6a1a, 0.95));
      lake.rotation.x = -Math.PI / 2; lake.visible = false; scene.add(lake);
      const glowL = new THREE.PointLight(0xff6a20, 0, Rc * 6, 1.6); scene.add(glowL);
      const flows = [];
      audio.rumble(T_RISE + 2);
      const st = { t: 0, step: 0, erupt: false, pyro: 0, pyroPrev: 0 };
      A.addActive({
        acc: 0, bombT: 0,
        update(dt) {
          st.t += dt;
          const t = st.t;
          // 1) 땅이 솟음
          const want = Math.min(steps, Math.floor(t / T_RISE * steps));
          while (st.step < want) {
            st.step++;
            A.crater(c.x, c.z, Rc, -Hc / steps);
            fx.addShake(0.25);
            // 솟는 땅 위 건물은 무너지며 미끄러짐
            for (const ch of D.gather(c.x, c.z, Rc * 0.95, 1)) {
              if (R() > 0.35) continue;
              const dx = ch.x - c.x, dz = ch.z - c.z, d = Math.hypot(dx, dz) || 1;
              D.launch(ch, dx / d * 6, 5 + R() * 4, dz / d * 6, 0.4);
            }
            for (let i = 0; i < 10; i++) { const a = R() * 6.28, d = R() * Rc; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.dust({ x, y: grid.sample(x, z), z }, 8); }
          }
          const top = grid.sample(c.x, c.z);
          // 2) 분화
          if (t > T_RISE && !st.erupt) {
            st.erupt = true;
            A.crater(c.x, c.z, Rc * 0.24, Hc * 0.35);
            world.paintScorch(c.x, c.z, Rc * 0.9, 0.5);
            lake.visible = true;
            fx.flash = Math.max(fx.flash, 0.15); fx.addShake(3); audio.nuke(); audio.rumble(dur);
            fx.explosion(v3(c.x, top + 10, c.z), 45 * S.r ** 0.6, { smokeColumn: true });
            // 용암류 4~7줄기
            const nf = 4 + Math.floor(R() * 4);
            for (let i = 0; i < nf; i++) flows.push({ a: R() * 6.28, d: Rc * 0.2, sp: 6 + R() * 6, wob: R() * 6.28 });
          }
          if (!st.erupt) return true;
          const te = t - T_RISE;
          const k = Math.min(1, te / 1.5) * Math.min(1, (dur - te) / 4);
          lake.position.set(c.x, top + 1.5, c.z); lake.scale.setScalar(Rc * 0.18);
          glowL.position.set(c.x, top + 40, c.z); glowL.intensity = 2.5e4 * k;
          // 용암 분수 + 화산재 기둥
          this.acc += dt;
          while (this.acc > 0.03) {
            this.acc -= 0.03;
            fx.fire.emit(c.x + (R() - 0.5) * 12, top + 4, c.z + (R() - 0.5) * 12, (R() - 0.5) * 30, 50 + R() * 70 * k, (R() - 0.5) * 30, 1.6 + R(), 4, 1.5, [1, 0.6, 0.25, 0.8], [0.6, 0.1, 0.02, 0], 0.2, -25);
            fx.smoke.emit(c.x + (R() - 0.5) * 20, top + 20 + R() * 30, c.z + (R() - 0.5) * 20, (R() - 0.5) * 8, 30 + R() * 30, (R() - 0.5) * 8, 14 + R() * 8, 25, 120 * S.r ** 0.4, [0.16, 0.14, 0.13, 0.85 * k], [0.25, 0.24, 0.24, 0], 0.05, 3, 0.1);
          }
          // 용암탄
          this.bombT -= dt;
          if (this.bombT <= 0 && te < dur - 2) {
            this.bombT = 0.18 / Math.sqrt(S.n);
            const a = R() * 6.28, d = Rc * (0.5 + R() * 2.2);
            const q = v3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d); q.y = grid.sample(q.x, q.z);
            const tt = 2.5 + R() * 2.5, gg = 30, from = v3(c.x, top + 8, c.z);
            const vel = v3((q.x - from.x) / tt, (q.y - from.y + 0.5 * gg * tt * tt) / tt, (q.z - from.z) / tt);
            const sz = 1.5 + R() * 3;
            A.addProjectile({ mesh: A.spawn(makeMeteor(), sz), pos: from, vel, g: gg, spin: true, trail: { size: sz, fire: true, every: 0.03 },
              onHit: (qq) => { A.blast(qq, sz * 4 * S.r ** 0.4, 22 * S.v, { vap: sz * 0.5, crater: [sz * 1.2, sz * 0.4], silent: R() > 0.25, smokeColumn: false }); if (R() < 0.35) fx.column(qq, sz * 1.5, 6 + R() * 6); } });
          }
          // 화쇄류: 분화 직후 산 아래로 퍼지는 뜨거운 먹구름
          if (te < 7) {
            const Rp = Rc * 3.2;
            st.pyro = Rp * (1 - (1 - te / 7) ** 2);
            if (st.pyro > st.pyroPrev) {
              for (const b of D.buildingsNear(c.x, c.z, st.pyro)) {
                const d = Math.hypot(b.cx - c.x, b.cz - c.z);
                if (d > st.pyroPrev && d <= st.pyro && b.state === 'intact') { const s = Math.max(0.35, 1 - d / Rp); if (R() < 0.25) D.blastFrom(b, c, 26 * S.v * s, { lift: 0.15, scorch: 0.9, lod: 2 }); else D.flatten(b, s, (b.cx - c.x) / d, (b.cz - c.z) / d, 1.8); }
              }
              D.ringPush(c, st.pyroPrev, st.pyro, 18 * S.v, 0.1);
              const n = Math.round(16 * A.ctx.quality.fxScale);
              for (let i = 0; i < n; i++) {
                const a = R() * 6.28, x = c.x + Math.cos(a) * st.pyro, z = c.z + Math.sin(a) * st.pyro;
                fx.smoke.emit(x, grid.sample(x, z) + 6, z, Math.cos(a) * 25, 8, Math.sin(a) * 25, 7 + R() * 5, 20, 70, [0.2, 0.17, 0.15, 0.85], [0.3, 0.28, 0.27, 0], 0.4, 1.2);
                if (R() < 0.3) fx.fire.emit(x, grid.sample(x, z) + 4, z, Math.cos(a) * 15, 5, Math.sin(a) * 15, 1, 10, 25, [1, 0.5, 0.15, 0.8], [0.5, 0.1, 0.02, 0], 1, 1);
              }
              world.paintScorch(c.x, c.z, st.pyro, 0.12); world.blastTrees(c.x, c.z, st.pyro, st.pyro * 0.7);
              st.pyroPrev = st.pyro;
            }
          }
          // 용암류: 비탈을 따라 천천히 내려가며 태움
          for (const fl of flows) {
            if (fl.d > Rc * 3) continue;
            fl.d += fl.sp * dt * k;
            const a = fl.a + Math.sin(fl.d * 0.02 + fl.wob) * 0.25;
            const x = c.x + Math.cos(a) * fl.d, z = c.z + Math.sin(a) * fl.d, y = grid.sample(x, z);
            if (R() < 0.6) fx.fire.emit(x + (R() - 0.5) * 10, y + 1, z + (R() - 0.5) * 10, 0, 1.5, 0, 3, 6, 3, [1, 0.45, 0.1, 0.7], [0.4, 0.05, 0.01, 0], 1, 0);
            if (R() < dt * 4) { world.paintScorch(x, z, 9, 0.8); D.burn(x, z, 14, 0.3); }
          }
          fx.addShake(dt * 0.8 * k);
          return te < dur + 8;
        },
        dispose() { scene.remove(lake); lake.geometry.dispose(); lake.material.dispose(); scene.remove(glowL); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const a0 = Math.atan2(-f.z, -f.x);
      g.cine.play([
        orbit(c, { dist: Rc * 3.4, h: Hc * 0.9, a0: a0 - 0.3, a1: a0 + 0.1, dur: T_RISE, look: Hc * 0.4, caption: '땅이 솟아오릅니다', fov: 48 }),
        watch(() => c.clone().addScaledVector(f, -Rc * 3.6).addScaledVector(side, Rc * 1.2).setY(grid.sample(c.x, c.z) + 30), () => c.clone().setY(grid.sample(c.x, c.z) + 120), { dur: 3, fov: 56, caption: '분화!', ts: (u) => 0.5 + 0.5 * u }),
        orbit(c, { dist: Rc * 5, h: Hc * 2, a0: a0 + 0.1, a1: a0 + 0.9, dur: 7, look: Hc * 1.2, fov: 50 }),
      ], { onSkip: () => { st.t = Math.max(st.t, T_RISE + 0.01); } });
    },
  },

  // ---- 산사태: 비탈 위에서 흙더미와 바위가 쏟아져 내려옴 ----
  landslide: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, world, camera } = A.ctx;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      // 가장 높은 쪽에서 내려오게
      const dist = 340 * S.r ** 0.5;
      let best = -1e9, dir = camDir(camera, tgt).negate();
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        const h = grid.sample(tgt.x + Math.cos(a) * dist, tgt.z + Math.sin(a) * dist);
        if (h > best + 3) { best = h; dir = v3(-Math.cos(a), 0, -Math.sin(a)); }
      }
      const src = tgt.clone().addScaledVector(dir, -dist);
      const halfW = 60 * S.r ** 0.6;
      const L = dist + 200 * S.r ** 0.5;
      const st = { front: 0, prev: 0, sp: 10, dep: 0 };
      audio.rumble(L / 30 + 2);
      // 굴러오는 바위
      const nB = Math.round(6 + 6 * S.n ** 0.5);
      for (let i = 0; i < nB; i++) {
        const r = 3 + R() * 5 * S.r ** 0.4;
        const l = (R() - 0.5) * 2 * halfW * 0.8;
        const pos = src.clone().add(v3(-dir.z * l, 0, dir.x * l)).addScaledVector(dir, -R() * 30);
        pos.y = grid.sample(pos.x, pos.z) + r + 2;
        const m = rockMesh(r); A.ctx.scene.add(m);
        A.addActive({ t: 0, d: 0.4 + R() * 1.6, update(dt) { this.t += dt; if (this.t < this.d) return true; D.addBall(pos, dir.clone().multiplyScalar(22 + R() * 14).add(v3(0, 2, 0)), r, m, { life: 25 }); return false; } });
      }
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          st.sp = Math.min(34, st.sp + dt * 7);
          st.front += st.sp * dt;
          const fx0 = src.x + dir.x * st.front, fz0 = src.z + dir.z * st.front;
          const gy = grid.sample(fx0, fz0);
          D.sweep({ ox: src.x, oz: src.z, dx: dir.x, dz: dir.z, prev: st.prev, front: st.front, halfW, waterY: gy + 16, power: 16 * S.v }, dt);
          // 흙더미가 쌓임
          st.dep += st.front - st.prev;
          while (st.dep > 22) {
            st.dep -= 22;
            const back = st.front - 30;
            for (let j = -1; j <= 1; j++) {
              const x = src.x + dir.x * back - dir.z * j * halfW * 0.55, z = src.z + dir.z * back + dir.x * j * halfW * 0.55;
              A.crater(x, z, halfW * 0.55, -(2.5 + R() * 2) * S.r ** 0.3);
              world.paintScorch(x, z, halfW * 0.6, 0.25);
            }
          }
          st.prev = st.front;
          // 흙먼지 벽
          this.acc += dt;
          while (this.acc > 0.01) {
            this.acc -= 0.01;
            const l = (R() - 0.5) * 2 * halfW;
            const x = fx0 - dir.z * l, z = fz0 + dir.x * l;
            const y = grid.sample(x, z);
            const col = 0.42 + R() * 0.1;
            fx.smoke.emit(x, y + R() * 8, z, dir.x * st.sp * 0.8 + (R() - 0.5) * 6, 4 + R() * 6, dir.z * st.sp * 0.8 + (R() - 0.5) * 6, 3 + R() * 3, 8, 34, [col, col * 0.85, col * 0.66, 0.85], [0.5, 0.46, 0.4, 0], 0.6, 0.6);
          }
          world.blastTrees(fx0, fz0, halfW, halfW * 0.8);
          fx.addShake(dt * 0.6);
          return st.front < L;
        },
      });
      const g = cineGame(A); if (!g) return;
      const side = v3(-dir.z, 0, dir.x);
      const front = () => src.clone().addScaledVector(dir, st.front).setY(grid.sample(src.x + dir.x * st.front, src.z + dir.z * st.front) + 10);
      const cam1 = tgt.clone().addScaledVector(dir, 80).addScaledVector(side, 40); cam1.y = grid.sample(cam1.x, cam1.z) + 6;
      g.cine.play([
        watch(cam1, front, { dur: Math.min(5, dist / 30), fov: 42, caption: '산사태', smooth: 0.15 }),
        watch(() => front().addScaledVector(side, halfW * 3.2).add(v3(0, 50, 0)), front, { dur: 5, fov: 55, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 빙하기: 얼음이 퍼지며 모든 것이 얼어붙고, 얼어붙은 건물이 산산조각 ----
  iceage: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, world, camera, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const Ri = Math.min(grid.span * 0.7, 260 * S.r);
      const T_SPREAD = 5;
      const list = D.buildingsNear(c.x, c.z, Ri).map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).filter(x => x[0] < Ri).sort((a, b) => a[0] - b[0]);
      let k = 0, fracLeft = Math.round((A.ctx.quality.shockFracture || 18) * 2.2);
      const shatter = [];
      const spikes = new THREE.Group(); scene.add(spikes);
      const growing = [];
      audio.freeze(T_SPREAD); audio.wind(T_SPREAD + 6);
      if (game) game.frost = 1;
      const st = { t: 0, prev: 0 };
      A.addActive({
        acc: 0,
        update(dt) {
          st.t += dt;
          const t = st.t;
          const cur = Ri * Math.min(1, Math.sqrt(t / T_SPREAD));
          if (cur > st.prev) {
            // 땅이 하얗게 얼어붙음
            const n = 6;
            for (let i = 0; i < n; i++) { const a = R() * 6.28, d = st.prev + R() * (cur - st.prev); world.paintFrost(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 25 + R() * 30, 0.9); }
            world.paintFrost(c.x, c.z, cur, 0.08);
            // 얼음 가시
            const ns = Math.round((cur - st.prev) * 0.25 * A.ctx.quality.fxScale);
            for (let i = 0; i < ns && spikes.children.length < 220; i++) {
              const a = R() * 6.28, d = st.prev + R() * (cur - st.prev);
              const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
              const s = makeIceSpike();
              const h = 3 + R() * 7 * S.r ** 0.4;
              s.position.set(x, grid.sample(x, z) - 1, z);
              s.rotation.set((R() - 0.5) * 0.6, R() * 6, (R() - 0.5) * 0.6);
              spikes.add(s); growing.push({ s, h, w: h * (0.3 + R() * 0.2), t: 0 });
            }
            while (k < list.length && list[k][0] <= cur) {
              const [d, b] = list[k++];
              D.tint(b, ICE, 0.75);
              shatter.push({ b, at: t + 1.5 + R() * 3 * (d / Ri + 0.3) });
            }
            // 흩어진 파편도 얼어붙음 (그 자리에 고정)
            st.prev = cur;
          }
          for (const g of growing) { if (g.t >= 1) continue; g.t = Math.min(1, g.t + dt * 2); const e = 1 - (1 - g.t) ** 3; g.s.scale.set(g.w * e, g.h * e, g.w * e); }
          // 얼어붙은 건물이 금 가며 무너짐
          for (let i = shatter.length - 1; i >= 0; i--) {
            const it = shatter[i];
            if (t < it.at) continue;
            const b = it.b;
            if (b.state === 'intact' && fracLeft > 0) {
              if (!D._fractureSoon(b, 1)) continue;
              fracLeft--;
            }
            shatter.splice(i, 1);
            if (b.state === 'fractured') {
              let n = 0;
              for (const ch of b.chunks) {
                if (ch.state !== 0) continue;
                if (R() < 0.75) { const m = ch.mass; D.release(ch, (R() - 0.5) * m * 3, -m * 2, (R() - 0.5) * m * 3, 0.6); n++; }
              }
              D.tint(b, ICE, 0);
              if (n) { audio.crumble(n); if (R() < 0.5) audio.crack(); }
              for (let j = 0; j < 6; j++) fx.smoke.emit(b.cx + (R() - 0.5) * 10, b.baseY + R() * b.height, b.cz + (R() - 0.5) * 10, (R() - 0.5) * 4, 2, (R() - 0.5) * 4, 3, 4, 14, [0.92, 0.96, 1, 0.6], [0.9, 0.94, 1, 0], 0.8, 0.3);
            } else if (b.state === 'intact') D.flatten(b, 0.5 + R() * 0.4, (b.cx - c.x) / (Math.hypot(b.cx - c.x, b.cz - c.z) || 1), (b.cz - c.z) / (Math.hypot(b.cx - c.x, b.cz - c.z) || 1), 2.2);
          }
          // 얼음 안개
          this.acc += dt;
          while (this.acc > 0.03 && t < T_SPREAD + 4) {
            this.acc -= 0.03;
            const a = R() * 6.28, d = R() * cur;
            const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
            fx.smoke.emit(x, grid.sample(x, z) + 2, z, (R() - 0.5) * 4, 1, (R() - 0.5) * 4, 5, 10, 40, [0.9, 0.95, 1, 0.45], [0.9, 0.95, 1, 0], 0.5, 0.2);
          }
          if (game) game.frost = t < T_SPREAD + 14 ? 1 : Math.max(0, 1 - (t - T_SPREAD - 14) / 8);
          return t < T_SPREAD + 22 || shatter.length > 0 && t < 60;
        },
        dispose() { if (game) game.frost = 0; scene.remove(spikes); spikes.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), a0 = Math.atan2(-f.z, -f.x);
      g.cine.play([
        orbit(c, { dist: Ri * 1.5, h: Ri * 0.7, a0: a0 - 0.4, a1: a0 + 0.2, dur: T_SPREAD, look: 0, caption: '빙하기', fov: 50 }),
        orbit(c, { dist: Ri * 0.55, h: 35, a0: a0 + 0.2, a1: a0 + 0.8, dur: 5, look: 25, fov: 56, ts: 0.6 }),
      ]);
    },
  },
};
