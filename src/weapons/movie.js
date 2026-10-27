// 영화 오마주 13종 — 장면의 흐름만 빌리고 기계·인물은 모두 새로 디자인
import * as THREE from 'three';
import { makeEngine, makeGuardian, makeTripodParts, makeMech, makeApe, makeShark } from './movieModels.js';
import { makeGolem, makeAsteroid, glowMat } from './models2.js';
import { makeMeteor } from './models.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';
import { fxBlast, over, mapPoint, flood, rain } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';
import { detonate, nukeYield } from './nukes.js';
import { funnelMat, boltMesh } from './storms.js';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const disposeObj = (scene, o) => { scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); }); };
const ICE = new THREE.Color(0xd8eefc);

// 다른 무기를 한 번 (연출 끄고)
function fireOther(A, id, p, powerMul = 1) {
  const cine = A.opts.cinematic, pw = A.power;
  A.opts.cinematic = false; A._noEnding = true; A.power = Math.min(100, pw * powerMul);
  try { A.fireAs(id, { point: p, info: null }); } finally { A.opts.cinematic = cine; A._noEnding = false; A.power = pw; }
}

export const MOVIE = {
  // ---- 테라포밍 엔진: 하늘에서 내려온 기계가 중력 빔으로 도시를 짓누르고, 마지막에 수호자가 뚫고 지나가 멈춤 ----
  terraform: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, grid, audio, camera, world, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sc = 0.8 * S.r ** 0.25;
      const eng = A.spawn(makeEngine(), sc);
      const U = eng.userData;
      const startY = c.y + 2600;
      eng.position.set(c.x, startY, c.z);
      const nP = Math.round(5 + 2 * S.n ** 0.6);              // 중력 박동 횟수
      const T_LAND = 5, T_SPIN = 2.2, T_P = 1.7, T_PULSES = nP * T_P;
      const T_HERO = T_LAND + T_SPIN + T_PULSES;              // 수호자 도착
      const r0 = 60 * S.r ** 0.5;
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const heroFrom = c.clone().addScaledVector(side, -6000).add(v3(0, 2600, 0));
      const coreAt = () => eng.position.clone().add(v3(0, U.H * sc, 0));
      const hero = A.spawn(makeGuardian(), 14 * sc);
      hero.visible = false;
      const st = { t: 0, pulse: 0, landed: false, heroHit: false, fall: 0, slam: [], lifted: new Set() };
      audio.drone(T_LAND + 2); audio.rumble(T_LAND);
      if (game) game.ensureView(9000, 4000);
      A.addActive({
        acc: 0,
        update(dt) {
          st.t += dt;
          const t = st.t;
          U.arms.rotation.y += dt * (t > T_LAND ? Math.min(3, (t - T_LAND) * 1.2) : 0.2);
          // 1) 하강·착지
          if (t < T_LAND) { eng.position.y = c.y + (startY - c.y) * (1 - ease.out(t / T_LAND)); return true; }
          if (!st.landed) {
            st.landed = true; eng.position.y = c.y;
            for (const fpt of U.legs) { const q = eng.position.clone().add(fpt.clone().multiplyScalar(sc)); q.y = grid.sample(q.x, q.z); A.blast(q, 30 * sc, 30, { lift: -0.5, crater: [14 * sc, 4 * sc], silent: true }); }
            fx.addShake(2.5); audio.boom(3, camera.position.distanceTo(c));
          }
          // 2) 충전
          const tp = t - T_LAND - T_SPIN;
          U.eyeMat.opacity = Math.min(1, (t - T_LAND) / T_SPIN);
          if (tp < 0) { if (R() < dt * 30) { const a = R() * 6.28, d = r0 * (1 + R()); const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.dust({ x, y: grid.sample(x, z), z }, 6); } return true; }
          // 3) 중력 박동: 떠올랐다가 짓눌림, 범위가 점점 커짐
          if (!st.heroHit) {
            const k = Math.floor(tp / T_P), ph = (tp % T_P) / T_P;
            U.beamMat.opacity = ph < 0.25 ? 0.9 : 0.35 + 0.1 * Math.sin(t * 30);
            U.beam.scale.set(1 + (ph < 0.25 ? 0.6 : 0), 1, 1 + (ph < 0.25 ? 0.6 : 0));
            if (k >= st.pulse && k < nP) {
              st.pulse = k + 1;
              const rk = r0 * (1 + k * 0.45);
              // 박동: 아래로 짓누르는 충격 + 바닥 꺼짐
              D.explode({ x: c.x, y: c.y + 4, z: c.z, r: rk, power: 40 * S.v, lift: -1.2, scorch: 0.2, lod: 1 });
              A.crater(c.x, c.z, rk * 0.8, 4 + k * 1.5);
              for (const b of D.buildingsNear(c.x, c.z, rk * 1.5)) { const d = Math.hypot(b.cx - c.x, b.cz - c.z); if (d < rk * 1.5 && d > rk * 0.4) D.flatten(b, Math.min(1, 1.3 - d / (rk * 1.5)), (b.cx - c.x) / d, (b.cz - c.z) / d, 0.6); }
              // 흩어진 파편은 떠올랐다가 다음 박동에 내리꽂힘
              for (const ch of D.gather(c.x, c.z, rk * 1.4, 2)) if (R() < 0.35) { if (D.launch(ch, (R() - 0.5) * 3, 14 + R() * 10, (R() - 0.5) * 3)) st.slam.push([ch, t + T_P * 0.55]); }
              fx.ring(c, rk * 2.2, 1.2, 0xa8dcff, 0.6); fx.addShake(1.8); audio.boom(2.4, camera.position.distanceTo(c));
              world.paintScorch(c.x, c.z, rk, 0.4);
            }
            for (let i = st.slam.length - 1; i >= 0; i--) { const [ch, at] = st.slam[i]; if (t >= at) { st.slam.splice(i, 1); if (ch.state === 1) { ch.body.setGravityScale(4, true); ch.body.setLinvel({ x: 0, y: -40, z: 0 }, true); } } }
            // 수호자 접근
            if (t > T_HERO - 3.2) {
              hero.visible = true;
              const u = Math.min(1, (t - (T_HERO - 3.2)) / 3.2);
              const target = coreAt();
              hero.position.copy(heroFrom).lerp(target, ease.in(u));
              hero.lookAt(target);
              for (let i = 0; i < 4; i++) fx.fire.emit(hero.position.x, hero.position.y, hero.position.z, 0, 0, 0, 1.2, 22 * sc, 4, [0.7, 0.9, 1, 1], [0.3, 0.5, 1, 0], 0.5, 0);
              if (u >= 1) {
                st.heroHit = true; st.fall = t;
                U.beamMat.opacity = 0; U.eyeMat.opacity = 0;
                const q = coreAt();
                fx.explosion(q, 60 * sc, { smokeColumn: true }); fx.flash = Math.max(fx.flash, 0.5); fx.addShake(3); audio.nuke();
                for (let i = 0; i < 80; i++) fx.sparks(q, { x: (R() - 0.5) * 2, y: R(), z: (R() - 0.5) * 2 }, 3);
                for (const [ch] of st.slam) if (ch.state === 1) ch.body.setGravityScale(1, true);
                if (A.ctx.hud) A.ctx.hud.toast('수호자가 엔진을 멈췄습니다', 'info');
              }
            }
            return true;
          }
          // 4) 수호자는 뚫고 하늘로, 엔진은 기울며 쓰러짐
          const tf = t - st.fall;
          hero.position.addScaledVector(v3(0, 1, 0).add(side.clone().multiplyScalar(0.3)).normalize(), 900 * dt);
          if (tf < 4) {
            const ang = 1.25 * ease.in(Math.min(1, tf / 3.2));
            eng.quaternion.setFromAxisAngle(f, -ang);
            if (R() < dt * 20) { const q = coreAt(); fx.explosion(q.add(v3((R() - 0.5) * 60, (R() - 0.5) * 60, (R() - 0.5) * 60)), 15 * sc, { smokeColumn: false }); }
            if (tf > 3.2 && !st.crashed) {
              st.crashed = true;
              const q = c.clone().addScaledVector(side, U.H * sc * 0.9); q.y = grid.sample(q.x, q.z);
              A.blast(q, 90 * sc, 50 * S.v, { vap: 10, crater: [40 * sc, 10 * sc] }); fx.addShake(3);
            }
            return true;
          }
          return tf < 8;
        },
        dispose() { A.remove(eng); A.remove(hero); for (const [ch] of st.slam) if (ch.state === 1) ch.body.setGravityScale(1, true); },
      });
      const g = cineGame(A); if (!g) return;
      const low = c.clone().addScaledVector(f, -700).addScaledVector(side, 250); low.y = c.y + 15;
      const a0 = Math.atan2(-f.z, -f.x);
      g.cine.play([
        watch(low, () => eng.position.clone().add(v3(0, U.H * sc * 0.6, 0)), { dur: T_LAND, fov: 50, caption: '테라포밍 엔진', smooth: 0.25 }),
        watch(low.clone().add(v3(0, 40, 0)), () => coreAt(), { dur: T_SPIN, fov: 42, caption: '중력 빔 가동', smooth: 0.3 }),
        orbit(c, { dist: 900 * sc, h: 260 * sc, a0, a1: a0 + 0.9, dur: T_PULSES - 3.2, look: 80 * sc, fov: 55 }),
        chase(() => hero.position, () => coreAt().sub(hero.position), { back: 60 * sc, up: 10 * sc, ahead: 200, dur: 2.6, fov: 60, caption: '하늘에서 무언가 날아온다' }),
        watch(() => coreAt().addScaledVector(side, -500 * sc).add(v3(0, 60, 0)), () => coreAt(), { dur: 1.2, fov: 45, ts: 0.25, smooth: 0.1 }),
        watch(() => c.clone().addScaledVector(f, -1100 * sc).addScaledVector(side, 500 * sc).setY(c.y + 160 * sc), () => c.clone().add(v3(0, 120 * sc, 0)), { dur: 6, fov: 50, ts: (u) => (u < 0.2 ? 0.4 : 1) }),
      ]);
    },
  },

  // ---- 세 다리 침략자: 땅속에서 솟은 전투기계가 열선을 휘두르며 걸어감 ----
  tripod: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, grid, audio, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sc = 1.0 * S.r ** 0.3;
      const P = makeTripodParts();
      const head = P.head; head.scale.setScalar(sc); scene.add(head);
      for (const L of P.legs) for (const m of [L.thigh, L.shin, L.knee, L.foot]) { m.scale.multiplyScalar(sc); scene.add(m); }
      const H = 120 * sc, L1 = 0.78 * H, L2 = 0.82 * H, Rf = 0.62 * H, hipR = 18 * sc, stepLen = 0.7 * H;
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const walk = side.clone().multiplyScalar(R() < 0.5 ? 1 : -1);
      const pos = c.clone().addScaledVector(walk, -110 * sc);        // 머리의 지면 투영점
      const yawQ = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), walk);
      const legA = [0, 2.1, -2.1];                                   // 다리 방향 (진행 방향 기준)
      const restOf = (i, at) => { const d = v3(Math.sin(legA[i]), 0, Math.cos(legA[i])).applyQuaternion(yawQ); const q = at.clone().addScaledVector(d, Rf); q.y = grid.sample(q.x, q.z); return q; };
      const feet = legA.map((_, i) => ({ at: restOf(i, pos), from: null, to: null, k: 1 }));
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), glowMat(0xff6a30, 0.9)); ray.visible = false; scene.add(ray);
      const dur = 16 * S.t;
      const up = v3(0, 1, 0), tmp = v3(), dir = v3(), bend = v3(), knee = v3(), hip = v3();
      const seg = (m, a, b) => { tmp.subVectors(b, a); const len = tmp.length(); m.position.copy(a).addScaledVector(tmp, 0.5); m.scale.y = len; m.quaternion.setFromUnitVectors(up, tmp.divideScalar(len || 1)); };
      audio.horn(3); audio.rumble(4);
      A.addActive({
        t: 0, acc: 0, stepping: -1,
        update(dt) {
          this.t += dt;
          const t = this.t;
          // 솟아오름 (처음 3초) 뒤 걷기
          const rise = Math.min(1, t / 3);
          if (t >= 3 && t < dur) { pos.addScaledVector(walk, 11 * sc * dt); pos.y = grid.sample(pos.x, pos.z); }
          const hy = pos.y + H * (0.15 + 0.85 * ease.out(rise)) + 3 * sc * Math.sin(t * 2.4);
          head.position.set(pos.x, hy, pos.z);
          head.quaternion.copy(yawQ); head.rotateX(0.05 * Math.sin(t * 1.2)); head.rotateZ(0.04 * Math.sin(t * 0.9));
          if (t < 3) { if (R() < dt * 30) fx.dust({ x: pos.x + (R() - 0.5) * 80 * sc, y: pos.y, z: pos.z + (R() - 0.5) * 80 * sc }, 12); D.quake(pos.x, pos.z, 80 * sc, 1, dt); }
          // 발 옮기기: 한 번에 한 발씩, 가장 뒤처진 발부터
          if (this.stepping < 0 && t >= 3) {
            let worst = -1, wd = stepLen * 0.55;
            feet.forEach((ft, i) => { const d = ft.at.distanceTo(restOf(i, pos)); if (d > wd) { wd = d; worst = i; } });
            if (worst >= 0) { const ft = feet[worst]; ft.from = ft.at.clone(); ft.to = restOf(worst, pos.clone().addScaledVector(walk, stepLen * 0.5)); ft.k = 0; this.stepping = worst; }
          }
          if (this.stepping >= 0) {
            const ft = feet[this.stepping];
            ft.k = Math.min(1, ft.k + dt / 0.75);
            ft.at.lerpVectors(ft.from, ft.to, ease.inOut(ft.k)); ft.at.y += Math.sin(Math.PI * ft.k) * H * 0.22;
            if (ft.k >= 1) {
              ft.at.copy(ft.to); this.stepping = -1;
              fx.dust(ft.at, 14 * sc); audio.thud(); fx.addShake(0.5);
              D.explode({ x: ft.at.x, y: ft.at.y + 2, z: ft.at.z, r: 14 * sc, power: 18, lift: -0.3, lod: 1, lodBudget: 2 });
              world.blastTrees(ft.at.x, ft.at.z, 12 * sc, 12 * sc);
            }
          }
          // 다리 관절 (2마디 역기구학): 무릎은 바깥·위로 꺾임
          feet.forEach((ft, i) => {
            const L = P.legs[i];
            const d0 = v3(Math.sin(legA[i]), 0, Math.cos(legA[i])).applyQuaternion(yawQ);
            hip.copy(head.position).addScaledVector(d0, hipR).add(v3(0, -6 * sc, 0));
            dir.subVectors(ft.at, hip); let d = dir.length(); dir.divideScalar(d || 1);
            d = Math.min(d, L1 + L2 - 0.01);
            const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
            bend.copy(d0).addScaledVector(up, 1.4); bend.addScaledVector(dir, -bend.dot(dir)).normalize();
            knee.copy(hip).addScaledVector(dir, a).addScaledVector(bend, h);
            seg(L.thigh, hip, knee); seg(L.shin, knee, ft.at);
            L.knee.position.copy(knee); L.foot.position.copy(ft.at);
          });
          // 촉수 흔들기
          P.tentacles.forEach((sg, k) => sg.forEach((g, i) => { g.rotation.x = 0.25 * Math.sin(t * 1.7 + k + i * 0.6); g.rotation.z = 0.25 * Math.cos(t * 1.3 + k * 2 + i * 0.5); }));
          P.glowRing.material.opacity = 0.6 + 0.3 * Math.sin(t * 5);
          // 열선: 팔 끝에서 앞쪽 지면을 좌우로 쓸며 닿는 곳을 녹임
          const firing = t > 3.5 && t < dur;
          ray.visible = firing;
          if (firing) {
            const sweep = Math.sin(t * 0.8) * 0.9;
            const aimDir = walk.clone().applyAxisAngle(up, sweep);
            const tgt = pos.clone().addScaledVector(aimDir, (120 + 60 * Math.sin(t * 0.5)) * sc); tgt.y = grid.sample(tgt.x, tgt.z);
            const from = P.tip.getWorldPosition(v3());
            P.arm.rotation.y = sweep * 0.8;
            ray.position.copy(from).lerp(tgt, 0.5); ray.scale.set(1.6 * sc, from.distanceTo(tgt), 1.6 * sc);
            ray.quaternion.setFromUnitVectors(up, tgt.clone().sub(from).normalize());
            const h2 = D.raycast(from, tgt.clone().sub(from).normalize(), from.distanceTo(tgt) + 5);
            const q = h2 ? h2.point : tgt;
            D.laser(q.x, q.z, 5 * S.r ** 0.6, dt * 1.4); D.burn(q.x, q.z, 12, dt);
            if ((this.acc += dt) > 0.05) { this.acc = 0; fx.sparks(q, { x: 0, y: 1, z: 0 }, 4); fx.fire.emit(q.x, q.y + 1, q.z, 0, 10, 0, 0.6, 5, 10, [1, 0.6, 0.2, 1], [0.8, 0.1, 0.02, 0], 1, 4); world.paintScorch(q.x, q.z, 8, 0.6); }
          }
          return t < dur + 1;
        },
        dispose() { disposeObj(scene, head); for (const L of P.legs) for (const m of [L.thigh, L.shin, L.knee, L.foot]) disposeObj(scene, m); disposeObj(scene, ray); },
      });
      const g = cineGame(A); if (!g) return;
      const low = c.clone().addScaledVector(f, -320).addScaledVector(side, 80); low.y = c.y + 6;
      g.cine.play([
        watch(low, () => head.position.clone().add(v3(0, -H * 0.3, 0)), { dur: 4, fov: 50, caption: '땅속에서 무언가 솟아오른다', smooth: 0.25 }),
        orbit(() => pos, { dist: 230 * sc, h: 60 * sc, a0: Math.atan2(-f.z, -f.x) - 0.6, a1: Math.atan2(-f.z, -f.x) + 0.3, dur: 6, look: H * 0.6, fov: 56 }),
        watch(() => pos.clone().addScaledVector(walk, 230 * sc).addScaledVector(side, 130 * sc).add(v3(0, 25, 0)), () => head.position.clone().add(v3(0, -H * 0.3, 0)), { dur: 5, fov: 58, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 지각 대이동: 땅이 통째로 갈라져 미끄러지고, 지평선에서 해일이 밀려옴 ----
  crustshift: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, audio, camera, world } = A.ctx;
      const half = grid.span / 2;
      const f = camDir(camera, v3(p.x, p.y, p.z)), dir = v3(-f.z, 0, f.x);
      audio.rumble(10);
      // 지도를 가로지르는 거대한 균열 + 한쪽 땅이 기울며 미끄러짐
      const W = 22 * S.r ** 0.5, depth = 40 * S.r ** 0.5;
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          const n = Math.ceil(half * 2.4 / 20);
          const want = Math.min(n, Math.floor(this.t / 4 * n));
          while (this.k < want) {
            const s = (this.k / n - 0.5) * half * 2.4; this.k++;
            const x = p.x + dir.x * s, z = p.z + dir.z * s;
            if (Math.abs(x) > half * 0.98 || Math.abs(z) > half * 0.98) continue;
            A.crater(x, z, W, depth); world.paintScorch(x, z, W * 1.5, 0.7);
            for (let i = 0; i < 3; i++) fx.fire.emit(x + (R() - 0.5) * W, grid.sample(x, z) + 1, z + (R() - 0.5) * W, 0, 6, 0, 2, W * 0.5, W * 0.2, [1, 0.5, 0.12, 1], [0.6, 0.1, 0.02, 0], 0.4, 1);
          }
          // 균열 한쪽 건물들은 균열 쪽으로 기울어 무너짐
          if (this.t > 1 && !this.tilted) {
            this.tilted = true;
            for (const b of D.buildings) {
              if (b.state !== 'intact') continue;
              const side = (b.cx - p.x) * f.x + (b.cz - p.z) * f.z;
              const dist = Math.abs(side);
              if (dist < 320 * S.r ** 0.5 && R() < 0.85) D.flatten(b, Math.max(0.3, 1 - dist / (320 * S.r ** 0.5)), -Math.sign(side) * f.x, -Math.sign(side) * f.z, 2 + R() * 2);
            }
          }
          D.quake(p.x, p.z, half * 1.2, 1.4, dt);
          fx.addShake(dt * 2);
          if (this.t > 5 && !this.wave) { this.wave = true; if (S.P >= 5) fireOther(A, 'tsunami', p, 2); }
          return this.t < 9;
        },
      });
      const g = cineGame(A); if (!g) return;
      const c = v3(p.x, p.y, p.z);
      g.cine.play([orbit(c, { dist: half * 1.1, h: half * 0.5, a0: Math.atan2(-f.z, -f.x) - 0.2, a1: Math.atan2(-f.z, -f.x) + 0.5, dur: 9, look: 0, caption: '지각 대이동', fov: 55 })]);
    },
  },

  // ---- 순간 결빙: 하늘에서 극저온 소용돌이가 내려와 닿는 순간 모든 게 얼어붙고 산산조각 ----
  flashfreeze: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, grid, audio, camera, world, game } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const r = 150 * S.r ** 0.8;
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 0.6, 1, 48, 20, true), funnelMat([0.85, 0.92, 1.0], 0.85, 2.2));
      funnel.renderOrder = 11; scene.add(funnel);
      const list = D.buildingsNear(c.x, c.z, r).filter(b => b.state === 'intact');
      audio.wind(8); audio.freeze(3);
      if (game) game.frost = 1;
      A.addActive({
        t: 0, froze: false,
        update(dt) {
          this.t += dt;
          const t = this.t;
          const top = c.y + 1500, bottom = c.y + Math.max(0, 1500 * (1 - t / 2.5));
          funnel.position.set(c.x, (top + bottom) / 2, c.z); funnel.scale.y = Math.max(1, top - bottom);
          funnel.material.uniforms.uTime.value = t; funnel.material.uniforms.uFade.value = Math.min(1, t) * Math.min(1, (9 - t) / 2);
          if (t > 2.5 && !this.froze) {
            this.froze = true;
            fx.flash = Math.max(fx.flash, 0.4); audio.freeze(2);
            for (const b of list) D.tint(b, ICE, 0.85);
            for (const ch of D.loose) if (ch.state === 2) D._darkenChunk(ch, 0);
            world.paintFrost(c.x, c.z, r * 1.3, 0.95);
            for (let i = 0; i < 120; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.smoke.emit(x, grid.sample(x, z) + R() * 40, z, (R() - 0.5) * 8, 2, (R() - 0.5) * 8, 4, 10, 40, [0.95, 0.98, 1, 0.6], [0.9, 0.95, 1, 0], 0.5, 0.2); }
          }
          // 얼어붙은 뒤 돌풍에 산산조각
          if (t > 4.2 && !this.shattered) {
            this.shattered = true; audio.crack();
            for (const b of list) { if (b.state !== 'intact') continue; if (R() < 0.35) D.blastFrom(b, c, 20 * S.v, { lift: 0.05, scorch: 0, lod: 1 }); else D.flatten(b, 0.7 + R() * 0.3, (b.cx - c.x) / 100, (b.cz - c.z) / 100, 1.2 + R()); }
          }
          return t < 9;
        },
        dispose() { disposeObj(scene, funnel); if (game) game.frost = 0; },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -r * 2.4).add(v3(0, 40, 0)), () => c.clone().add(v3(0, 300 * Math.max(0, 1 - (g.cine.t || 0) / 2.5), 0)), { dur: 4, fov: 55, caption: '순간 결빙', smooth: 0.3 }),
        orbit(c, { dist: r * 1.6, h: r * 0.5, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.6, dur: 4, look: 20, ts: 0.6 }),
      ]);
    },
  },

  // ---- 메가 해일: 먼바다에 떨어진 소행성이 수백 m 물벽을 만들어 고층 빌딩을 넘어옴 ----
  megatsunami: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, grid, audio, camera, world } = A.ctx;
      const f = camDir(camera, v3(p.x, p.y, p.z));
      const far = v3(p.x, 0, p.z).addScaledVector(f, 7000); far.y = (world.outerHeight ? world.outerHeight(far.x, far.z) : 0);
      // 수평선의 물기둥과 섬광
      fx.flash = Math.max(fx.flash, 0.3);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          if (this.t < 3) for (let i = 0; i < 6; i++) fx.smoke.emit(far.x + (R() - 0.5) * 300, far.y + R() * 800 * this.t, far.z + (R() - 0.5) * 300, (R() - 0.5) * 40, 200, (R() - 0.5) * 40, 10, 150, 500, [0.9, 0.93, 0.96, 0.8], [0.85, 0.9, 0.95, 0], 0.1, 0);
          if (this.t > 3.5) { fireOther(A, 'tsunami', p, 4); return false; }
          return true;
        },
      });
      A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t > 2.2) { audio.boom(3, 7000); audio.rumble(8); return false; } return true; } });
      const g = cineGame(A); if (!g) return;
      const c = v3(p.x, p.y, p.z);
      g.cine.play([watch(c.clone().addScaledVector(f, -300).add(v3(0, 50, 0)), far.clone().add(v3(0, 600, 0)), { dur: 3.5, fov: 38, caption: '수평선 너머 충돌', smooth: 0.3 })]);
    },
  },

  // ---- 도시 접기: 지면이 종이처럼 접혀 올라가 반대편 도시 위로 덮쳐 짓누름 ----
  cityfold: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, grid, audio, camera } = A.ctx;
      const f = camDir(camera, v3(p.x, p.y, p.z)), axis = v3(-f.z, 0, f.x);
      const span = Math.min(grid.span * 0.45, 260 * S.r ** 0.6);
      const gy = grid.sample(p.x, p.z);
      // 접히는 쪽(카메라 반대편) 건물들
      const flip = D.buildings.filter(b => { if (b.state !== 'intact') return false; const s = (b.cx - p.x) * f.x + (b.cz - p.z) * f.z, l = (b.cx - p.x) * axis.x + (b.cz - p.z) * axis.z; return s > 5 && s < span && Math.abs(l) < span; });
      const under = D.buildings.filter(b => { if (b.state !== 'intact') return false; const s = (b.cx - p.x) * f.x + (b.cz - p.z) * f.z, l = (b.cx - p.x) * axis.x + (b.cz - p.z) * axis.z; return s < -5 && s > -span && Math.abs(l) < span; });
      for (const b of flip) { b.state = 'collapsing'; if (b.bodyId) { D.phys.remove(b.bodyId); b.bodyId = 0; } }
      // 접히는 땅 판 (지면 색)
      const slab = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 4, span), new THREE.MeshStandardMaterial({ color: 0x5c6458, roughness: 1 }));
      const under2 = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 1, span), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }));
      const pivot = new THREE.Group(); pivot.position.set(p.x, gy, p.z); scene.add(pivot);
      const holder = new THREE.Group(); pivot.add(holder);
      holder.quaternion.setFromUnitVectors(v3(0, 0, 1), f);
      slab.position.set(0, -2, span / 2); under2.position.set(0, -4.5, span / 2); holder.add(slab, under2);
      const m = new THREE.Matrix4(), M2 = new THREE.Matrix4(), q = new THREE.Quaternion();
      audio.rumble(6); audio.whoosh(3);
      const T = 4;
      A.addActive({
        t: 0, done: false,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T), e = ease.inOut(u);
          const ang = -Math.PI * 0.98 * e;
          q.setFromAxisAngle(axis, ang);
          pivot.quaternion.copy(q);
          // 접히는 건물: 접는 선을 축으로 회전
          for (const b of flip) {
            m.makeTranslation(p.x, gy, p.z); m.multiply(M2.makeRotationFromQuaternion(q)); m.multiply(M2.makeTranslation(-p.x, -gy, -p.z));
            D.intact.setMatrixAt(b.inst, m);
          }
          if (u >= 1 && !this.done) {
            this.done = true;
            fx.addShake(3); audio.boom(3, camera.position.distanceTo(v3(p.x, gy, p.z))); audio.crumble(100);
            for (const b of under) { D.flatten(b, 1, 0, 0, 0.4); }
            for (const b of flip) { D.intact.setVisibleAt(b.inst, false); b.state = 'gone'; D._scoreBuilding(b, 1); }
            D.explode({ x: p.x - f.x * span * 0.5, y: gy + 5, z: p.z - f.z * span * 0.5, r: span, power: 30 * S.v, lift: -1, lod: 1 });
            for (let i = 0; i < 80; i++) { const s = -R() * span, l = (R() - 0.5) * span * 2; fx.dust({ x: p.x + f.x * s + axis.x * l, y: gy + 5, z: p.z + f.z * s + axis.z * l }, 14); }
          }
          return this.t < T + 3;
        },
        dispose() { disposeObj(scene, pivot); },
      });
      const g = cineGame(A); if (!g) return;
      const c = v3(p.x, gy, p.z);
      g.cine.play([watch(c.clone().addScaledVector(axis, span * 2.2).addScaledVector(f, -span * 0.3).add(v3(0, span * 0.5, 0)), c.clone().add(v3(0, span * 0.3, 0)), { dur: T + 2.5, fov: 55, caption: '도시 접기', smooth: 0.3, ts: (u) => (u > 0.75 ? 0.6 : 1) })]);
    },
  },

  // ---- 거대 로봇 대 괴수: 도시 한복판에서 맞붙어 주먹을 주고받다 로봇이 괴수를 던짐 ----
  robokaiju: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, audio, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sc = 0.9 * S.r ** 0.3;
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const bot = A.spawn(makeMech(), sc), mon = A.spawn(makeGolem(), sc * 0.75);
      const B = bot.userData, M = mon.userData;
      const gap0 = 420 * sc;
      const pb = c.clone().addScaledVector(side, -gap0 / 2), pm = c.clone().addScaledVector(side, gap0 / 2);
      const stomp = (q, r) => { q.y = grid.sample(q.x, q.z); D.explode({ x: q.x, y: q.y + 4, z: q.z, r, power: 30 * S.v, lift: -0.4, lod: 1, lodBudget: 1 }); fx.dust(q, 10); fx.addShake(0.6); };
      const st = { t: 0, steps: 0, punches: 0 };
      audio.roar(3); audio.horn(1.5);
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          const face = (o, from, to) => o.quaternion.setFromUnitVectors(v3(0, 0, 1), to.clone().sub(from).setY(0).normalize());
          // 1) 서로를 향해 걸어감 (0~6s)
          if (t < 6) {
            const k = t / 6, gap = gap0 * (1 - 0.72 * k);
            pb.copy(c).addScaledVector(side, -gap / 2); pm.copy(c).addScaledVector(side, gap / 2);
            bot.position.copy(pb).setY(grid.sample(pb.x, pb.z)); mon.position.copy(pm).setY(grid.sample(pm.x, pm.z));
            face(bot, pb, pm); face(mon, pm, pb);
            const sw = Math.sin(t * 3);
            B.legs[0].hip.rotation.x = 0.4 * sw; B.legs[1].hip.rotation.x = -0.4 * sw;
            M.legs[0].hip.rotation.x = 0.4 * sw; M.legs[1].hip.rotation.x = -0.4 * sw;
            if (Math.floor(t * 1.0) > st.steps) { st.steps++; stomp(pb.clone(), 26 * sc); stomp(pm.clone(), 26 * sc); audio.thud(); }
            return true;
          }
          // 2) 주먹 교환 (6~12s)
          if (t < 12) {
            const k = Math.floor((t - 6) / 1.5);
            const ph = ((t - 6) % 1.5) / 1.5;
            const attacker = k % 2 === 0 ? 'bot' : 'mon';
            const arm = attacker === 'bot' ? B.arms[k % 4 < 2 ? 0 : 1] : M.shoulders[k % 4 < 2 ? 0 : 1];
            const target = attacker === 'bot' ? mon : bot;
            arm.sh.rotation.x = -1.6 * Math.sin(ph * Math.PI);
            if (k >= st.punches && ph > 0.5) {
              st.punches = k + 1;
              const q = target.position.clone().add(v3(0, 90 * sc, 0));
              fx.explosion(q, 14 * sc, { smokeColumn: false }); fx.addShake(1.5); audio.boom(2.2, camera.position.distanceTo(q));
              // 맞은 쪽 뒤 건물들이 충격파에 부서짐
              const back = target.position.clone().addScaledVector(target === mon ? side : side.clone().negate(), 60 * sc);
              D.explode({ x: back.x, y: back.y + 20, z: back.z, r: 70 * sc, power: 35 * S.v, lift: 0.3, lod: 1 });
              target.position.addScaledVector(target === mon ? side : side.clone().negate(), 10 * sc);
            }
            return true;
          }
          // 3) 로봇이 괴수를 들어 던짐 (12~16s), 4) 가슴 빔으로 마무리
          const tt = t - 12;
          if (!st.throwFrom) { st.throwFrom = mon.position.clone(); st.throwTo = mon.position.clone().addScaledVector(side, 380 * sc); st.throwTo.y = grid.sample(st.throwTo.x, st.throwTo.z); audio.roar(2); }
          if (tt < 2.5) {
            const u = tt / 2.5;
            mon.position.copy(st.throwFrom).lerp(st.throwTo, u); mon.position.y += Math.sin(u * Math.PI) * 220 * sc;
            mon.rotation.x += dt * 2;
            B.arms[0].sh.rotation.x = B.arms[1].sh.rotation.x = -2.6 * Math.sin(Math.min(1, u * 2) * Math.PI * 0.5);
            return true;
          }
          if (!st.landed) {
            st.landed = true;
            A.blast(st.throwTo, 70 * sc, 50 * S.v, { vap: 6, crater: [40 * sc, 10 * sc] }); fx.addShake(3);
            D.explode({ x: st.throwTo.x, y: st.throwTo.y + 10, z: st.throwTo.z, r: 140 * sc, inner: 50 * sc, power: 26 * S.v, lift: 0.3, lod: 1 });
          }
          if (tt > 3.5 && !st.beam) {
            st.beam = true;
            const from = bot.position.clone().add(v3(0, 94 * sc, 0)), to = st.throwTo.clone().add(v3(0, 20 * sc, 0));
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(5 * sc, 5 * sc, 1, 12, 1, true), glowMat(0x7fe0ff, 0.9));
            beam.position.copy(from).lerp(to, 0.5); beam.scale.y = from.distanceTo(to); beam.quaternion.setFromUnitVectors(v3(0, 1, 0), to.clone().sub(from).normalize());
            A.ctx.scene.add(beam);
            A.addActive({ t: 0, update(d) { this.t += d; beam.material.opacity = 0.9 * (1 - this.t / 1.5); return this.t < 1.5; }, dispose() { disposeObj(A.ctx.scene, beam); } });
            A.ctx.scene.remove(mon);
            detonate(A, to, { kt: 2 * S.P, light: true, pullback: false });
          }
          return tt < 9;
        },
        dispose() { A.remove(bot); A.remove(mon); },
      });
      const g = cineGame(A); if (!g) return;
      const wide = c.clone().addScaledVector(f, -600 * sc); wide.y = c.y + 60 * sc;
      g.cine.play([
        watch(wide, c.clone().add(v3(0, 70 * sc, 0)), { dur: 6, fov: 50, caption: '거대 로봇 대 괴수', smooth: 0.3 }),
        orbit(c, { dist: 330 * sc, h: 80 * sc, a0: Math.atan2(-f.z, -f.x) - 0.4, a1: Math.atan2(-f.z, -f.x) + 0.4, dur: 6, look: 80 * sc, fov: 50 }),
        watch(() => c.clone().addScaledVector(f, -700 * sc).addScaledVector(side, 200 * sc).setY(c.y + 140 * sc), () => mon.parent ? mon.position.clone().add(v3(0, 60 * sc, 0)) : c, { dur: 4.5, fov: 52, smooth: 0.2, ts: (u) => (u > 0.5 && u < 0.7 ? 0.5 : 1) }),
        watch(() => bot.position.clone().addScaledVector(side, -120 * sc).addScaledVector(f, -150 * sc).add(v3(0, 120 * sc, 0)), () => (st.throwTo || c).clone().add(v3(0, 40, 0)), { dur: 5, fov: 55, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 절반 소멸: 손가락 튕기는 소리와 함께 건물·나무의 절반이 먼지가 되어 흩날림 ----
  halfvanish: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, world, game } = A.ctx;
      const radius = S.P >= 75 ? 1e9 : 300 * S.r;
      audio.crack(); fx.flash = Math.max(fx.flash, 0.25);
      if (A.ctx.hud) A.ctx.hud.toast('…', 'info');
      const pick = D.buildings.filter(b => b.state === 'intact' && Math.hypot(b.cx - p.x, b.cz - p.z) < radius && R() < 0.5);
      const loose = [...D.loose].filter(c => c.state !== 3 && R() < 0.5);
      let k = 0;
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          if (this.t < 1.5) return true;           // 정적 1.5초
          const want = Math.min(pick.length, Math.floor((this.t - 1.5) / 4 * pick.length));
          while (k < want) {
            const b = pick[k++];
            const n = Math.round(14 * A.ctx.quality.fxScale);
            for (let i = 0; i < n * 2; i++) fx.smoke.emit(b.cx + (R() - 0.5) * (b.maxx - b.minx), b.baseY + R() * b.height, b.cz + (R() - 0.5) * (b.maxz - b.minz), 4 + R() * 6, 1 + R() * 3, R() * 3, 7, 5, 12, [0.38, 0.3, 0.24, 0.9], [0.32, 0.26, 0.2, 0], 0.1, 0.5);
            D.scaleBuilding(b, 0.001, 2.5, null, () => D.vaporizeBuilding(b));
          }
          if (this.t > 2 && !this.loose) { this.loose = true; for (const c of loose) D.removeChunk(c); world.blastTrees(p.x, p.z, Math.min(radius, A.ctx.grid.span), 0); }
          return k < pick.length;
        },
      });
    },
  },

  // ---- 지구 핵 정지: 하늘에 오로라가 번지고 전자기 폭풍, 사방에 번개 ----
  corestop: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { grid } = A.ctx;
      fireOther(A, 'cme', p, 1.5);
      const n = Math.round(2 + S.n ** 0.6);
      over(A, n, 4, () => fireOther(A, 'lightning', mapPoint(A, 0.8, v3(p.x, 0, p.z), 0.5)), 1.5);
      if (A.ctx.hud) A.ctx.hud.toast('지구 자기장 붕괴', 'info');
    },
  },

  // ---- 소행성 시추: 다가오는 소행성 속 핵폭발 — 성공하면 둘로 갈라져 비껴가고, 실패하면 그대로 충돌 ----
  drillrock: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, grid, audio, camera, game, hud } = A.ctx;
      const shatterOpt = !!A.opts.drillShatter;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, tgt), side = v3(-f.z, 0, f.x);
      const dirIn = f.clone().multiplyScalar(0.5).add(v3(0, -0.6, 0)).normalize();
      const T = 12, D0 = 26000, Q0 = 2.5, Q1 = 8;
      const sz = 120 * S.r ** 0.5;
      const zone = Math.max(0.06, 0.24 - 0.09 * Math.log10(Math.max(1, S.P)));   // ×1 넓음 … ×100 아주 좁음
      const rock = A.spawn(makeAsteroid(), sz);
      const st = { t: 0, result: null, halves: [], frags: [], cur: 0.5, pos: v3() };
      A._drillResult = undefined;
      if (game) game.ensureView(D0 * 1.4, 8000);
      audio.rumble(T);
      // 기폭 타이밍 막대
      let ui = document.getElementById('qte');
      if (!ui) { ui = document.createElement('div'); ui.id = 'qte'; ui.innerHTML = '<b>핵 기폭 타이밍</b><div class="qbar"><i class="zone"></i><i class="cur"></i></div><small>초록 칸에서 Space 또는 클릭</small>'; document.body.appendChild(ui); }
      const zEl = ui.querySelector('.zone'), cEl = ui.querySelector('.cur');
      zEl.style.left = (50 - zone * 50) + '%'; zEl.style.width = (zone * 100) + '%';
      ui.hidden = true;
      const decide = (res) => {
        if (st.result) return;
        st.result = res; A._drillResult = res; A._qte = null; ui.hidden = true;
        const pos = rock.position.clone();
        fx.flash = Math.max(fx.flash, 0.6); audio.nuke();
        fx.explosion(pos, sz * 1.6, { smokeColumn: false });
        if (res === 'success') {
          A.remove(rock);
          for (const s2 of [-1, 1]) { const h = A.spawn(makeAsteroid(), sz * 0.7); h.position.copy(pos); st.halves.push({ m: h, v: dirIn.clone().multiplyScalar(D0 / T).addScaledVector(side, s2 * 1100).add(v3(0, 300, 0)) }); }
          if (hud) hud.toast('시추 성공 — 소행성이 둘로 갈라져 비껴갑니다', 'info');
        } else if (res === 'shatter') {
          A.remove(rock);
          const n = Math.round(14 + 8 * S.n ** 0.5), Rr = 380 * S.r ** 0.5;
          for (let i = 0; i < n; i++) {
            const a = R() * 6.28, d = Math.sqrt(R()) * Rr;
            const q = v3(tgt.x + Math.cos(a) * d, 0, tgt.z + Math.sin(a) * d); q.y = grid.sample(q.x, q.z);
            const m = A.spawn(makeAsteroid(), sz * (0.08 + R() * 0.12));
            const start = pos.clone().add(v3((R() - 0.5) * sz * 3, (R() - 0.5) * sz * 2, (R() - 0.5) * sz * 3));
            st.frags.push({ m, a: start, b: q, t: 0, dur: 3 + R() * 3, r: (24 + R() * 30) * S.r ** 0.6 });
          }
          if (hud) hud.toast('시추 성공… 하지만 산산조각 난 파편이 쏟아집니다', 'info');
        } else if (hud) hud.toast('시추 실패 — 충돌합니다', 'info');
      };
      A._qte = () => { if (st.t >= Q0 && !st.result) decide(Math.abs(st.cur - 0.5) < zone / 2 ? (shatterOpt ? 'shatter' : 'success') : 'fail'); };
      A.addActive({
        update(dt) {
          st.t += dt;
          const u = Math.min(1, st.t / T);
          if (!st.result || st.result === 'fail') {
            const pos = tgt.clone().addScaledVector(dirIn, -D0 * (1 - u));
            rock.position.copy(pos); rock.rotation.y += dt * 0.2; st.pos.copy(pos);
            for (let i = 0; i < 3; i++) fx.fire.emit(pos.x, pos.y, pos.z, -dirIn.x * 200, -dirIn.y * 200, -dirIn.z * 200, 1, sz * 0.8, sz * 1.6, [1, 0.8, 0.5, 0.8], [1, 0.3, 0.05, 0], 1, 0);
          }
          if (!st.result) {
            if (st.t >= Q0) {
              ui.hidden = false;
              st.cur = 0.5 + 0.5 * Math.sin((st.t - Q0) * 2.4);
              cEl.style.left = (st.cur * 100) + '%';
              zEl.classList.toggle('hit', Math.abs(st.cur - 0.5) < zone / 2);
            }
            if (st.t > Q1) decide('fail');
          }
          if (st.result === 'fail' && u >= 1) { A.remove(rock); detonate(A, tgt, { kt: nukeYield(S.P) * 6, kind: 'impact', pullback: false }); return false; }
          for (const h of st.halves) { h.m.position.addScaledVector(h.v, dt); h.m.rotation.x += dt * 0.5; st.pos.copy(st.halves[0].m.position).lerp(st.halves[1].m.position, 0.5); }
          for (const fr of st.frags) {
            if (!fr.m.parent) continue;
            fr.t += dt; const k = Math.min(1, fr.t / fr.dur);
            fr.m.position.lerpVectors(fr.a, fr.b, k * k); fr.m.rotation.x += dt;
            fx.trail(fr.m.position, 6, true);
            if (k >= 1) { A.remove(fr.m); if (R() < 0.45) A.blast(fr.b, fr.r, 45 * S.v, { crater: [fr.r * 0.4, fr.r * 0.15], silent: R() > 0.4 }); else fxBlast(A, fr.b, fr.r, { silent: R() > 0.3 }); A.crater(fr.b.x, fr.b.z, fr.r * 0.4, fr.r * 0.12); }
          }
          if (st.frags.length) st.pos.copy(tgt);
          if (st.result === 'success' && st.t > T * 1.6) return false;
          if (st.result === 'shatter' && st.frags.every(fr => !fr.m.parent) && st.t > 6) return false;
          return st.t < 40;
        },
        dispose() { A.remove(rock); for (const h of st.halves) A.remove(h.m); for (const fr of st.frags) A.remove(fr.m); ui.hidden = true; if (A._qte) A._qte = null; },
      });
      const g = cineGame(A); if (!g) return;
      const low = tgt.clone().addScaledVector(f, -500); low.y = tgt.y + 40;
      g.cine.play([
        watch(low, () => rock.position, { dur: Q1 + 0.4, fov: 40, caption: '소행성 시추 작전 — 정확한 순간에 기폭!', smooth: 0.3 }),
        watch(low.clone().add(v3(0, 60, 0)), () => st.pos, { dur: 7, fov: 58, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 상어 회오리: 상어가 섞인 토네이도가 도시를 휩쓸고, 상어가 건물에 떨어짐 ----
  sharknado: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid } = A.ctx;
      fireOther(A, 'tornado', p, 1);
      const n = Math.round(14 + 8 * S.n ** 0.5);
      const sharks = [];
      for (let i = 0; i < n; i++) sharks.push({ m: A.spawn(makeShark(), 3 + R() * 3), a: R() * 6.28, h: 30 + R() * 200, r: 20 + R() * 60, sp: 2 + R() * 2, drop: 3 + R() * 18, fall: null });
      let c = v3(p.x, 0, p.z);
      A.addActive({
        t: 0,
        update(dt, aim) {
          this.t += dt;
          if (aim) c.lerp(v3(aim.x, 0, aim.z), Math.min(1, dt * 0.35));
          let alive = 0;
          for (const s of sharks) {
            if (!s.m.parent) continue;
            alive++;
            if (!s.fall) {
              s.a += s.sp * dt;
              const gy = grid.sample(c.x, c.z);
              s.m.position.set(c.x + Math.cos(s.a) * s.r, gy + s.h, c.z + Math.sin(s.a) * s.r);
              s.m.rotation.set(0, -s.a, 0.6);
              if (this.t > s.drop) s.fall = { v: v3(-Math.sin(s.a) * 40, 10, Math.cos(s.a) * 40) };
            } else {
              s.fall.v.y -= 20 * dt; s.m.position.addScaledVector(s.fall.v, dt); s.m.rotation.x += dt * 4;
              const gy = grid.sample(s.m.position.x, s.m.position.z);
              const h = D.raycast(s.m.position, s.fall.v.clone().normalize(), s.fall.v.length() * dt + 2);
              if (h || s.m.position.y < gy) { A.blast(h ? h.point : s.m.position, 8 * S.r ** 0.6, 26 * S.v, { vap: 1, smokeColumn: false, silent: R() > 0.4 }); fx.dust(s.m.position, 5); A.remove(s.m); }
            }
          }
          return alive > 0 && this.t < 30;
        },
        dispose() { for (const s of sharks) A.remove(s.m); },
      });
    },
  },

  // ---- 지진 대협곡: 단층이 열리며 도시를 가로지르는 거대 협곡이 생김 ----
  megaquake: {
    fire(A, hit) {
      const S = A.S, p = hit.point;
      fireOther(A, 'rift', p, 3);
      fireOther(A, 'quake', p, 1.5);
    },
  },

  // ---- 거대 유인원: 가장 높은 빌딩을 기어올라 가슴을 치고 뛰어내려 박살 ----
  giantape: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, audio, camera } = A.ctx;
      const sc = 0.9 * S.r ** 0.3;
      const tall = D.buildingsNear(p.x, p.z, 300).filter(b => b.state === 'intact').sort((a, b) => b.height - a.height)[0];
      const f = camDir(camera, v3(p.x, p.y, p.z));
      const base = tall ? v3(tall.cx, tall.baseY, tall.cz) : v3(p.x, grid.sample(p.x, p.z), p.z);
      const top = tall ? tall.baseY + tall.height : base.y + 80;
      const ape = A.spawn(makeApe(), sc);
      const U = ape.userData;
      const from = base.clone().addScaledVector(f, 260 * sc); from.y = grid.sample(from.x, from.z);
      const climbSide = base.clone().addScaledVector(f, (tall ? Math.max(tall.maxx - tall.minx, tall.maxz - tall.minz) * 0.5 : 20) + 12 * sc);
      ape.quaternion.setFromUnitVectors(v3(0, 0, 1), f.clone().negate());
      const st = { t: 0, phase: 0 };
      audio.roar(3);
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          const sw = Math.sin(t * 4);
          if (t < 4) { // 걸어옴
            ape.position.copy(from).lerp(climbSide.clone().setY(base.y), t / 4); ape.position.y = grid.sample(ape.position.x, ape.position.z);
            U.legs[0].hip.rotation.x = 0.5 * sw; U.legs[1].hip.rotation.x = -0.5 * sw; U.arms[0].sh.rotation.x = -0.5 * sw; U.arms[1].sh.rotation.x = 0.5 * sw;
            if (Math.floor(t * 1.5) > (st.step || 0)) { st.step = Math.floor(t * 1.5); D.explode({ x: ape.position.x, y: ape.position.y + 3, z: ape.position.z, r: 22 * sc, power: 22, lift: -0.5, lod: 1, lodBudget: 1 }); fx.dust(ape.position, 8); audio.thud(); }
            return true;
          }
          if (t < 10) { // 기어오름
            const u = (t - 4) / 6;
            ape.position.copy(climbSide); ape.position.y = base.y + (top - base.y - 70 * sc) * ease.inOut(u);
            U.arms[0].sh.rotation.x = -2.6 + 0.6 * sw; U.arms[1].sh.rotation.x = -2.6 - 0.6 * sw; U.legs[0].hip.rotation.x = -0.6 * sw; U.legs[1].hip.rotation.x = 0.6 * sw;
            if (tall && R() < dt * 3) { const q = v3(climbSide.x, ape.position.y + 30 * sc, climbSide.z); D.explode({ x: q.x, y: q.y, z: q.z, r: 10 * sc, power: 12, lift: 0.2, lod: 1, lodBudget: 0 }); }
            return true;
          }
          if (t < 13) { // 꼭대기에서 가슴 치기
            if (!st.roared) { st.roared = true; audio.roar(3); }
            ape.position.y = top - 40 * sc;
            U.arms[0].sh.rotation.x = -1.4 + 0.8 * Math.sin(t * 14); U.arms[1].sh.rotation.x = -1.4 - 0.8 * Math.sin(t * 14);
            if (R() < dt * 6) fx.addShake(0.3);
            return true;
          }
          if (t < 15) { // 뛰어내림
            const u = (t - 13) / 2;
            const land = climbSide.clone().addScaledVector(f, 80 * sc); land.y = grid.sample(land.x, land.z);
            ape.position.copy(climbSide).setY(top - 40 * sc).lerp(land, u); ape.position.y += Math.sin(u * Math.PI) * 60 * sc - 0;
            if (u > 0.98 && !st.slam) {
              st.slam = true;
              A.blast(land, 60 * sc, 50 * S.v, { lift: -0.6, crater: [30 * sc, 6 * sc] }); fx.addShake(3);
              if (tall) D.blastFrom(tall, land, 50 * S.v, { lift: 0.2, lod: 0 });
            }
            return true;
          }
          ape.position.y -= dt * 20 * sc; // 땅속으로 사라짐 (떠남)
          return t < 19;
        },
        dispose() { A.remove(ape); },
      });
      const g = cineGame(A); if (!g) return;
      const side = v3(-f.z, 0, f.x);
      g.cine.play([
        watch(climbSide.clone().addScaledVector(f, 240 * sc).addScaledVector(side, 120 * sc).setY(base.y + 20), () => ape.position.clone().add(v3(0, 60 * sc, 0)), { dur: 10, fov: 50, caption: '거대 유인원', smooth: 0.3 }),
        watch(climbSide.clone().addScaledVector(f, 200 * sc).addScaledVector(side, -150 * sc).setY(top + 30), () => ape.position.clone().add(v3(0, 60 * sc, 0)), { dur: 6, fov: 50, smooth: 0.3 }),
      ]);
    },
  },
};

export const MOVIE_ENDINGS = {
  terraform: (A, c) => { crustCollapse(A, c, { level: 1 }); wipeMap(A, c, 'nuke', { dur: 16 }); worldEnd(A, c, 'ash', { delay: 4, finale: false }); },
  tripod: (A, c) => { over(A, 6, 6, () => fireOther(A, 'tripod', mapPoint(A))); wipeMap(A, c, 'nuke', { dur: 18 }); worldEnd(A, c, 'fire', { delay: 8 }); },
  crustshift: (A, c) => { crustCollapse(A, c, { level: 1, dur: 12 }); worldEnd(A, c, 'water', { delay: 6, planetKind: 'crack' }); },
  flashfreeze: (A, c) => { wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'ice', { delay: 3 }); },
  megatsunami: (A, c) => { flood(A, { dur: 14 }); worldEnd(A, c, 'water', { delay: 6 }); },
  cityfold: (A, c) => { wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'void', { delay: 5, planetKind: 'shatter' }); },
  robokaiju: (A, c) => { crustCollapse(A, c, { level: 1 }); worldEnd(A, c, 'fire', { delay: 14 }); },
  halfvanish: (A, c) => { worldEnd(A, c, 'dust', { delay: 7, planetKind: 'ash', wave: true }); },
  corestop: (A, c) => { wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'fire', { delay: 4, planetKind: 'crack' }); },
  drillrock: Object.assign((A, c) => { if (A._drillResult === 'shatter') { rain(A, 60, 8, { size: 9, r: 50, speed: 260, angle: 0.4, phys: 0.2 }); worldEnd(A, c, 'impact', { delay: 5 }); } else worldEnd(A, c, 'impact', { delay: 2 }); }, { when: (A) => (A._drillResult === undefined ? undefined : A._drillResult !== 'success') }),
  sharknado: (A, c) => { over(A, 4, 6, () => fireOther(A, 'sharknado', mapPoint(A))); wipeMap(A, c, 'nuke', { dur: 16 }); worldEnd(A, c, 'water', { delay: 6, planetKind: 'water' }); },
  megaquake: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 16 }); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'crack', { delay: 3 }); },
  giantape: (A, c) => { wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'dust', { delay: 15, planetKind: 'crack' }); },
};
