// 하늘 추가 무기: 소행성 충돌, 외계 모선, 태양 렌즈, 번개 폭풍
import * as THREE from 'three';
import { makeMeteor } from './models.js';
import { makeAsteroid, makeMothership, makeLens, glowMat } from './models2.js';
import { detonate, nukeYield, nukeRadii, aftermathShots } from './nukes.js';
import { boltMesh, Rain } from './storms.js';
import { cineGame, chase, watch, orbit, camDir } from './cam.js';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

function disposeObj(scene, o) { scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && !c.material.userData?.shared) c.material.dispose(); }); }

export const SKY2 = {
  // ---- 소행성 충돌: 대기권을 가르며 비스듬히 떨어져 거대한 충돌구 ----
  asteroid: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, fx, audio, grid, camera, game } = A.ctx;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const kt = nukeYield(S.P) * 3;
      const N = nukeRadii(kt);
      const f = camDir(camera, tgt);
      const side = v3(-f.z, 0, f.x).multiplyScalar(R() < 0.5 ? 1 : -1);
      const dirIn = side.clone().multiplyScalar(0.75).addScaledVector(f, 0.35).add(v3(0, -0.62, 0)).normalize();
      const SPD = 1300, T = 6.5;
      const start = tgt.clone().addScaledVector(dirIn, -SPD * T);
      const size = 18 * Math.sqrt(S.r);
      const rock = A.spawn(makeAsteroid(), size);
      rock.position.copy(start);
      if (game) game.ensureView(SPD * T * 1.6, 6000);
      audio.rumble(T + 2); audio.whoosh(T);
      const st = { t: 0, pos: start.clone(), hit: false };
      A.addActive({
        acc: 0,
        update(dt) {
          if (st.hit) return false;
          st.t += dt;
          const u = Math.min(1, st.t / T);
          st.pos.copy(start).addScaledVector(dirIn, SPD * T * u);
          rock.position.copy(st.pos);
          rock.rotation.x += dt * 0.6; rock.rotation.y += dt * 0.4;
          // 대기 마찰: 앞면 플라즈마 + 긴 연기 꼬리 (고도가 낮을수록 굵게)
          const alt = st.pos.y - tgt.y, heat = Math.min(1, 1.3 - alt / 6000);
          this.acc += dt;
          const back = dirIn.clone().multiplyScalar(-1);
          const stepLen = SPD * dt;
          while (this.acc > 0.004) {
            this.acc -= 0.004;
            // 이번 프레임 이동 구간 전체에 고르게 뿌려 끊김 없는 꼬리
            const q = st.pos.clone().addScaledVector(back, size * (0.4 + R()) + R() * stepLen);
            fx.fire.emit(q.x + (R() - 0.5) * size, q.y + (R() - 0.5) * size, q.z + (R() - 0.5) * size, back.x * 200, back.y * 200, back.z * 200, 0.5 + R() * 0.4, size * 1.2 * heat, size * 2.4, [1, 0.85, 0.6, 1], [1, 0.3, 0.05, 0], 2.5, 0);
            fx.smoke.emit(q.x, q.y, q.z, back.x * 30, back.y * 30, back.z * 30, 8 + R() * 6, size * 1.1, size * 3.5 * heat + 10, [0.55, 0.5, 0.46, 0.7 * heat], [0.5, 0.48, 0.46, 0], 0.2, 0, 0.05);
          }
          fx.light(st.pos.x, st.pos.y, st.pos.z, 4e4 * heat, 2500, 0.05, 0xffb070);
          if (u >= 1) {
            st.hit = true;
            A.remove(rock);
            detonate(A, tgt, { kt, kind: 'impact', pullback: false });
            // 분출물: 바위들이 사방으로 날아가 2차 충돌
            const nE = Math.round(Math.min(70, 14 + 10 * S.n));
            for (let i = 0; i < nE; i++) {
              const a = R() * 6.28, d = N.fire * 1.1 + R() * Math.min(N.r20, grid.span * 0.45);
              const q = v3(tgt.x + Math.cos(a) * d, 0, tgt.z + Math.sin(a) * d);
              q.y = grid.sample(q.x, q.z);
              const tt = 3 + R() * 4, gg = 30;
              const from = tgt.clone().add(v3(0, 30, 0));
              const vel = v3((q.x - from.x) / tt, (q.y - from.y + 0.5 * gg * tt * tt) / tt, (q.z - from.z) / tt);
              const sz = 2 + R() * 4 * Math.sqrt(S.r);
              A.addProjectile({ mesh: A.spawn(makeMeteor(), sz), pos: from, vel, g: gg, spin: true, trail: { size: sz * 0.8, fire: true, every: 0.03 }, ignoreHits: false,
                onHit: (qq) => A.blast(qq, sz * 4.5, 26 * S.v, { vap: sz * 0.6, crater: [sz * 1.6, sz * 0.6], silent: R() > 0.3, smokeColumn: false }) });
            }
          }
          return true;
        },
        dispose() { if (!st.hit) A.remove(rock); },
      });
      const g = cineGame(A); if (!g) return;
      const gcam = tgt.clone().addScaledVector(dirIn.clone().setY(0).normalize(), -700).addScaledVector(side, 0); gcam.y = grid.sample(gcam.x, gcam.z) + 12;
      const wide = tgt.clone().addScaledVector(side, -Math.max(1400, N.cloud * 2.2)).addScaledVector(f, -400); wide.y = tgt.y + 120;
      g.cine.play([
        watch(gcam, () => st.pos, { dur: 2.6, fov: 38, caption: '소행성 접근', smooth: 0.15 }),
        chase(() => st.pos, () => dirIn, { back: size * 9, up: size * 2.5, side: size * 2, ahead: 400, dur: 2.6, fov: 60 }),
        watch(wide, () => (st.hit ? tgt.clone().add(v3(0, 200, 0)) : st.pos), { dur: 1.6, fov: 44, ts: 0.4, smooth: 0.12 }),
        ...aftermathShots(A, tgt, N.cloud, side.clone().negate()),
      ], { onSkip: () => { st.t = Math.max(st.t, T - 0.05); } });
    },
  },

  // ---- 외계 모선: 도시 위를 덮고 아래로 빔을 쏴 충격파로 쓸어버림 ----
  mothership: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, camera, game, world } = A.ctx;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sc = 0.9 * S.r ** 0.3;
      const ship = A.spawn(makeMothership(), sc);
      const U = ship.userData;
      const alt = tgt.y + 520 * sc + 180;
      const startY = tgt.y + 3200;
      ship.position.set(tgt.x, startY, tgt.z);
      if (game) game.ensureView(20000, 4000);
      const Rw = Math.min(grid.span * 0.75, 300 * S.r);
      const beamR = 16 * S.r ** 0.6;
      const beam = new THREE.Group();
      const bOuter = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), glowMat(0x58c8ff, 0.55));
      const bCore = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 24, 1, true), glowMat(0xeefcff, 1));
      beam.add(bOuter, bCore); beam.visible = false; scene.add(beam);
      const T_ARR = 6, T_CH = 3.2, T_FIRE = 4.5, T_LEAVE = 6;
      audio.drone(T_ARR + 2); audio.hum(T_ARR + T_CH + T_FIRE);
      const list = D.buildingsNear(tgt.x, tgt.z, Rw).map(b => [Math.hypot(b.cx - tgt.x, b.cz - tgt.z), b]).filter(x => x[0] < Rw).sort((a, b) => a[0] - b[0]);
      let k = 0, fracLeft = Math.round((A.ctx.quality.shockFracture || 18) * 2.5);
      const st = { t: 0, fired: false, wave: 0, prev: 0 };
      A.addActive({
        acc: 0,
        update(dt) {
          st.t += dt;
          const t = st.t;
          ship.rotation.y += dt * 0.05;
          for (let i = 0; i < U.lights.length; i++) U.lights[i].visible = ((t * 3 + i) | 0) % 4 !== 0;
          if (game) game.storm = Math.max(game.storm || 0, Math.min(0.35, t / 4) * (t < T_ARR + T_CH + T_FIRE + 2 ? 1 : 0));
          if (t < T_ARR) {
            ship.position.y = alt + (startY - alt) * (1 - ease.out(t / T_ARR));
          } else if (t < T_ARR + T_CH) {
            // 충전: 바닥 발광부가 밝아지고 땅의 먼지가 빨려 올라감
            const c = (t - T_ARR) / T_CH;
            U.coreMat.opacity = c;
            this.acc += dt;
            while (this.acc > 0.01) {
              this.acc -= 0.01;
              const a = R() * 6.28, d = 30 + R() * 160 * sc;
              const x = tgt.x + Math.cos(a) * d, z = tgt.z + Math.sin(a) * d;
              fx.fire.emit(x, grid.sample(x, z) + 2, z, -Math.cos(a) * 15, 60 + R() * 60, -Math.sin(a) * 15, 2.5, 1.2, 0.3, [0.5, 0.85, 1, 1], [0.2, 0.5, 1, 0], 0, 0);
            }
            if (!st.ch) { st.ch = true; audio.charge(T_CH); }
          } else if (t < T_ARR + T_CH + T_FIRE) {
            const u = (t - T_ARR - T_CH) / T_FIRE;
            if (!st.fired) {
              st.fired = true; beam.visible = true;
              fx.flash = Math.max(fx.flash, 0.5); fx.addShake(2.5); audio.nuke();
              D.explode({ x: tgt.x, y: tgt.y + 10, z: tgt.z, r: beamR * 2.2, power: 60 * S.v, vaporize: beamR * 1.6, lift: 0.6, scorch: 1, lod: 1 });
              A.crater(tgt.x, tgt.z, beamR * 1.6, beamR * 0.6);
              fx.ring(tgt, Rw * 1.1, T_FIRE * 0.9, 0x7fd8ff, 0.7);
            }
            const top = ship.position.y - 17 * sc;
            const w = beamR * (1 + 0.12 * Math.sin(t * 50)) * (u > 0.8 ? (1 - u) * 5 : 1);
            beam.position.set(tgt.x, (top + tgt.y) / 2, tgt.z);
            bOuter.scale.set(w, top - tgt.y, w); bCore.scale.set(w, top - tgt.y, w);
            fx.light(tgt.x, tgt.y + 30, tgt.z, 6e4, Rw * 1.5, 0.05, 0x8fdcff);
            // 충격 고리: 바깥으로 퍼지며 휩쓸기
            const cur = Rw * Math.min(1, ease.out(Math.min(1, u * 1.6)));
            while (k < list.length && list[k][0] <= cur) {
              const [d, b] = list[k++];
              const dx = (b.cx - tgt.x) / (d || 1), dz = (b.cz - tgt.z) / (d || 1);
              if (d < beamR * 2) D.vaporizeBuilding(b);
              else if (d < Rw * 0.45 && fracLeft > 0 && b.state === 'intact') { fracLeft--; D.blastFrom(b, tgt, 48 * S.v * (1 - d / Rw) + 12, { lift: 0.35, scorch: 0.8, lod: 1 }); }
              else D.flatten(b, Math.max(0.35, 1 - d / Rw), dx, dz, 1.4);
            }
            if (cur > st.prev) {
              D.ringPush(tgt, st.prev, cur, 30 * S.v, 0.4);
              const n = Math.round(14 * A.ctx.quality.fxScale);
              for (let i = 0; i < n; i++) {
                const a = R() * 6.28, x = tgt.x + Math.cos(a) * cur, z = tgt.z + Math.sin(a) * cur;
                const y = grid.sample(x, z);
                fx.fire.emit(x, y + 4 + R() * 20, z, Math.cos(a) * 30, 10 + R() * 20, Math.sin(a) * 30, 1 + R(), 10, 30, [0.7, 0.9, 1, 1], [1, 0.4, 0.1, 0], 1.2, 2);
                fx.smoke.emit(x, y + 4, z, Math.cos(a) * 20, 6, Math.sin(a) * 20, 5, 12, 40, [0.4, 0.4, 0.45, 0.6], [0.4, 0.4, 0.4, 0], 0.8, 0.5);
              }
              world.paintScorch(tgt.x, tgt.z, cur, 0.08);
              st.prev = cur;
            }
          } else {
            beam.visible = false;
            U.coreMat.opacity = Math.max(0, U.coreMat.opacity - dt);
            const u = (t - T_ARR - T_CH - T_FIRE) / T_LEAVE;
            ship.position.y = alt + (startY + 2000 - alt) * ease.in(Math.min(1, u));
            if (game && u > 0.3) game.storm = Math.max(0, 0.35 * (1 - (u - 0.3) * 2));
          }
          return t < T_ARR + T_CH + T_FIRE + T_LEAVE;
        },
        dispose() { A.remove(ship); disposeObj(scene, beam); if (game) game.storm = 0; },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, tgt), side = v3(-f.z, 0, f.x);
      const low = tgt.clone().addScaledVector(f, -Rw * 0.9).addScaledVector(side, 80); low.y = grid.sample(low.x, low.z) + 6;
      const wide = tgt.clone().addScaledVector(f, -Rw * 2.4).addScaledVector(side, Rw * 0.8); wide.y = tgt.y + 140;
      g.cine.play([
        watch(low, () => ship.position, { dur: T_ARR, fov: (u) => 58 - u * 8, caption: '정체불명의 비행체', smooth: 0.2 }),
        watch(() => low.clone().lerp(tgt, 0.55).setY(tgt.y + 25), () => ship.position.clone().add(v3(0, -20, 0)), { dur: T_CH, fov: 62, caption: '에너지 충전', smooth: 0.3 }),
        watch(wide, () => tgt.clone().add(v3(0, 60, 0)), { dur: T_FIRE + 1, fov: 52, ts: (u) => (u < 0.25 ? 0.35 : 0.35 + (u - 0.25) * 0.86) }),
      ], { onSkip: () => { st.t = Math.max(st.t, T_ARR + T_CH - 0.01); } });
    },
  },

  // ---- 태양 렌즈: 하늘의 거대 렌즈가 햇빛을 모아 태움 (누르고 끌기) ----
  solar: {
    holdStart(A, hit) {
      const { scene, audio } = A.ctx;
      const lens = A.spawn(makeLens(), 1);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 40, 1, true), glowMat(0xfff0b0, 0.22));
      const spot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), glowMat(0xffffff, 0.95));
      spot.rotation.x = -Math.PI / 2; spot.renderOrder = 15;
      scene.add(cone, spot);
      audio.laserStart();
      return { lens, cone, spot, t: 0, acc: 0, aim: hit ? hit.point : null };
    },
    holdUpdate(A, L, dt, aim) {
      if (!aim) return;
      const S = A.S, { D, fx, world, game, audio } = A.ctx;
      L.t += dt; L.acc += dt;
      const sun = game && game.sunDir && game.sunDir.y > 0.1 ? game.sunDir.clone() : v3(0.35, 1, 0.25).normalize();
      const r = 6 * S.r;
      const k = Math.min(1, L.t / 0.8);
      const lp = v3(aim.x, aim.y, aim.z).addScaledVector(sun, 650);
      L.lens.position.copy(lp);
      L.lens.quaternion.setFromUnitVectors(v3(0, 1, 0), sun);
      L.lens.scale.setScalar(0.6 + 0.4 * k);
      const len = lp.distanceTo(aim);
      L.cone.position.copy(lp).addScaledVector(sun, -len / 2);
      L.cone.quaternion.setFromUnitVectors(v3(0, 1, 0), sun);
      L.cone.scale.set(60 * k, len, 60 * k);
      L.cone.material.opacity = 0.16 + 0.06 * Math.sin(L.t * 9);
      L.spot.position.set(aim.x, aim.y + 0.6, aim.z);
      L.spot.scale.setScalar(r * (1.2 + 0.2 * Math.sin(L.t * 30)));
      if (k < 1) return;
      const n = D.laser(aim.x, aim.z, r, dt * 1.3);
      D.burn(aim.x, aim.z, r * 3.5, dt * 1.5);
      if (L.acc > 0.03) {
        L.acc = 0;
        fx.sparks({ x: aim.x, y: aim.y + 0.5, z: aim.z }, { x: 0, y: 1, z: 0 }, 6);
        fx.fire.emit(aim.x + (R() - 0.5) * r, aim.y + 1, aim.z + (R() - 0.5) * r, 0, 10 + R() * 10, 0, 0.8, r * 0.6, r * 1.6, [1, 0.95, 0.7, 1], [1, 0.4, 0.05, 0], 1, 6);
        fx.smoke.emit(aim.x, aim.y + 3, aim.z, (R() - 0.5) * 6, 8, (R() - 0.5) * 6, 6, r, r * 6, [0.18, 0.16, 0.15, 0.6], [0.35, 0.34, 0.33, 0], 0.4, 1.4);
        world.paintScorch(aim.x, aim.z, r * 2.6, 0.45);
        if (R() < 0.3) world.blastTrees(aim.x, aim.z, r * 4, r * 1.5);
        fx.light(aim.x, aim.y + 6, aim.z, 6000, 160, 0.1, 0xfff0c0);
        if (R() < 0.05) {
          const bs = D.buildingsNear(aim.x, aim.z, r * 4);
          const b = bs[Math.floor(R() * bs.length)];
          if (b) fx.column({ x: b.cx, y: b.baseY + b.height * 0.8, z: b.cz }, Math.max(3, Math.sqrt(b.area) * 0.2), 10);
        }
      }
      fx.addShake(dt * 0.3);
      if (n > 2) audio.crumble(n);
    },
    holdEnd(A, L) {
      const { scene, audio } = A.ctx;
      A.remove(L.lens); disposeObj(scene, L.cone); disposeObj(scene, L.spot);
      audio.laserStop();
    },
  },

  // ---- 번개 폭풍: 먹구름 아래로 번개가 쉴 새 없이 높은 건물을 때림 ----
  lightning: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, audio, grid, game, camera } = A.ctx;
      const Ra = 170 * S.r, dur = 14 * S.t;
      const cloudY = grid.sample(p.x, p.z) + 420;
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(Ra * 2.4, 64), new THREE.MeshBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      cloud.rotation.x = Math.PI / 2; cloud.position.set(p.x, cloudY, p.z); cloud.renderOrder = 10; scene.add(cloud);
      const rain = new Rain(scene);
      const bolts = [];
      audio.wind(dur); audio.rumble(dur * 0.6);
      const rate = 2.2 * S.n ** 0.35;
      const cands = () => D.buildingsNear(p.x, p.z, Ra).filter(b => b.state === 'intact' || b.state === 'fractured');
      A.addActive({
        t: 0, next: 1.2, acc: 0,
        update(dt) {
          this.t += dt;
          const t = this.t;
          const k = Math.min(1, t / 2) * Math.min(1, (dur - t) / 2.5);
          if (game) game.storm = Math.max(0, k * 0.95);
          cloud.material.opacity = 0.85 * k;
          rain.update(dt, camera, k);
          this.acc += dt;
          while (this.acc > 0.03) {
            this.acc -= 0.03;
            const a = R() * 6.28, d = Math.sqrt(R()) * Ra * 1.6;
            fx.smoke.emit(p.x + Math.cos(a) * d, cloudY - 20 - R() * 40, p.z + Math.sin(a) * d, (R() - 0.5) * 6, -1, (R() - 0.5) * 6, 6, 40, 90, [0.16, 0.17, 0.2, 0.75 * k], [0.14, 0.15, 0.17, 0], 0.1, 0, 0.2);
          }
          this.next -= dt;
          if (this.next <= 0 && t < dur - 1.5) {
            this.next = (0.25 + R() * 0.7) / rate;
            // 높은 건물일수록 잘 맞음
            const bs = cands();
            let to;
            if (bs.length && R() < 0.85) {
              let tot = 0; for (const b of bs) tot += b.height ** 1.5;
              let x = R() * tot, pick = bs[0];
              for (const b of bs) { x -= b.height ** 1.5; if (x <= 0) { pick = b; break; } }
              to = v3(pick.cx, pick.baseY + (pick.state === 'intact' ? pick.height : pick.height * 0.6), pick.cz);
            } else { const a = R() * 6.28, d = Math.sqrt(R()) * Ra; to = v3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d); to.y = grid.sample(to.x, to.z); }
            const big = R() < 0.12;
            const from = v3(to.x + (R() - 0.5) * 120, cloudY - 30, to.z + (R() - 0.5) * 120);
            const mesh = boltMesh(from, to);
            if (big) mesh.scale.set(1, 1, 1);
            scene.add(mesh); bolts.push({ mesh, t: 0 });
            fx.light(to.x, to.y + 20, to.z, big ? 9e4 : 3e4, big ? 1400 : 700, 0.18, 0xcfe0ff);
            fx.flash = Math.max(fx.flash, (big ? 0.25 : 0.1) * (A.opts.strobe === false ? 0.3 : 1));
            const r = (big ? 16 : 7) * S.r;
            D.explode({ x: to.x, y: to.y, z: to.z, r, power: (big ? 38 : 24) * S.v, vaporize: r * 0.25, lift: 0.7, scorch: 0.8, lod: 1 });
            fx.sparks(to, { x: 0, y: 1, z: 0 }, 14);
            if (R() < 0.5) fx.column({ x: to.x, y: to.y, z: to.z }, Math.max(2, r * 0.35), 8 + R() * 6);
            fx.addShake(big ? 1.2 : 0.35);
            const dd = camera.position.distanceTo(to);
            audio.crack();
            A.addActive({ t: 0, update(x) { this.t += x; if (A.opts.soundDelay === false || this.t > dd / 343) { audio.thunder(); return false; } return true; } });
          }
          for (let i = bolts.length - 1; i >= 0; i--) {
            const b = bolts[i]; b.t += dt;
            b.mesh.visible = A.opts.strobe === false ? b.t < 0.22 : b.t < 0.08 || (b.t > 0.12 && b.t < 0.22);
            if (b.t > 0.3) { disposeObj(scene, b.mesh); bolts.splice(i, 1); }
          }
          return t < dur;
        },
        dispose() { for (const b of bolts) disposeObj(scene, b.mesh); disposeObj(scene, cloud); rain.dispose(); if (game) game.storm = 0; },
      });
    },
  },
};
