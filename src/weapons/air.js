// 공습·폭발 추가 무기: 열압력탄, 순항미사일, 자폭 드론 떼, 함포 사격
import * as THREE from 'three';
import { makeBomb } from './models.js';
import { makeDrone, makeCruise, makeShell } from './models2.js';
import { cineGame, chase, watch, orbit, camDir, clearSpot } from './cam.js';
import { makeWarship } from './models4.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

// 지면·지붕 중 높은 쪽
export function skyline(D, grid, x, z, r = 20) {
  let h = grid.sample(x, z);
  for (const b of D.buildingsNear(x, z, r)) if (b.state === 'intact') h = Math.max(h, b.baseY + b.height);
  return h;
}

export const AIR = {
  // ---- 열압력탄: 연료 구름이 퍼진 뒤 점화, 긴 압력파 + 역흡입 ----
  thermobaric: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, world } = A.ctx;
      let done = false;
      const burst = (q) => {
        if (done) return; done = true;
        const gy = grid.sample(q.x, q.z);
        const c = v3(q.x, Math.max(q.y, gy + 6), q.z);
        const rc = 34 * S.r, r = 48 * S.r;
        audio.whoosh(1.2);
        A.addActive({
          t: 0, acc: 0, lit: false, vac: false,
          update(dt) {
            this.t += dt;
            const t = this.t;
            if (t < 1.0) {
              // 연료 에어로졸 구름 퍼짐
              this.acc += dt;
              while (this.acc > 0.012) {
                this.acc -= 0.012;
                const a = R() * 6.28, e = R() * 1.2 - 0.2, s = rc * (0.3 + 0.9 * t) * Math.sqrt(R());
                fx.smoke.emit(c.x + Math.cos(a) * s, c.y + e * s * 0.4, c.z + Math.sin(a) * s, Math.cos(a) * 18, 1, Math.sin(a) * 18, 1.4, rc * 0.2, rc * 0.45, [0.85, 0.82, 0.62, 0.22], [0.8, 0.78, 0.6, 0.0], 1.2, 0, 0.1);
              }
              return true;
            }
            if (!this.lit) {
              this.lit = true;
              fx.flash = Math.max(fx.flash, 0.35);
              fx.explosion(c, r * 1.05, { ring: true, smokeColumn: true });
              fx.light(c.x, c.y + 20, c.z, 9e4, r * 7, 1.6, 0xffb060);
              for (let i = 0; i < Math.round(160 * A.ctx.quality.fxScale); i++) {
                const a = R() * 6.28, e = R() * 0.9, s = rc * (0.3 + R() * 1.0);
                fx.fire.emit(c.x + Math.cos(a) * s, c.y + e * s * 0.5, c.z + Math.sin(a) * s, Math.cos(a) * 25, 8 + R() * 14, Math.sin(a) * 25, 0.9 + R() * 0.9, rc * 0.18, rc * 0.5, [1, 0.85, 0.5, 1], [0.9, 0.2, 0.02, 0], 1.5, 3);
              }
              D.explode({ x: c.x, y: c.y, z: c.z, r, power: 34 * S.v, vaporize: 4 * S.r, lift: 0.12, scorch: 0.9, lod: 1 });
              world.paintScorch(c.x, c.z, r * 1.1, 0.95); world.blastTrees(c.x, c.z, r * 1.3, r * 0.6);
              A.crater(c.x, c.z, 9 * S.r, 2.2 * S.r);
              fx.addShake(2.4); audio.boom(3, A.ctx.camera.position.distanceTo(c));
              return true;
            }
            // 길게 이어지는 압력파
            if (t < 1.35) D.explode({ x: c.x, y: c.y, z: c.z, r: r * 1.35, inner: r * 0.55, power: 16 * S.v, lift: 0.05, lod: 2, lodBudget: 0 });
            // 역흡입: 타고 남은 공기가 안쪽으로 빨려 듦
            if (t > 1.7 && t < 2.5) D.field({ x: c.x, y: c.y, z: c.z, r: r * 1.3, mode: 'gravity', core: 0, grab: 0, strength: 14 }, dt);
            return t < 2.6;
          },
        });
      };
      A.addProjectile({
        mesh: A.spawn(makeBomb(), 1.7 * Math.sqrt(S.r)), pos: v3(p.x + 6, p.y + 200, p.z), vel: v3(-3, -50, 0), g: 30, align: 'down', trail: { size: 0.7 },
        onUpdate: (pr) => { if (pr.pos.y < grid.sample(pr.pos.x, pr.pos.z) + 16) { burst(pr.pos.clone()); return false; } return true; },
        onHit: (q) => burst(q),
      });
      audio.whoosh(2.5);
    },
  },

  // ---- 순항미사일: 지형을 따라 낮게 날다 표적 직전 솟구쳐 내리꽂음 ----
  cruise: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, grid, audio, camera, fx } = A.ctx;
      const tgt = v3(p.x, p.y, p.z);
      const f = camDir(camera, tgt);
      // 지도 밖 수평선에서 낮게 날아 들어옴
      const half = grid.span / 2;
      const L = Math.max(1600, half * 1.6);
      const start = tgt.clone().addScaledVector(f, -L);
      start.y = Math.max(skyline(D, grid, start.x, start.z, 30), A.ctx.world && A.ctx.world.outerHeight ? A.ctx.world.outerHeight(start.x, start.z) : 0) + 40;
      const SPD = 210;
      const st = { phase: 'cruise', pos: start.clone(), vel: v3(tgt.x - start.x, 0, tgt.z - start.z).normalize().multiplyScalar(SPD), hit: false };
      const m = A.spawn(makeCruise(), 2.2);
      audio.rocket(5);
      A.addProjectile({
        mesh: m, pos: st.pos, vel: st.vel, align: 'fwd', trail: { size: 1.4, fire: true, every: 0.01 },
        onUpdate: (pr, dt) => {
          const to = v3(tgt.x - pr.pos.x, 0, tgt.z - pr.pos.z);
          const dist = to.length();
          if (st.phase === 'cruise') {
            // 앞쪽 지붕 높이를 미리 보고 고도 유지
            const look = pr.pos.clone().addScaledVector(to.clone().normalize(), 70);
            const want = Math.max(skyline(D, grid, pr.pos.x, pr.pos.z, 25), skyline(D, grid, look.x, look.z, 25)) + 32;
            const d = to.normalize().multiplyScalar(SPD);
            d.y = Math.max(-25, Math.min(40, (want - pr.pos.y) * 2.5));
            pr.vel.lerp(d, Math.min(1, dt * 3));
            if (dist < 230) { st.phase = 'pop'; audio.whoosh(1); }
          } else if (st.phase === 'pop') {
            pr.vel.y += 120 * dt; pr.vel.setLength(SPD);
            if (pr.pos.y > tgt.y + 110 || dist < 80) st.phase = 'dive';
          } else {
            const d = v3().subVectors(tgt, pr.pos).normalize().multiplyScalar(200);
            pr.vel.lerp(d, Math.min(1, dt * 5));
          }
          st.pos.copy(pr.pos); st.vel.copy(pr.vel);
          return true;
        },
        onHit: (q) => {
          st.hit = true;
          A.blast(q, 24 * S.r, 46 * S.v, { vap: 2.5 * S.r, crater: [6 * S.r, 2.2 * S.r] });
          fx.addShake(1.2);
        },
      });
      const g = cineGame(A); if (!g) return;
      const T = L / SPD;
      const side = v3(-f.z, 0, f.x);
      const ground = tgt.clone().addScaledVector(f, -170).addScaledVector(side, 60); ground.y = grid.sample(ground.x, ground.z) + 4;
      g.cine.play([
        chase(() => st.pos, () => st.vel, { back: 22, up: 6, ahead: 60, dur: Math.max(1.5, T - 2.4), caption: '순항미사일', fov: 62 }),
        watch(ground, () => (st.hit ? tgt : st.pos), { dur: 1.6, fov: 48, ts: 0.45, smooth: 0.05 }),
        watch(() => tgt.clone().addScaledVector(side, 280).addScaledVector(f, -80).add(v3(0, 130, 0)), () => tgt, { dur: 3.2, fov: 46, ts: (u) => 0.5 + 0.5 * u }),
      ]);
    },
  },

  // ---- 자폭 드론 떼: 수십 대가 흩어져 높은 건물부터 들이받음 ----
  drones: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, grid, audio, camera } = A.ctx;
      const n = Math.min(60, Math.round(8 + 7 * S.n ** 0.75));
      const area = 90 * S.r;
      const blds = D.buildingsNear(p.x, p.z, area).filter(b => b.state === 'intact').sort((a, b) => b.height - a.height);
      const f = camDir(camera, v3(p.x, p.y, p.z));
      // 표적 가까이(약 170m)에서 날아오게: 결과가 바로 보이도록
      const origin = v3(p.x, 0, p.z).addScaledVector(f, -170 - 30 * S.r ** 0.5);
      origin.y = Math.max(skyline(D, grid, origin.x, origin.z, 40), p.y) + 45;
      const swarm = { c: origin.clone(), v: f.clone().multiplyScalar(45), alive: n };
      audio.buzz(9);
      for (let i = 0; i < n; i++) {
        const b = blds.length ? blds[i % Math.max(1, Math.min(blds.length, Math.ceil(n * 0.6)))] : null;
        const tp = b ? v3(b.cx + (R() - 0.5) * 8, b.baseY + b.height * (0.35 + R() * 0.6), b.cz + (R() - 0.5) * 8)
          : v3(p.x + (R() - 0.5) * area, 0, p.z + (R() - 0.5) * area);
        if (!b) tp.y = grid.sample(tp.x, tp.z);
        const m = A.spawn(makeDrone(), 1.6);
        const off = v3((R() - 0.5) * 40, (R() - 0.5) * 20, (R() - 0.5) * 40);
        const d = { pos: origin.clone().add(off), vel: f.clone().multiplyScalar(40), ph: R() * 6.28, delay: R() * 0.6, dive: false };
        A.addProjectile({
          mesh: m, pos: d.pos, vel: d.vel, align: 'fwd', ignoreHits: true,
          onUpdate: (pr, dt) => {
            d.delay -= dt; d.ph += dt * 6;
            for (const r of m.userData.rotors) r.rotation.y += dt * 60;
            const to = v3().subVectors(tp, pr.pos), dist = to.length();
            if (!d.dive && dist < 70 && d.delay < 0) { d.dive = true; pr.ignoreHits = false; }
            const sp = d.dive ? 75 : 46;
            const want = to.normalize().multiplyScalar(sp);
            if (!d.dive) { want.y += Math.sin(d.ph) * 6 + Math.max(0, skyline(D, grid, pr.pos.x, pr.pos.z, 12) + 25 - pr.pos.y) * 1.5; want.x += Math.cos(d.ph * 0.7) * 6; }
            pr.vel.lerp(want, Math.min(1, dt * (d.dive ? 4 : 1.6)));
            if (d.dive && dist < 2) { pr.onHit(pr.pos.clone()); return false; }
            return true;
          },
          onHit: (q) => {
            if (d.boom) return; d.boom = true; swarm.alive--;
            A.blast(q, 8 * S.r, 22 * S.v, { vap: 1.2 * S.r, crater: [2.5 * S.r, 0.8 * S.r], smokeColumn: false, silent: R() > 0.4 });
          },
        });
        if (i === 0) swarm.lead = d;
      }
      const g = cineGame(A); if (!g || !swarm.lead) return;
      const ld = swarm.lead;
      g.cine.play([
        chase(() => ld.pos, () => ld.vel, { back: 14, up: 4, side: 6, ahead: 50, dur: 2.2, caption: `자폭 드론 ${n}대`, fov: 64 }),
        orbit(v3(p.x, p.y, p.z), { dist: 260, h: 120, a0: Math.atan2(-f.z, -f.x) - 0.5, a1: Math.atan2(-f.z, -f.x) + 0.3, dur: 4.5, look: 20 }),
      ]);
    },
  },

  // ---- 함포 사격: 먼바다 전함의 일제 사격, 포탄이 줄지어 떨어짐 ----
  naval: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, grid, audio, camera, fx, scene, game } = A.ctx;
      const tgt = v3(p.x, p.y, p.z);
      const f = camDir(camera, tgt);
      // 함대는 표적 옆쪽 수평선 너머 바다 위
      const side = v3(-f.z, 0, f.x);
      const fromDir = side.clone().multiplyScalar(R() < 0.5 ? 1 : -1).addScaledVector(f, 0.6).normalize();
      const ship = tgt.clone().addScaledVector(fromDir, 2600);
      const gnd = (x, z) => (game && game.groundAt ? game.groundAt(x, z) : grid.sample(x, z));
      let seaY = -1e9; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; seaY = Math.max(seaY, gnd(ship.x + Math.cos(a) * 400, ship.z + Math.sin(a) * 400)); }
      seaY += 2; ship.y = seaY + 6;
      if (game) game.ensureView(6000, 3000);
      // 바다 + 전함 3척
      const sea = new THREE.Mesh(new THREE.CircleGeometry(700, 48), new THREE.MeshStandardMaterial({ color: 0x24506a, roughness: 0.15, metalness: 0.3 }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(ship.x, seaY, ship.z); scene.add(sea);
      const across = v3(-fromDir.z, 0, fromDir.x);
      const ships = [-1, 0, 1].map(k => { const m = makeWarship(); m.scale.setScalar(140); m.position.copy(ship).addScaledVector(across, k * 170).addScaledVector(fromDir, Math.abs(k) * 60); m.position.y = seaY; m.lookAt(m.position.clone().add(across)); scene.add(m); for (const t of m.userData.guns) t.rotation.y = (t.rotation.y > 1 ? Math.PI : 0) + Math.atan2(-fromDir.x, -fromDir.z) - Math.atan2(across.x, across.z); return m; });
      const salvos = 3, per = Math.min(16, Math.round(6 + 3 * S.n ** 0.6));
      const spread = 40 * S.r;
      const T = 5.5, g = 30;
      const st = { first: null, hits: 0 };
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          while (this.k < salvos && this.t > this.k * 1.8) {
            const k = this.k++;
            // 포구 섬광과 연기 (함대 쪽)
            for (const m of ships) for (const t of m.userData.guns) { const q = t.getWorldPosition(v3()).addScaledVector(fromDir.clone().negate(), 25).add(v3(0, 6, 0)); fx.explosion(q, 9, { smokeColumn: false }); fx.light(q.x, q.y, q.z, 2e4, 600, 0.25, 0xffd090); }
            A.addActive({ t: 0, update(d) { this.t += d; if (this.t > 2.4) { audio.boom(2.2, 1600); return false; } return true; } });
            for (let i = 0; i < per; i++) {
              const a = R() * 6.28, rr = Math.sqrt(R()) * spread;
              const q = v3(tgt.x + Math.cos(a) * rr + fromDir.x * (R() - 0.5) * spread, 0, tgt.z + Math.sin(a) * rr + fromDir.z * (R() - 0.5) * spread);
              q.y = grid.sample(q.x, q.z);
              const tt = T + (R() - 0.5) * 0.6 + k * 0.05;
              const sh0 = ships[i % 3];
              const from = sh0.position.clone().add(v3((R() - 0.5) * 60, 30, (R() - 0.5) * 60));
              const vel = v3((q.x - from.x) / tt, (q.y - from.y + 0.5 * g * tt * tt) / tt, (q.z - from.z) / tt);
              const sh = { pos: from.clone(), vel };
              if (!st.first) st.first = sh;
              A.addProjectile({
                mesh: A.spawn(makeShell(), 2), pos: sh.pos, vel: sh.vel, g, align: 'down', trail: { size: 0.9, fire: true, every: 0.02 },
                ignoreHits: true,
                onUpdate: (pr) => {
                  if (pr.ignoreHits && pr.vel.y < 0 && Math.hypot(pr.pos.x - q.x, pr.pos.z - q.z) < 500) pr.ignoreHits = false;
                  if (!sh.wh && pr.vel.y < 0 && pr.pos.y - q.y < 260) { sh.wh = true; if (R() < 0.35) audio.whoosh(1.1); }
                  return true;
                },
                onHit: (qq) => { sh.done = true; st.hits++; A.blast(qq, 15 * S.r, 34 * S.v, { vap: 2 * S.r, crater: [4.5 * S.r, 1.8 * S.r], silent: R() > 0.35 }); fx.addShake(0.5); },
              });
            }
          }
          return this.t < salvos * 1.8 + T + 6;
        },
        dispose() { scene.remove(sea); sea.geometry.dispose(); sea.material.dispose(); for (const m of ships) { scene.remove(m); m.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } },
      });
      const gm = cineGame(A); if (!gm) return;
      const a0 = Math.atan2(-fromDir.z, -fromDir.x);
      const fleetCam = ship.clone().addScaledVector(across, 520).addScaledVector(fromDir, 260).add(v3(0, 70, 0));
      const impact = clearSpot(A, tgt.clone().add(v3(0, 8, 0)), { dist: 330, h: 140, a0: a0 + 0.5 });
      gm.cine.play([
        watch(fleetCam, ship.clone().add(v3(0, 40, 0)).addScaledVector(fromDir, -300), { dur: 2.4, fov: 48, caption: '함포 사격', smooth: 0.2 }),
        chase(() => (st.first ? st.first.pos : ship), () => (st.first ? st.first.vel : fromDir.clone().negate()), { back: 45, up: 10, side: 8, ahead: 120, dur: 2.6, fov: 58 }),
        watch(impact, tgt.clone().add(v3(0, 10, 0)), { dur: 3.6, fov: 50, ts: (u) => (u < 0.35 ? 1 : 0.5) }),
        orbit(tgt, { dist: 380, h: 170, a0: a0 - 0.3, a1: a0 + 0.4, dur: 5, look: 15, ts: 0.85 }),
      ]);
    },
  },
};
