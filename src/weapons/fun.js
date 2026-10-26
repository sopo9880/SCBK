// 놀이·괴수: 거대 볼링공, 도미노, 신의 손가락, 바위 거인, 폭주 기차
import * as THREE from 'three';
import { makeBowlingBall, makeFinger, makeGolem, makeTrain } from './models2.js';
import { cineGame, chase, watch, orbit, camDir } from './cam.js';
import { ease } from '../cinematic.js';
import { funScale } from './defs.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const FIXED = 0;

export const FUN = {
  // ---- 거대 볼링공: 카메라 쪽에서 굴러가 건물을 핀처럼 쓰러뜨림 ----
  bowling: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, grid, camera, audio, hud } = A.ctx;
      const G = funScale(A);
      const r = 13 * G.size;
      const f = camDir(camera, v3(p.x, p.y, p.z));
      const start = v3(p.x, 0, p.z).addScaledVector(f, -Math.min(420, grid.span * 0.4));
      start.y = grid.sample(start.x, start.z) + r + 1;
      const m = A.spawn(makeBowlingBall(), r);
      const sp = 52 * G.pw ** 0.6 * (G.giant ? 1 : 1.3);
      let hits = 0;
      const ball = D.addBall(start, f.clone().multiplyScalar(sp).add(v3(0, -2, 0)), r, m, { life: 30, onHit: () => { hits++; } });
      ball.body.setAngvel({ x: f.z * sp / r, y: 0, z: -f.x * sp / r });
      audio.rumble(6);
      // 충격만 모드이거나 큰 공: 굴러가는 자리마다 충격 (공 크기보다 넓게)
      A.addActive({ t: 0, acc: 0, update(dt) {
        this.t += dt; this.acc += dt;
        if (!ball.body.alive) return false;
        const bp = ball.body.translation(), bv = ball.body.linvel();
        if (this.acc > 0.12 && Math.hypot(bv.x, bv.z) > 6) {
          this.acc = 0;
          const rr = r * 1.15 + (G.giant ? 0 : 7 * G.hit);
          A.ctx.D.explode({ x: bp.x, y: bp.y, z: bp.z, r: rr, power: 22 * G.pw, lift: 0.35, scorch: 0.05, lod: 2, lodBudget: 2 });
          if (r > 30 || !G.giant) { A.crater(bp.x, bp.z, rr * 0.5, rr * 0.08); A.ctx.fx.dust({ x: bp.x, y: bp.y - r, z: bp.z }, Math.min(30, rr * 0.3)); }
        }
        return this.t < 12;
      } });
      A.addActive({ t: 0, update(dt) {
        this.t += dt;
        if (this.t > 9 || !ball.body.alive) { if (hud) hud.toast(hits >= 8 ? `스트라이크! 건물 ${hits}채` : `건물 ${hits}채 쓰러뜨림`, 'info'); return false; }
        return true;
      } });
      const g = cineGame(A); if (!g) return;
      const side = v3(-f.z, 0, f.x);
      g.cine.play([
        watch(() => start.clone().addScaledVector(f, -r * 6).add(v3(0, r * 1.2, 0)), () => start.clone().addScaledVector(f, 200), { dur: 1.2, fov: 55, caption: '거대 볼링공' }),
        chase(() => v3().copy(ball.body.translation()), () => f, { back: r * 5, up: r * 1.6, side: r * 0.8, ahead: 120, dur: 4.5, fov: 60, smooth: 0.15 }),
        watch(() => v3().copy(ball.body.translation()).addScaledVector(side, r * 9).add(v3(0, r * 3, 0)), () => v3().copy(ball.body.translation()), { dur: 3, fov: 52, ts: 0.5, smooth: 0.2 }),
      ]);
    },
  },

  // ---- 도미노: 첫 건물을 밀면 쓰러지며 다음 건물을 차례로 넘어뜨림 ----
  domino: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, camera, audio, fx, hud } = A.ctx;
      const dir = camDir(camera, v3(p.x, p.y, p.z));
      const first = (hit.info && hit.info.b) || D.buildingsNear(p.x, p.z, 40).filter(b => b.state === 'intact').sort((a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z))[0];
      if (!first) { if (hud) hud.toast('건물을 겨눠 주세요', 'info'); return; }
      const G = funScale(A);
      const maxN = Math.round((25 + 15 * S.n) * (G.giant ? 1 : 1.5));
      const topple = new Map(); // b → {dir, t, done}
      const queue = [{ b: first, d: dir.clone(), at: 0 }];
      let count = 0;
      const push = (b, d) => {
        // 건물 하나를 바닥 모서리 기준으로 통째로 넘어뜨림
        const axis = v3(d.z, 0, -d.x);
        const w = 0.35 + 0.25 * G.pw ** 0.5;
        let n = 0;
        for (const c of b.chunks) {
          if (c.state !== FIXED) continue;
          const h = c.y - b.baseY;
          const vx = d.x * w * h, vz = d.z * w * h, vy = -w * ((c.x - b.cx) * d.x + (c.z - b.cz) * d.z) * 0.3;
          if (D.launch(c, vx, vy, vz)) { c.body.setAngvel({ x: axis.x * w, y: 0, z: axis.z * w }); n++; }
        }
        audio.crumble(n);
      };
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          // 대기열: 조각나면 밀기
          for (let i = queue.length - 1; i >= 0; i--) {
            const q = queue[i];
            if (this.t < q.at) continue;
            if (q.b.state === 'intact' && !D._fractureSoon(q.b, 0)) continue;
            queue.splice(i, 1);
            if (q.b.state !== 'fractured') continue;
            push(q.b, q.d);
            topple.set(q.b, { d: q.d, t: 0 });
            count++;
          }
          // 쓰러지는 건물의 꼭대기가 닿는 곳에 다음 건물이 있으면 연쇄
          for (const [b, s] of topple) {
            s.t += dt;
            if (s.t > 6) { topple.delete(b); continue; }
            if (s.t < 0.6 || count + queue.length >= maxN) continue;
            const reach = b.height * Math.min(1, s.t / 2.2) + 6;
            const tip = v3(b.cx + s.d.x * reach, 0, b.cz + s.d.z * reach);
            for (const nb of D.buildingsNear(tip.x, tip.z, 10)) {
              if (nb === b || nb.state !== 'intact' || nb._dom) continue;
              nb._dom = true;
              const nd = v3(nb.cx - b.cx, 0, nb.cz - b.cz).normalize().lerp(s.d, 0.6).normalize();
              queue.push({ b: nb, d: nd, at: this.t + 0.05 });
              fx.dust({ x: tip.x, y: nb.baseY + nb.height * 0.6, z: tip.z }, 6);
            }
          }
          if (!topple.size && !queue.length) { if (hud) hud.toast(`도미노 ${count}채`, 'info'); return false; }
          return this.t < 40;
        },
        dispose() { for (const b of D.buildings) b._dom = false; },
      });
      first._dom = true;
      const g = cineGame(A); if (!g) return;
      const side = v3(-dir.z, 0, dir.x);
      const c0 = v3(first.cx, first.baseY, first.cz);
      g.cine.play([
        watch(() => c0.clone().addScaledVector(side, first.height * 1.6 + 60).addScaledVector(dir, first.height * 0.6).add(v3(0, first.height * 0.5, 0)), () => c0.clone().addScaledVector(dir, first.height * 0.8).add(v3(0, first.height * 0.3, 0)), { dur: 3.5, fov: 55, caption: '도미노', ts: 0.6 }),
        watch(() => c0.clone().addScaledVector(side, 220).addScaledVector(dir, 160).add(v3(0, 120, 0)), () => c0.clone().addScaledVector(dir, 200), { dur: 5, fov: 58 }),
      ]);
    },
  },

  // ---- 신의 손가락: 누르는 동안 손가락이 내려와 건물을 집어 들고, 놓으면 던짐 ----
  finger: {
    holdStart(A, hit) {
      const { audio } = A.ctx;
      const G = funScale(A);
      const m = A.spawn(makeFinger(), 0.6 * G.size);
      const p = hit ? hit.point : { x: 0, y: 0, z: 0 };
      m.position.set(p.x, p.y + 400, p.z);
      audio.whoosh(1);
      return { m, t: 0, grabbed: new Set(), pos: v3(p.x, p.y + 400, p.z), vel: v3(), prev: v3(p.x, p.y, p.z), touched: false, aim: v3(p.x, p.y, p.z) };
    },
    holdUpdate(A, L, dt, aim) {
      const S = A.S, { D, fx, grid, audio } = A.ctx;
      L.t += dt;
      if (aim) L.aim.set(aim.x, aim.y, aim.z);
      const G = funScale(A);
      const sc = 0.6 * G.size;
      // 손가락 끝 목표: 처음엔 내려와 짚고, 그다음엔 집은 것을 들어 올림
      const ground = grid.sample(L.aim.x, L.aim.z);
      const lift = L.touched ? Math.min(90, (L.t - L.touchT) * 60) : 0;
      const want = v3(L.aim.x, ground + 6 * sc + lift, L.aim.z);
      const prev = L.pos.clone();
      L.pos.lerp(want, Math.min(1, dt * (L.touched ? 5 : 3.5)));
      L.vel.lerp(v3().subVectors(L.pos, prev).divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 8));
      L.m.position.copy(L.pos);
      L.m.rotation.z = Math.max(-0.4, Math.min(0.4, -L.vel.x * 0.004)); L.m.rotation.x = Math.max(-0.4, Math.min(0.4, L.vel.z * 0.004));
      const tip = L.pos;
      const r = 26 * G.hit;
      if (!L.touched && tip.y - ground < 12 * sc) {
        L.touched = true; L.touchT = L.t;
        D.explode({ x: tip.x, y: ground + 2, z: tip.z, r: r * 0.7, power: 26 * G.pw, lift: -0.4, scorch: 0, lod: 0 });
        A.crater(tip.x, tip.z, r * 0.4, 3 * sc);
        fx.dust({ x: tip.x, y: ground, z: tip.z }, 12); fx.addShake(1.2); audio.thud();
      }
      if (!L.touched) return;
      // 집기: 주변 조각을 손끝으로 끌어당김 (스프링)
      if (L.grabbed.size < 600) for (const c of D.gather(tip.x, tip.z, r, 1)) { if (L.grabbed.size >= 600) break; if (D.launch(c, 0, 4, 0)) { L.grabbed.add(c); c.float = true; c.body.setGravityScale(0, true); } }
      for (const c of L.grabbed) {
        if (c.state !== 1) { L.grabbed.delete(c); continue; }
        const t = c.body.translation(), v = c.body.linvel();
        const m = c.mass;
        const dx = tip.x - t.x, dy = tip.y - 10 * sc - t.y, dz = tip.z - t.z;
        const k = 3.5, dmp = 1.6;
        c.body.applyImpulse({ x: (dx * k - (v.x - L.vel.x) * dmp) * m * dt, y: (dy * k - (v.y - L.vel.y) * dmp) * m * dt, z: (dz * k - (v.z - L.vel.z) * dmp) * m * dt }, true);
      }
    },
    holdEnd(A, L) {
      const { audio } = A.ctx;
      // 놓으면 손가락이 움직이던 방향으로 내던짐
      const throwV = L.vel.clone().multiplyScalar(2.2);
      if (throwV.length() < 25) throwV.add(v3(0, 18, 0));
      for (const c of L.grabbed) {
        if (c.state !== 1) continue;
        c.float = false; c.body.setGravityScale(1, true);
        c.body.setLinvel({ x: throwV.x + (R() - 0.5) * 8, y: throwV.y + R() * 6, z: throwV.z + (R() - 0.5) * 8 }, true);
      }
      if (L.grabbed.size) audio.whoosh(1.2);
      const m = L.m, from = m.position.clone();
      A.addActive({ t: 0, update(dt) { this.t += dt; m.position.copy(from).add(v3(0, 600 * ease.in(Math.min(1, this.t / 1.2)), 0)); return this.t < 1.2; }, dispose() { A.remove(m); } });
    },
  },

  // ---- 바위 거인: 지평선에서 걸어와 짓밟고 주먹으로 내려침 ----
  kaiju: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, audio, camera, world } = A.ctx;
      const G = funScale(A);
      const sc = 0.75 * G.size;
      const hm = G.giant ? sc : 0.75 * G.hit; // 짓밟는 범위 배율
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, tgt);
      const side = v3(-f.z, 0, f.x);
      const walkDir = side.clone().multiplyScalar(R() < 0.5 ? 1 : -1).addScaledVector(f, 0.3).normalize();
      const stride = 46 * sc;
      const nSteps = Math.max(6, Math.round(8 + 2 * S.n ** 0.5));
      const pathStart = tgt.clone().addScaledVector(walkDir, -stride * (nSteps * 0.55));
      const golem = A.spawn(makeGolem(), sc);
      const U = golem.userData;
      golem.quaternion.setFromUnitVectors(v3(0, 0, 1), walkDir);
      const st = { t: 0, step: 0, pos: pathStart.clone(), smashed: false, roared: false };
      const T_STEP = 1.25;
      audio.roar(3);
      const stomp = (q, big) => {
        const r = (big ? 30 : 22) * hm;
        D.explode({ x: q.x, y: q.y + 4, z: q.z, r, power: (big ? 42 : 30) * G.pw, lift: big ? 0.3 : -0.5, scorch: 0.15, lod: 0 });
        A.crater(q.x, q.z, r * 0.55, (big ? 5 : 2.5) * hm);
        world.blastTrees(q.x, q.z, r, r * 0.5);
        fx.dust(q, 14); fx.ring(q, r * 2.2, 1, 0xb09070, 0.3);
        fx.addShake(big ? 2.4 : 1.1); audio.boom(big ? 2.6 : 1.4, camera.position.distanceTo(q));
      };
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          const i = Math.floor(t / T_STEP), u = (t % T_STEP) / T_STEP;
          if (i < nSteps) {
            // 걷기: 몸은 일정하게 전진, 다리는 번갈아 들었다 내림
            st.pos.copy(pathStart).addScaledVector(walkDir, stride * (t / T_STEP));
            const gy = grid.sample(st.pos.x, st.pos.z);
            golem.position.set(st.pos.x, gy - 2 + Math.abs(Math.sin(u * Math.PI)) * 4 * sc, st.pos.z);
            const sw = Math.sin(u * Math.PI);
            const L0 = U.legs[i % 2], L1 = U.legs[(i + 1) % 2];
            L0.hip.rotation.x = -0.55 * sw + 0.3 * (u - 0.5); L0.knee.rotation.x = 0.8 * sw;
            L1.hip.rotation.x = 0.3 * (0.5 - u); L1.knee.rotation.x = 0.05;
            for (const s of U.shoulders) { s.sh.rotation.x = s.s * (i % 2 ? 1 : -1) * 0.35 * Math.sin(u * Math.PI * 2 - Math.PI / 2); s.el.rotation.x = -0.4; }
            U.torso.rotation.y = 0.12 * Math.sin(u * Math.PI * 2);
            if (st.step <= i && u > 0.8) {
              st.step = i + 1;
              const foot = st.pos.clone().addScaledVector(v3(-walkDir.z, 0, walkDir.x), L0.s * 20 * sc).addScaledVector(walkDir, stride * 0.2);
              foot.y = grid.sample(foot.x, foot.z);
              stomp(foot, false);
              // 손 닿는 높은 건물은 주먹으로 후려침
              for (const b of D.buildingsNear(st.pos.x, st.pos.z, 70 * sc)) {
                if (b.state !== 'intact' || b.height < 30 * sc || R() > 0.5) continue;
                D.blastFrom(b, st.pos, 40 * G.pw, { lift: 0.2, dy: 120 * sc, scorch: 0, lod: 0 });
                break;
              }
            }
            return true;
          }
          // 마지막: 포효한 뒤 두 주먹으로 땅을 내려침
          const te = t - nSteps * T_STEP;
          if (!st.roared) { st.roared = true; audio.roar(3); }
          for (const s of U.shoulders) {
            const raise = te < 1.6 ? ease.out(te / 1.6) : Math.max(0, 1 - (te - 1.6) * 5);
            s.sh.rotation.x = -2.6 * raise + (te > 1.6 ? 0.9 * Math.min(1, (te - 1.6) * 5) : 0); s.el.rotation.x = -0.6 * raise;
          }
          U.neck.rotation.x = te < 1.6 ? -0.35 * Math.sin(te * 2) : 0.2;
          U.core.material.emissiveIntensity = 2.4 + 2 * Math.sin(te * 12);
          if (te > 1.8 && !st.smashed) {
            st.smashed = true;
            const q = st.pos.clone().addScaledVector(walkDir, 55 * sc); q.y = grid.sample(q.x, q.z);
            stomp(q, true);
            D.explode({ x: q.x, y: q.y + 5, z: q.z, r: 90 * hm, inner: 30 * hm, power: 24 * G.pw, lift: 0.35, lod: 1 });
            fx.ring(q, 160 * sc, 1.6, 0xffa060, 0.5);
          }
          // 떠남: 땅속으로 가라앉음
          if (te > 4) golem.position.y -= dt * 40 * sc;
          return te < 8;
        },
        dispose() { A.remove(golem); },
      });
      const g = cineGame(A); if (!g) return;
      const low = tgt.clone().addScaledVector(walkDir, stride * 2.5).addScaledVector(v3(-walkDir.z, 0, walkDir.x), 110 * sc); low.y = grid.sample(low.x, low.z) + 5;
      g.cine.play([
        watch(low, () => golem.position.clone().add(v3(0, 110 * sc, 0)), { dur: 4, fov: 46, caption: '바위 거인', smooth: 0.25 }),
        chase(() => golem.position.clone().add(v3(0, 60 * sc, 0)), () => walkDir, { back: 160 * sc, up: 90 * sc, side: 90 * sc, ahead: 120 * sc, dur: 4.5, fov: 55, smooth: 0.3 }),
        watch(() => golem.position.clone().addScaledVector(walkDir, 260 * sc).addScaledVector(v3(-walkDir.z, 0, walkDir.x), -120 * sc).setY(grid.sample(golem.position.x, golem.position.z) + 25 * sc), () => golem.position.clone().add(v3(0, 120 * sc, 0)), { dur: Math.max(3, (nSteps * T_STEP) - 8.5 + 3), fov: 50, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 폭주 기차: 위험물 열차가 도시를 관통해 달리다 대폭발 ----
  train: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, audio, camera } = A.ctx;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, tgt);
      const side = v3(-f.z, 0, f.x);
      const dir = side.clone().multiplyScalar(R() < 0.5 ? 1 : -1).addScaledVector(f, 0.25).normalize();
      const G = funScale(A);
      const sc = 1.6 * (G.giant ? G.size ** 0.8 : 1);
      const nCars = Math.round(5 + 2 * S.n ** 0.4);
      const tr = makeTrain(nCars); A.spawn(tr, sc);
      tr.scale.setScalar(1);
      for (const car of tr.userData.cars) car.scale.setScalar(sc);
      const run = Math.min(600, grid.span * 0.45);
      const start = tgt.clone().addScaledVector(dir, -run);
      const st = { s: 0, v: 18, done: false, head: start.clone() };
      audio.horn(2); audio.rumble(run / 40 + 2);
      const carPos = (s) => { const q = start.clone().addScaledVector(dir, s); q.y = grid.sample(q.x, q.z); return q; };
      A.addActive({
        acc: 0, hornT: 3,
        update(dt) {
          if (st.done) return false;
          st.v = Math.min(55 * G.pw ** 0.4 * (G.giant ? Math.sqrt(sc / 1.6) : 1.3), st.v + dt * 9 * Math.sqrt(sc / 1.6));
          st.s += st.v * dt;
          // 차량 배치 (지형 기울기 따라)
          let off = 0;
          for (const car of tr.userData.cars) {
            const L = car.userData.L * sc;
            const a = carPos(st.s - off), b = carPos(st.s - off - L);
            car.position.copy(a).lerp(b, 0.5);
            car.lookAt(a.x + (a.x - b.x), a.y + (a.y - b.y) * 0.5, a.z + (a.z - b.z));
            off += L + 1.2 * sc;
          }
          st.head.copy(carPos(st.s));
          // 앞을 가로막는 건물을 들이받음
          const r = 9 * sc;
          const front = st.head.clone().addScaledVector(dir, 6 * sc);
          for (const b of D.buildingsNear(front.x, front.z, r)) {
            if (b.state === 'intact') D._fractureSoon(b, 0);
            if (b.state !== 'fractured') continue;
            for (const c of b.chunks) {
              if (c.state !== FIXED) continue;
              const dx = c.x - front.x, dz = c.z - front.z;
              if (Math.hypot(dx, dz) > r || c.y > front.y + 14 * sc) continue;
              const l = dx * -dir.z + dz * dir.x;
              D.launch(c, dir.x * st.v * 1.1 - dir.z * l * 0.6, 4 + R() * 6, dir.z * st.v * 1.1 + dir.x * l * 0.6, 0.6);
            }
          }
          D.explode({ x: front.x, y: front.y + 4, z: front.z, r: r * 0.9, power: 6, lift: 0.2, lod: 1, lodBudget: 0 });
          this.acc += dt;
          while (this.acc > 0.03) { this.acc -= 0.03; fx.smoke.emit(st.head.x, st.head.y + 8 * sc, st.head.z, 0, 6, 0, 3, 3, 10, [0.3, 0.3, 0.32, 0.7], [0.5, 0.5, 0.5, 0], 0.5, 1); fx.sparks(st.head, { x: 0, y: 1, z: 0 }, 2); }
          this.hornT -= dt; if (this.hornT < 0) { this.hornT = 4; audio.horn(1.2); }
          if (st.s >= run) {
            st.done = true;
            // 탱크차마다 연쇄 폭발
            const cars = tr.userData.cars.map(c => c.position.clone());
            cars.forEach((q, i) => A.addActive({ t: 0, update(d) { this.t += d; if (this.t < i * 0.18) return true; A.blast(q, (i === 0 ? 30 : 20) * G.hit, 40 * G.pw, { vap: 3 * G.hit, crater: [7 * G.hit, 2.4 * G.hit], smokeColumn: i % 2 === 0, silent: i > 0 && i % 2 }); fx.addShake(1); return false; } }));
            fx.light(st.head.x, st.head.y + 30, st.head.z, 8e4, 1200, 1.5, 0xffa040);
          }
          return true;
        },
        dispose() { A.remove(tr); },
      });
      const g = cineGame(A); if (!g) return;
      const T = run / 40;
      g.cine.play([
        chase(() => st.head.clone().add(v3(0, 6, 0)), () => dir, { back: -80, up: 26, side: 35, ahead: -15, dur: 2.4, fov: 48, caption: '폭주 기차', smooth: 0.2 }),
        chase(() => st.head.clone().add(v3(0, 6, 0)), () => dir, { back: 70, up: 22, side: 26, ahead: 60, dur: Math.max(2, T - 3.5), fov: 60, smooth: 0.12 }),
        orbit(tgt, { dist: 280, h: 150, a0: Math.atan2(side.z, side.x) - 0.3, a1: Math.atan2(side.z, side.x) + 0.3, dur: 4.5, look: 15, fov: 50, ts: 0.7 }),
      ]);
    },
  },
};
