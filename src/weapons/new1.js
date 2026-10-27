// v1.3 새 무기 (폭발·공습): 연쇄 폭약, 지하 관통 폭발, 플라즈마 포, 진공 폭탄, 건쉽 기관포, 정밀유도탄 편대, 공수 낙하 전차, 집속 미사일 포대
import * as THREE from 'three';
import { makeBomb, makeMissile, makeRod, makeBomber } from './models.js';
import { glowMat } from './models2.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';
import { skyline } from './air.js';
import { fxBlast, over, mapPoint } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3, ...o });

function makeTank() {
  const g = new THREE.Group();
  const body = std(0x4d5636), dark = std(0x2a2e22);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 6.5), body); hull.position.y = 1.2; g.add(hull);
  for (const x of [-1.9, 1.9]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 7), dark); tr.position.set(x, 0.7, 0); g.add(tr); }
  const tur = new THREE.Group(); tur.position.y = 2.2; g.add(tur);
  tur.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1, 10), body));
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 5, 8), dark); gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.1, 3); tur.add(gun);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { tur };
  return g;
}
function makeChute() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.SphereGeometry(5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.3), new THREE.MeshStandardMaterial({ color: 0xd8d2bc, side: THREE.DoubleSide, roughness: 0.9 }));
  c.position.y = 9; c.scale.y = 0.6; g.add(c);
  return g;
}

export const NEW1 = {
  // ---- 연쇄 폭약: 건물에 설치한 폭약이 옆 건물로 줄줄이 이어지며 발파 ----
  chainex: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, camera, grid } = A.ctx;
      const first = (hit.info && (hit.info.b || (hit.info.chunk && hit.info.chunk.b))) || D.buildingsNear(p.x, p.z, 40).filter(b => b.state === 'intact')[0];
      if (!first) return;
      const n = Math.round(6 + 6 * S.n ** 0.7);
      // 가까운 건물을 따라 사슬 만들기
      const chain = [first], used = new Set([first]);
      while (chain.length < n) {
        const last = chain[chain.length - 1];
        const cand = D.buildingsNear(last.cx, last.cz, 120 * S.r ** 0.4).filter(b => !used.has(b) && b.state === 'intact');
        if (!cand.length) break;
        cand.sort((a, b) => Math.hypot(a.cx - last.cx, a.cz - last.cz) - Math.hypot(b.cx - last.cx, b.cz - last.cz));
        const nb = cand[Math.floor(R() * Math.min(2, cand.length))]; used.add(nb); chain.push(nb);
      }
      // 깜빡이는 폭약
      const marks = chain.map(b => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), glowMat(0xff2a10, 1)); m.position.set(b.cx, b.baseY + 3, b.cz); A.ctx.scene.add(m); return m; });
      audio.charge(1.6);
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          for (const m of marks) m.visible = ((this.t * 6) | 0) % 2 === 0;
          const step = 0.32;
          while (this.k < chain.length && this.t > 1.6 + this.k * step) {
            const b = chain[this.k], m = marks[this.k]; this.k++;
            A.ctx.scene.remove(m);
            // 발파: 아래층부터 끊어 제자리 붕괴 + 측면 폭발
            const q = v3(b.cx, b.baseY + 2, b.cz);
            A.blast(q, Math.max(14, Math.sqrt(b.area) * 0.9) * S.r ** 0.5, 30 * S.v, { vap: 3, lift: -0.3, crater: [6 * S.r ** 0.5, 1.2], silent: this.k % 2 === 0 });
            for (let h = 0.25; h < 1; h += 0.25) fx.explosion({ x: b.cx, y: b.baseY + b.height * h, z: b.cz }, 6 + Math.sqrt(b.area) * 0.15, { smokeColumn: false });
            fx.addShake(0.5);
          }
          return this.k < chain.length;
        },
        dispose() { for (const m of marks) { A.ctx.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, p), side = v3(-f.z, 0, f.x);
      const mid = chain[Math.floor(chain.length / 2)];
      const c = v3(mid.cx, mid.baseY, mid.cz);
      g.cine.play([
        watch(v3(first.cx, first.baseY, first.cz).addScaledVector(side, 90).add(v3(0, 30, 0)), v3(first.cx, first.baseY + first.height * 0.4, first.cz), { dur: 1.6, fov: 50, caption: `연쇄 폭약 ${chain.length}채` }),
        orbit(c, { dist: 400, h: 240, a0: Math.atan2(-f.z, -f.x) - 0.3, a1: Math.atan2(-f.z, -f.x) + 0.3, dur: chain.length * 0.32 + 3, look: 10, fov: 56 }),
      ]);
    },
  },

  // ---- 지하 관통 폭발: 땅속 깊이 파고든 뒤 터져 땅이 부풀었다 꺼짐 ----
  deepblast: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const r = 70 * S.r;
      let done = false;
      A.addProjectile({
        mesh: A.spawn(makeRod(), 2.4), pos: v3(c.x, c.y + 500, c.z), vel: v3(0, -420, 0), align: 'down', trail: { size: 1.4, fire: true }, ignoreHits: true,
        onUpdate: (pr) => { if (pr.pos.y < c.y + 2) { pr.onHit(c); return false; } return true; },
        onHit: () => {
          if (done) return; done = true;
          audio.thud(); fx.dust(c, 10); fx.addShake(0.8);
          A.addActive({
            t: 0, st: 0,
            update(dt) {
              this.t += dt;
              // 1) 땅이 부풀어 오름
              if (this.st === 0 && this.t > 0.6) {
                this.st = 1; audio.rumble(3);
                A.crater(c.x, c.z, r, -r * 0.18);
                for (const ch of D.gather(c.x, c.z, r * 0.8, 1)) { const d = Math.hypot(ch.x - c.x, ch.z - c.z) / r; D.launch(ch, (ch.x - c.x) * 0.05, 12 * S.v * (1 - d) + 4, (ch.z - c.z) * 0.05, 0.3); }
              }
              // 2) 터지며 흙기둥, 3) 꺼짐
              if (this.st === 1 && this.t > 1.5) {
                this.st = 2;
                A.crater(c.x, c.z, r, r * 0.55);
                D.explode({ x: c.x, y: c.y - 10, z: c.z, r: r * 1.15, power: 46 * S.v, lift: 1.3, scorch: 0.2, lod: 1, vaporize: r * 0.1 });
                for (let i = 0; i < 90 * A.ctx.quality.fxScale; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r * 0.7; fx.smoke.emit(c.x + Math.cos(a) * d, c.y, c.z + Math.sin(a) * d, (R() - 0.5) * 20, 30 + R() * 50, (R() - 0.5) * 20, 6 + R() * 5, 10, 40, [0.45, 0.38, 0.3, 0.9], [0.5, 0.45, 0.4, 0], 0.6, -0.8); }
                fx.addShake(2.4); audio.boom(3, A.ctx.camera.position.distanceTo(c));
                world.paintScorch(c.x, c.z, r * 1.2, 0.5);
              }
              return this.t < 2;
            },
          });
        },
      });
      A.ctx.audio.whoosh(1.2);
    },
  },

  // ---- 플라즈마 포: 느리게 나아가는 플라즈마 구가 건물을 꿰뚫어 녹이고 끝에서 폭발 ----
  plasma: {
    fire(A, hit, cam) {
      const S = A.S, p = hit.point, { D, fx, scene, world, audio } = A.ctx;
      const from = cam.clone().add(v3(0, -8, 0));
      const dir = v3(p.x, p.y, p.z).sub(from).normalize();
      const rad = 7 * S.r ** 0.7;
      const ball = new THREE.Group();
      ball.add(new THREE.Mesh(new THREE.SphereGeometry(rad * 0.6, 24, 16), glowMat(0xe8f6ff, 1)), new THREE.Mesh(new THREE.SphereGeometry(rad, 24, 16), glowMat(0x4aa8ff, 0.5)));
      ball.position.copy(from); scene.add(ball);
      const pos = from.clone(), sp = 110;
      let trav = 0;
      const maxL = from.distanceTo(p) + 180 * S.r ** 0.5;
      audio.laserStart();
      A.addActive({
        update(dt) {
          const prev = pos.clone();
          pos.addScaledVector(dir, sp * dt); trav += sp * dt;
          ball.position.copy(pos); ball.rotation.y += dt * 4;
          ball.children[1].scale.setScalar(1 + 0.15 * Math.sin(trav));
          D.lineBlast(prev, pos, rad * 1.3, 28 * S.v);
          fx.light(pos.x, pos.y, pos.z, 2e4, rad * 12, 0.05, 0x6ab8ff);
          for (let i = 0; i < 3; i++) fx.fire.emit(pos.x, pos.y, pos.z, (R() - 0.5) * 10, (R() - 0.5) * 10, (R() - 0.5) * 10, 0.5, rad * 0.8, rad * 0.2, [0.7, 0.85, 1, 1], [0.2, 0.4, 1, 0], 1, 0);
          world.paintScorch(pos.x, pos.z, rad, 0.2);
          const ground = A.ctx.grid.sample(pos.x, pos.z);
          if (trav > maxL || pos.y < ground + 1) {
            A.blast(v3(pos.x, Math.max(pos.y, ground), pos.z), 34 * S.r, 50 * S.v, { vap: 6 * S.r, crater: [8 * S.r, 3 * S.r] });
            fx.flash = Math.max(fx.flash, 0.2);
            return false;
          }
          return true;
        },
        dispose() { scene.remove(ball); ball.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); audio.laserStop(); },
      });
    },
  },

  // ---- 진공 폭탄: 주변 공기를 빨아들여 모든 걸 끌어모은 뒤 한꺼번에 터짐 ----
  vacuum: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z) + 15, p.z);
      const r = 60 * S.r;
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMat(0xffd8a0, 0.9)); core.position.copy(c); scene.add(core);
      audio.charge(2);
      A.addActive({
        t: 0, boom: false,
        update(dt) {
          this.t += dt;
          if (this.t < 2) {
            const k = this.t / 2;
            core.scale.setScalar(2 + 6 * (1 - k));
            D.field({ x: c.x, y: c.y, z: c.z, r: r * 1.3, mode: 'gravity', core: 0, grab: r * 0.8 * k, strength: 40 * S.v }, dt);
            for (let i = 0; i < 6; i++) { const u = v3(R() - 0.5, R() * 0.6 - 0.1, R() - 0.5).normalize(); const q = c.clone().addScaledVector(u, r); fx.smoke.emit(q.x, q.y, q.z, -u.x * r, -u.y * r, -u.z * r, 1, 8, 2, [0.8, 0.75, 0.65, 0.4], [0.8, 0.75, 0.65, 0], 0, 0); }
            fx.addShake(dt * 0.8);
            return true;
          }
          if (!this.boom) {
            this.boom = true; scene.remove(core);
            A.blast(c, r * 1.2, 60 * S.v, { vap: 8 * S.r, crater: [14 * S.r, 4 * S.r], lift: 0.6 });
            fx.flash = Math.max(fx.flash, 0.3); fx.addShake(2.5);
          }
          return false;
        },
        dispose() { scene.remove(core); core.geometry.dispose(); core.material.dispose(); },
      });
    },
  },

  // ---- 건쉽 기관포: 하늘을 선회하는 건쉽이 누르는 동안 조준점에 포탄을 퍼부음 ----
  gunship: {
    holdStart(A, hit) {
      const p = hit ? hit.point : v3();
      const m = A.spawn(makeBomber(), 0.9);
      A.ctx.audio.drone(30);
      return { m, t: 0, acc: 0, c: v3(p.x, p.y, p.z), ang: R() * 6.28, aim: v3(p.x, p.y, p.z) };
    },
    holdUpdate(A, L, dt, aim) {
      const S = A.S, { fx, grid, audio } = A.ctx;
      L.t += dt; L.acc += dt;
      if (aim) L.aim.set(aim.x, aim.y, aim.z);
      L.c.lerp(L.aim, Math.min(1, dt * 0.5));
      // 조준점 위 높은 고도를 선회 (왼쪽으로 기울어 조준)
      L.ang += dt * 0.35;
      const R0 = 420, alt = grid.sample(L.c.x, L.c.z) + 380;
      const pos = v3(L.c.x + Math.cos(L.ang) * R0, alt, L.c.z + Math.sin(L.ang) * R0);
      L.m.position.copy(pos);
      const fwd = v3(-Math.sin(L.ang), 0, Math.cos(L.ang));
      L.m.quaternion.setFromUnitVectors(v3(0, 0, 1), fwd); L.m.rotateZ(-0.35);
      const rate = 0.07 / Math.sqrt(S.n);
      while (L.acc > rate) {
        L.acc -= rate;
        const sp = 9 * S.r ** 0.5;
        const q = v3(L.aim.x + (R() - 0.5) * sp * 2, 0, L.aim.z + (R() - 0.5) * sp * 2); q.y = grid.sample(q.x, q.z);
        const dir = q.clone().sub(pos).normalize();
        A.addProjectile({ mesh: null, pos: pos.clone().addScaledVector(dir, 8), vel: dir.multiplyScalar(700), trail: { size: 0.5, fire: true, every: 0.005 },
          onHit: (qq) => { A.blast(qq, 5 * S.r ** 0.8, 18 * S.v, { vap: 1, smokeColumn: false, silent: R() > 0.15 }); fx.sparks(qq, { x: 0, y: 1, z: 0 }, 4); } });
        fx.light(pos.x, pos.y - 3, pos.z, 4000, 80, 0.04, 0xffd090);
      }
    },
    holdEnd(A, L) { const m = L.m; const v = v3(-Math.sin(L.ang), 0.1, Math.cos(L.ang)).multiplyScalar(160); A.addActive({ t: 0, update(dt) { this.t += dt; m.position.addScaledVector(v, dt); return this.t < 6; }, dispose() { A.remove(m); } }); },
  },

  // ---- 정밀유도탄 편대: 주변 높은 건물마다 한 발씩 동시에 명중 ----
  pgm: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, grid, audio, camera } = A.ctx;
      const n = Math.round(4 + 4 * S.n ** 0.8);
      const blds = D.buildingsNear(p.x, p.z, 160 * S.r ** 0.6).filter(b => b.state === 'intact').sort((a, b) => b.height - a.height).slice(0, n);
      if (!blds.length) blds.push({ cx: p.x, cz: p.z, baseY: p.y, height: 0 });
      const T = 4.5, g = 25;
      const shots = [];
      blds.forEach((b, i) => {
        const tgt = v3(b.cx, b.baseY + b.height * 0.85, b.cz);
        const from = tgt.clone().add(v3((R() - 0.5) * 600, 1200 + R() * 200, (R() - 0.5) * 600));
        const vel = v3((tgt.x - from.x) / T, (tgt.y - from.y + 0.5 * g * T * T) / T, (tgt.z - from.z) / T);
        const st = { pos: from.clone() };
        shots.push(st);
        A.addProjectile({ mesh: A.spawn(makeBomb(), 1.4), pos: st.pos, vel, g, align: 'down', trail: { size: 0.6 }, ignoreHits: true,
          onUpdate: (pr) => { if (pr.pos.distanceTo(tgt) < 60) pr.ignoreHits = false; return true; },
          onHit: (q) => A.blast(q, 22 * S.r, 40 * S.v, { vap: 3 * S.r, silent: i % 2 === 1 }) });
      });
      audio.whoosh(T);
      const gm = cineGame(A); if (!gm) return;
      const f = camDir(camera, p);
      gm.cine.play([
        chase(() => shots[0].pos, () => v3(p.x, p.y, p.z).sub(shots[0].pos), { back: 18, up: 6, ahead: 60, dur: T - 1.2, fov: 55, caption: `정밀유도탄 ${blds.length}발` }),
        orbit(v3(p.x, p.y, p.z), { dist: 320, h: 160, a0: Math.atan2(-f.z, -f.x) - 0.3, a1: Math.atan2(-f.z, -f.x) + 0.25, dur: 4.5, look: 30, ts: (0.6) }),
      ]);
    },
  },

  // ---- 공수 낙하 전차: 수송기가 전차를 낙하산으로 떨구고, 전차들이 돌아다니며 포격 ----
  airdrop: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { grid, D, fx, audio, camera } = A.ctx;
      const n = Math.round(3 + 3 * S.n ** 0.6);
      const f = camDir(camera, p), side = v3(-f.z, 0, f.x);
      const alt = grid.sample(p.x, p.z) + 320;
      const plane = A.spawn(makeBomber(), 1.6);
      const start = v3(p.x, alt, p.z).addScaledVector(side, -900);
      plane.quaternion.setFromUnitVectors(v3(0, 0, 1), side);
      const tanks = [];
      audio.drone(14);
      A.addActive({
        t: 0, dropped: 0,
        update(dt) {
          this.t += dt;
          plane.position.copy(start).addScaledVector(side, 150 * this.t);
          // 표적 위를 지날 때 차례로 투하
          const along = (this.t * 150) - 900;
          while (this.dropped < n && along > -120 + this.dropped * 50) {
            this.dropped++;
            const m = A.spawn(makeTank(), 2.2), ch = A.spawn(makeChute(), 2.2);
            const t = { m, ch, pos: plane.position.clone().add(v3(0, -8, 0)), vy: 0, landed: false, dir: v3(R() - 0.5, 0, R() - 0.5).normalize(), drive: 1.5 + R(), tgt: null, shots: 0, cool: 0.6 + R() * 0.6, yaw: 0, recoil: 0, life: 20 + R() * 4, e: A.summon(m) };
            tanks.push(t);
          }
          for (const t of tanks) {
            if (!t.m.parent || t.e.captured) continue;
            const gy = grid.sample(t.pos.x, t.pos.z);
            if (!t.landed) {
              // 자유 낙하 뒤 지면 90m 위에서 낙하산이 펴짐
              const open = t.pos.y < gy + 90;
              t.vy = open ? Math.min(-9, t.vy + 40 * dt) : Math.max(-60, t.vy - 9.8 * dt); t.pos.y += t.vy * dt;
              t.ch.visible = open;
              if (t.pos.y <= gy) { t.landed = true; t.pos.y = gy; A.remove(t.ch); fx.dust(t.pos, 6); audio.thud(); D.explode({ x: t.pos.x, y: gy + 2, z: t.pos.z, r: 10, power: 20, lift: -0.5, lod: 1 }); }
              t.ch.position.copy(t.pos);
            } else {
              t.life -= dt;
              // 잠깐 달리다 멈춰서 포격
              if (t.drive > 0) {
                t.drive -= dt;
                t.pos.addScaledVector(t.dir, 14 * dt); t.pos.y = gy;
                D.explode({ x: t.pos.x + t.dir.x * 5, y: gy + 2, z: t.pos.z + t.dir.z * 5, r: 6, power: 10, lift: 0.1, lod: 1, lodBudget: 0 });
              } else {
                // 표적: 가까운 온전한 건물, 3발 쏘면 다음 건물
                if (!t.tgt || t.tgt.state === 'gone' || t.shots >= 3) {
                  const bs = D.buildingsNear(t.pos.x, t.pos.z, 240).filter(b => b.state === 'intact' || b.state === 'fractured').sort((a, b) => Math.hypot(a.cx - t.pos.x, a.cz - t.pos.z) - Math.hypot(b.cx - t.pos.x, b.cz - t.pos.z));
                  t.tgt = bs[Math.min(bs.length - 1, Math.floor(R() * 3))] || null; t.shots = 0;
                  if (!t.tgt) {
                    // 가까이에 건물이 없으면 가장 가까운 건물 쪽으로 달려감
                    const far = D.buildingsNear(t.pos.x, t.pos.z, 900).filter(b => b.state === 'intact').sort((a, b) => Math.hypot(a.cx - t.pos.x, a.cz - t.pos.z) - Math.hypot(b.cx - t.pos.x, b.cz - t.pos.z))[0];
                    if (far) { t.dir.set(far.cx - t.pos.x, 0, far.cz - t.pos.z).normalize(); t.drive = Math.min(6, Math.max(1, (Math.hypot(far.cx - t.pos.x, far.cz - t.pos.z) - 150) / 14)); }
                    else { t.drive = 2; t.dir.applyAxisAngle(v3(0, 1, 0), (R() - 0.5) * 2); }
                  }
                }
                if (t.tgt) {
                  const b = t.tgt;
                  const want = Math.atan2(b.cx - t.pos.x, b.cz - t.pos.z) - Math.atan2(t.dir.x, t.dir.z);
                  let d = want - t.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
                  t.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * 1.4);       // 포탑이 천천히 돎
                  t.cool -= dt;
                  if (Math.abs(d) < 0.04 && t.cool <= 0) {
                    t.cool = 1.3 + R() * 0.5; t.shots++; t.recoil = 1;
                    const wy = t.yaw + Math.atan2(t.dir.x, t.dir.z), fwd = v3(Math.sin(wy), 0, Math.cos(wy));
                    const muzzle = t.pos.clone().add(v3(0, 4.9, 0)).addScaledVector(fwd, 12.5);
                    const q = v3(b.cx + (R() - 0.5) * 6, b.baseY + Math.max(3, (b.flatH || b.height) * (0.2 + R() * 0.5)), b.cz + (R() - 0.5) * 6);
                    const dir = q.clone().sub(muzzle).normalize();
                    fx.explosion(muzzle, 2.2, { smokeColumn: false }); fx.light(muzzle.x, muzzle.y, muzzle.z, 3000, 60, 0.15, 0xffc070);
                    audio.boom(1, camera.position.distanceTo(muzzle));
                    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 4), glowMat(0xffd080, 1));
                    A.addProjectile({ mesh: A.spawn(shell, 1), pos: muzzle.clone().addScaledVector(dir, 2), vel: dir.multiplyScalar(320), trail: { size: 0.6, fire: true, every: 0.01 },
                      onHit: (hq) => A.blast(hq, 11 * S.r, 30 * S.v, { vap: 1.5, smokeColumn: false, silent: R() > 0.5, lod: 1 }) });
                  }
                }
              }
              t.recoil = Math.max(0, t.recoil - dt * 4);
              t.m.userData.tur.rotation.y = t.yaw;
              t.m.userData.tur.position.z = -0.5 * t.recoil;
              if (t.life < 0) { A.blast(t.pos, 8, 20, { smokeColumn: false }); A.remove(t.m); continue; }
            }
            t.m.position.copy(t.pos);
            t.m.quaternion.setFromUnitVectors(v3(0, 0, 1), t.dir);
          }
          return this.t < 40 && (this.dropped < n || tanks.some(t => t.m.parent && !t.e.gone));
        },
        dispose() { A.remove(plane); for (const t of tanks) { A.remove(t.m); A.remove(t.ch); } },
      });
      const g = cineGame(A); if (!g) return;
      // 포탑 뒤에서 표적 건물을 보는 시점
      const tk = () => tanks.find(t => t.landed && t.m.parent && t.drive <= 0) || tanks[0];
      const behind = () => { const t = tk(); if (!t) return v3(p.x, p.y + 60, p.z); const wy = t.yaw + Math.atan2(t.dir.x, t.dir.z); return t.pos.clone().add(v3(-Math.sin(wy) * 26, 9, -Math.cos(wy) * 26)); };
      const tgtOf = () => { const t = tk(); if (!t) return v3(p.x, p.y, p.z); if (t.tgt) return v3(t.tgt.cx, t.tgt.baseY + Math.min(30, t.tgt.height * 0.4), t.tgt.cz); const wy = t.yaw + Math.atan2(t.dir.x, t.dir.z); return t.pos.clone().add(v3(Math.sin(wy) * 60, 6, Math.cos(wy) * 60)); };
      g.cine.play([
        watch(v3(p.x, p.y, p.z).addScaledVector(f, -260).add(v3(0, 90, 0)), () => plane.position, { dur: 5.5, fov: 48, caption: `공수 낙하 전차 ${n}대`, smooth: 0.3 }),
        watch(v3(p.x, p.y, p.z).addScaledVector(f, -150).addScaledVector(side, 60).add(v3(0, 25, 0)), () => (tanks[0] ? tanks[0].pos : v3(p.x, p.y, p.z)), { dur: 4, fov: 50, smooth: 0.25 }),
        watch(behind, tgtOf, { dur: 7, fov: 55, caption: '포격', smooth: 0.15 }),
        watch(() => { const q = tgtOf(); const t = tk(); const away = t ? q.clone().sub(t.pos).setY(0).normalize() : f; return q.clone().addScaledVector(v3(-away.z, 0, away.x), 90).addScaledVector(away, -30).add(v3(0, 20, 0)); }, tgtOf, { dur: 5, fov: 52, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 집속 미사일 포대: 지도 밖 발사대에서 로켓 수십 발이 줄지어 쏟아짐 ----
  mlrs: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { grid, audio, camera, world } = A.ctx;
      const tgt = v3(p.x, p.y, p.z);
      const f = camDir(camera, tgt), side = v3(-f.z, 0, f.x).multiplyScalar(R() < 0.5 ? 1 : -1);
      const dir = side.clone().addScaledVector(f, 0.4).normalize();
      const L = Math.max(2400, grid.span * 0.9);
      const base = tgt.clone().addScaledVector(dir, L); base.y = (world.outerHeight ? world.outerHeight(base.x, base.z) : tgt.y) + 3;
      const n = Math.round(18 + 10 * S.n ** 0.7), T = 7, g = 30;
      over(A, n, 4.5, (k) => {
        const a = R() * 6.28, d = Math.sqrt(R()) * 70 * S.r ** 0.6;
        const q = v3(tgt.x + Math.cos(a) * d, 0, tgt.z + Math.sin(a) * d); q.y = grid.sample(q.x, q.z);
        const from = base.clone().add(v3((k % 6) * 3 - 8, 4, 0));
        const vel = v3((q.x - from.x) / T, (q.y - from.y + 0.5 * g * T * T) / T, (q.z - from.z) / T);
        A.addProjectile({ mesh: A.spawn(makeMissile(), 2.4), pos: from, vel, g, align: 'fwd', trail: { size: 2.4, fire: true, every: 0.01 }, ignoreHits: true,
          onUpdate: (pr) => { if (pr.ignoreHits && pr.vel.y < 0 && Math.hypot(pr.pos.x - q.x, pr.pos.z - q.z) < 300) pr.ignoreHits = false; return true; },
          onHit: (qq) => A.blast(qq, 13 * S.r, 32 * S.v, { vap: 1.5 * S.r, crater: [3.5 * S.r, 1.2 * S.r], silent: k % 3 !== 0, smokeColumn: k % 4 === 0 }) });
        if (k % 3 === 0) audio.rocket(1.2);
      });
      const gm = cineGame(A); if (!gm) return;
      gm.cine.play([
        watch(base.clone().addScaledVector(dir, 80).add(v3(0, 25, 0)).addScaledVector(v3(-dir.z, 0, dir.x), 40), () => base.clone().add(v3(0, 150, 0)).addScaledVector(dir, -300), { dur: 3, fov: 50, caption: '집속 미사일 포대 발사', smooth: 0.3 }),
        watch(tgt.clone().addScaledVector(dir, 350).add(v3(0, 120, 0)), tgt, { dur: T + 2, fov: 52, smooth: 0.3 }),
      ]);
    },
  },
};

export const NEW1_ENDINGS = {
  chainex: (A, c) => { wipeMap(A, c, 'nuke', { dur: 10 }); over(A, 60, 10, () => fxBlast(A, mapPoint(A), 30, { silent: R() > 0.3 })); worldEnd(A, c, 'fire', { delay: 3 }); },
  deepblast: (A, c) => { crustCollapse(A, c, { level: 1 }); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'crack', { delay: 2 }); },
  plasma: (A, c) => { over(A, 30, 6, () => fxBlast(A, mapPoint(A), 60, { silent: R() > 0.3 })); wipeMap(A, c, 'anti', { dur: 7 }); worldEnd(A, c, 'anti', { delay: 1, planetKind: 'shatter' }); },
  vacuum: (A, c) => { wipeMap(A, c, 'nuke', { dur: 6 }); worldEnd(A, c, 'fire', { delay: 2 }); },
  gunship: (A, c) => { wipeMap(A, c, 'nuke', { dur: 10 }); over(A, 50, 10, () => fxBlast(A, mapPoint(A), 25, { silent: true, smoke: false })); worldEnd(A, c, 'fire', { delay: 3 }); },
  pgm: (A, c) => { wipeMap(A, c, 'nuke', { dur: 6 }); worldEnd(A, c, 'fire', { delay: 5 }); },
  airdrop: (A, c) => { wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'fire', { delay: 6 }); },
  mlrs: (A, c) => { over(A, 80, 10, () => fxBlast(A, mapPoint(A), 35, { silent: R() > 0.2 }), 6); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'fire', { delay: 7 }); },
};
