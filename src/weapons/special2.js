// 특수 무기: 반중력(재설계), 화이트홀, 중력 반전, 시간 역행
import * as THREE from 'three';
import { sharedUniforms } from '../materials.js';
import { glowMat } from './models2.js';
import { cineGame, watch, orbit, camDir } from './cam.js';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const FIXED = 0, DYN = 1, FROZEN = 2;

export const SPECIAL2 = {
  // ---- 반중력: 일대가 통째로 확 떠올라 멈칫 → 한꺼번에 내리꽂힘 ----
  antigrav: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const r = 85 * S.r;
      const H = 85 * S.r ** 0.5;           // 떠오르는 높이
      const T_CH = 1.2, T_UP = 1.4, T_HOVER = 2.2;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(0x9a5cff, 0));
      dome.position.copy(c); scene.add(dome);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), glowMat(0xc59cff, 0.8)); ring.rotation.x = -Math.PI / 2; ring.position.copy(c).add(v3(0, 1.5, 0)); scene.add(ring);
      const lifted = new Set();
      const st = { t: 0, phase: 'charge', slamAt: 0, landed: false };
      audio.charge(T_CH + 0.3); audio.hum(T_CH + T_UP + T_HOVER);
      const k = 1.4; // 상승 감쇠: 높이 ≈ V / k
      const V = H * k;
      const liftAll = () => {
        for (const ch of D.gather(c.x, c.z, r, 1)) {
          if (lifted.has(ch)) continue;
          const d = Math.hypot(ch.x - c.x, ch.z - c.z);
          const f = 1 - 0.35 * (d / r);
          if (!D.launch(ch, 0, V * f * (0.96 + R() * 0.08), 0)) continue;
          ch.body.setGravityScale(0, true); ch.float = true;
          lifted.add(ch);
        }
      };
      A.addActive({
        acc: 0,
        update(dt) {
          st.t += dt;
          const t = st.t;
          const kk = Math.min(1, t / 0.6);
          dome.scale.set(r * kk, r * 0.75 * kk, r * kk);
          ring.scale.setScalar(r * (0.4 + 0.6 * kk));
          if (st.phase === 'charge') {
            dome.material.opacity = 0.05 + 0.1 * kk + 0.05 * Math.sin(t * 20);
            D.gather(c.x, c.z, r, 1); // 미리 조각내 둠 (시간 예산 안에서)
            this.acc += dt;
            while (this.acc > 0.01) { this.acc -= 0.01; const a = R() * 6.28, d = R() * r; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.fire.emit(x, grid.sample(x, z) + 1, z, 0, 10 + R() * 25, 0, 1.2, 1.4, 0.2, [0.75, 0.5, 1, 0.9], [0.4, 0.2, 1, 0], 0, 0); }
            fx.addShake(dt * 0.6);
            if (t >= T_CH) { st.phase = 'up'; liftAll(); fx.ring(c, r * 1.4, 0.8, 0xc59cff, 0.7); audio.whoosh(1.4); fx.addShake(1.5); for (let i = 0; i < 40; i++) { const a = R() * 6.28, d = R() * r; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.dust({ x, y: grid.sample(x, z), z }, 7); } }
            return true;
          }
          if (st.phase === 'up' || st.phase === 'hover') {
            if (st.phase === 'up' && t < T_CH + 0.5) liftAll(); // 늦게 조각난 건물도 같이
            const damp = Math.exp(-k * dt);
            for (const ch of lifted) {
              if (ch.state !== DYN) { lifted.delete(ch); continue; }
              ch.body.scaleLinvel(0.97 ** (dt * 60), damp, 0.97 ** (dt * 60));
              if (st.phase === 'hover' && R() < dt * 0.8) { const m = ch.mass * 0.4; ch.body.applyTorqueImpulse({ x: (R() - 0.5) * m, y: (R() - 0.5) * m, z: (R() - 0.5) * m }, true); }
            }
            dome.material.opacity = 0.14 + 0.04 * Math.sin(t * 6);
            if (st.phase === 'up' && t >= T_CH + T_UP) st.phase = 'hover';
            if (st.phase === 'hover' && t >= T_CH + T_UP + T_HOVER) {
              // 내리꽂기
              st.phase = 'slam'; st.slamAt = t;
              for (const ch of lifted) { if (ch.state !== DYN) continue; ch.body.setGravityScale(4, true); ch.float = false; ch.body.setLinvel({ x: (R() - 0.5) * 2, y: -45 - R() * 10, z: (R() - 0.5) * 2 }, true); }
              audio.whoosh(0.8);
            }
            return true;
          }
          // 착지 충격
          dome.material.opacity = Math.max(0, dome.material.opacity - dt * 0.5);
          ring.material.opacity = Math.max(0, ring.material.opacity - dt);
          const fall = (Math.sqrt(45 * 45 + 2 * 39 * H) - 45) / 39;
          if (!st.landed && t - st.slamAt > fall * 0.9) {
            st.landed = true;
            fx.ring(c, r * 2.2, 1.4, 0xd8c0a0, 0.6); fx.addShake(3); audio.boom(3, camera.position.distanceTo(c)); audio.crumble(80);
            for (let i = 0; i < 70; i++) { const a = R() * 6.28, d = R() * r * 1.2; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.dust({ x, y: grid.sample(x, z), z }, 10); }
            D.explode({ x: c.x, y: c.y + 2, z: c.z, r: r * 1.8, inner: r * 0.95, power: 22 * S.v, lift: 0.15, lod: 1 });
            A.crater(c.x, c.z, r * 0.9, 3 * S.r ** 0.5);
            world.paintScorch(c.x, c.z, r, 0.35);
          }
          if (t - st.slamAt > 1.6) { for (const ch of lifted) if (ch.state === DYN) ch.body.setGravityScale(1, true); return false; }
          return true;
        },
        dispose() {
          for (const ch of lifted) if (ch.state === DYN) { ch.body.setGravityScale(1, true); ch.float = false; }
          for (const m of [dome, ring]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
        },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const low = c.clone().addScaledVector(f, -r * 1.7).addScaledVector(side, r * 0.4); low.y = grid.sample(low.x, low.z) + 4;
      g.cine.play([
        watch(low, c.clone().add(v3(0, 20, 0)), { dur: T_CH, fov: 50, caption: '반중력' }),
        watch(low, () => c.clone().add(v3(0, H * 0.7, 0)), { dur: T_UP, fov: 54, smooth: 0.2 }),
        orbit(c.clone().add(v3(0, H * 0.8, 0)), { dist: r * 1.7, h: 10, a0: Math.atan2(-f.z, -f.x) - 0.2, a1: Math.atan2(-f.z, -f.x) + 0.5, dur: T_HOVER, fov: 56, ts: 0.35 }),
        watch(() => c.clone().addScaledVector(f, -r * 2.4).addScaledVector(side, -r * 0.8).add(v3(0, r * 0.35, 0)), c, { dur: 2.6, fov: 50, ts: (u) => (u < 0.4 ? 0.6 : 1) }),
      ]);
    },
  },

  // ---- 화이트홀: 모든 것을 밀어내고 블랙홀이 삼킨 것을 토해냄 ----
  whitehole: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z) + 70 * S.r ** 0.5, p.z);
      const r = 120 * S.r, dur = 9 * S.t;
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), glowMat(0xffffff, 1));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), glowMat(0xbfe2ff, 0.35));
      const disk = new THREE.Mesh(new THREE.RingGeometry(1.2, 3.4, 96), glowMat(0xd8ecff, 0.5)); disk.rotation.x = -Math.PI / 2 + 0.35;
      const grp = new THREE.Group(); grp.add(core, halo, disk); grp.position.copy(c); scene.add(grp);
      const eaten = D.eaten.splice(0);
      audio.hum(dur); audio.charge(1.5);
      let spit = 0;
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const t = this.t, k = Math.min(1, t / 0.8) * Math.min(1, (dur - t) / 1.5);
          const cs = 7 * S.r ** 0.5 * (1 + 0.08 * Math.sin(t * 25));
          core.scale.setScalar(cs * k); halo.scale.setScalar(cs * 2.6 * k); disk.scale.setScalar(cs * 2.2 * k); disk.rotation.z += dt * 1.5;
          fx.light(c.x, c.y, c.z, 5e4 * k, r * 4, 0.05, 0xe8f4ff);
          // 밀어내기: 건물을 바깥쪽부터 뜯어내고 파편을 날려 보냄
          for (const ch of D.gather(c.x, c.z, r * 0.6 * Math.min(1, t / 3), 1)) {
            if (ch.state === FIXED && R() > dt * 3) continue;
            const dx = ch.x - c.x, dy = ch.y - c.y, dz = ch.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
            const s = 24 * S.v * k * Math.max(0.2, 1 - d / r);
            if (ch.state !== DYN) D.launch(ch, dx / d * s, dy / d * s + 3, dz / d * s, 0.4);
            else ch.body.applyImpulse({ x: dx / d * s * ch.mass * dt * 3, y: (dy / d * s + 8) * ch.mass * dt * 3, z: dz / d * s * ch.mass * dt * 3 }, true);
          }
          // 삼켰던 조각을 토해냄
          this.acc += dt * Math.max(30, eaten.length / Math.max(1, dur - 2));
          while (this.acc > 1 && eaten.length) {
            this.acc -= 1;
            const ch = eaten.pop();
            const u = v3(R() - 0.5, R() * 0.8 - 0.2, R() - 0.5).normalize();
            const sp = 30 + R() * 50;
            if (D.respawn(ch, c.x + u.x * cs, c.y + u.y * cs, c.z + u.z * cs, u.x * sp, u.y * sp + 10, u.z * sp)) spit++;
          }
          if (this.acc > 1 && !eaten.length) this.acc = 0;
          // 빛 입자
          if (R() < 0.6) { const u = v3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(); fx.fire.emit(c.x, c.y, c.z, u.x * 120, u.y * 120, u.z * 120, 1.2, 3, 0.5, [0.9, 0.95, 1, 1], [0.5, 0.7, 1, 0], 0.5, 0); }
          fx.addShake(dt * 0.5 * k);
          return t < dur;
        },
        dispose() {
          for (const ch of eaten) D.eaten.push(ch);
          scene.remove(grp); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          if (A.ctx.hud && spit) A.ctx.hud.toast(`화이트홀이 조각 ${spit.toLocaleString()}개를 토해냈습니다`, 'info');
        },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), a0 = Math.atan2(-f.z, -f.x);
      g.cine.play([orbit(c, { dist: r * 1.6, h: r * 0.3, a0: a0 - 0.3, a1: a0 + 0.5, dur: 5, look: 0, caption: eaten.length ? `화이트홀 — 삼켰던 조각 ${eaten.length.toLocaleString()}개` : '화이트홀', fov: 55 })]);
    },
  },

  // ---- 중력 반전: 일대의 건물이 하늘로 떨어지고, 중력이 돌아오면 쏟아져 내림 ----
  gravflip: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const r = 110 * S.r, dur = 5 * S.t;
      const phys = D.phys;
      const up = new Set();
      audio.charge(1); audio.hum(dur);
      phys.setGravity(0, 9.81 * 0.7, 0);
      fx.ring(c, r * 1.5, 1, 0x8fd0ff, 0.5);
      A.addActive({
        t: 0, back: false,
        update(dt) {
          this.t += dt;
          const t = this.t;
          if (!this.back) {
            // 반경 안에서 떠오를 것들 (건물은 아래층부터 끊어지며 위로 '떨어짐')
            if (t < dur * 0.6) for (const ch of D.gather(c.x, c.z, r * Math.min(1, 0.3 + t), 1)) {
              if (up.has(ch)) continue;
              if (ch.state === FIXED && R() > dt * (2 + 4 * (1 - (ch.k || 0) / 12))) continue;
              if (D.launch(ch, (R() - 0.5) * 2, 2 + R() * 3, (R() - 0.5) * 2, 0.3)) { ch.float = true; up.add(ch); }
            }
            // 너무 높이 가면 천천히 멈춤
            for (const ch of up) {
              if (ch.state !== DYN) { up.delete(ch); continue; }
              const h = ch.y - grid.sample(ch.x, ch.z);
              if (h > 160 * S.r ** 0.4) ch.body.scaleLinvel(1, 0.9, 1);
            }
            if (game) game.storm = Math.min(0.3, t * 0.3);
            fx.addShake(dt * 0.4);
            if (t >= dur) {
              this.back = true; phys.setGravity(0, -9.81, 0);
              for (const ch of up) if (ch.state === DYN) { ch.float = false; ch.body.setLinvel({ x: ch.body.linvel().x, y: -12, z: ch.body.linvel().z }, true); ch.body.setGravityScale(1.6, true); }
              audio.whoosh(1.5); fx.ring(c, r * 1.5, 1, 0xffffff, 0.4);
            }
            return true;
          }
          if (game) game.storm = Math.max(0, 0.3 - (t - dur) * 0.3);
          if (t > dur + 4) { for (const ch of up) if (ch.state === DYN) ch.body.setGravityScale(1, true); return false; }
          return true;
        },
        dispose() { phys.setGravity(0, -9.81, 0); for (const ch of up) if (ch.state === DYN) { ch.float = false; ch.body.setGravityScale(1, true); } if (game) game.storm = 0; },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const low = c.clone().addScaledVector(f, -r * 1.3).addScaledVector(side, r * 0.3); low.y = grid.sample(low.x, low.z) + 3;
      g.cine.play([
        watch(low, () => c.clone().add(v3(0, 80 + (g.cine.t || 0) * 10, 0)), { dur: dur, fov: 62, caption: '중력 반전', smooth: 0.3 }),
        orbit(c, { dist: r * 2, h: r * 0.8, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.4, dur: 4, look: 20, ts: (0.7) }),
      ]);
    },
  },

  // ---- 시간 역행: 부서진 모든 것이 원래 자리로 되돌아감 ----
  rewind: {
    fire(A) {
      const { D, fx, audio, grid, world, game } = A.ctx;
      // 진행 중인 다른 무기 효과는 모두 멈춤
      A.clear();
      if (game) { game.storm = 0; game.doom = 0; game.frost = 0; }
      sharedUniforms.uPower.value = 1;
      D.phys.setGravity(0, -9.81, 0);
      const moving = D.beginRestore();
      const T = 3.6;
      const h = grid.h, h0 = grid.h0;
      const hStart = h0 ? h.slice() : null;
      audio.rewind(T);
      const tint = document.getElementById('cineFade');
      document.body.classList.add('rewind');
      let stepT = 0;
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T);
          const e = ease.inOut(u);
          D.restoreStep(moving, e);
          // 지형 되돌리기 (몇 번에 나눠)
          stepT -= dt;
          if (hStart && (stepT <= 0 || u >= 1)) {
            stepT = 0.25;
            for (let i = 0; i < h.length; i++) h[i] = hStart[i] + (h0[i] - hStart[i]) * e;
            grid.version++;
            world.updateTerrainMesh(null);
          }
          if (u >= 1) {
            D.finishRestore(moving);
            if (hStart) D.scheduleTerrainRebuild();
            world.restoreTrees(); world.fadeScorch(1);
            fx.flash = Math.max(fx.flash, 0.15);
            return false;
          }
          if (Math.random() < 0.3) world.fadeScorch(0.08);
          return true;
        },
        dispose() { document.body.classList.remove('rewind'); if (tint) tint.style.opacity = '0'; },
      });
      if (A.ctx.hud) A.ctx.hud.toast('시간 역행', 'info');
    },
  },
};
