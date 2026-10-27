// v1.5 새 무기 (특수·놀이·괴수)
// 지구 자전 정지, 자기장 폭주, 엔트로피 가속, 물질 액화, 복셀 분해 / 거대 젠가, 거대 지우개, 거대 팽이, 거대 축구공, 장난감 블록 낙하
import * as THREE from 'three';
import { makeTop, makeSoccer, makeEraser, makeBlock, BLOCK_COLS, makeMagCore, makeScrapBall, glow, std } from './models4.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';
import { fxBlast, over, mapPoint, flood, liftAll, copies } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';
import { funScale } from './defs.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const UP = v3(0, 1, 0);
const sideOf = (f) => v3(-f.z, 0, f.x);
const hitB = (hit) => hit && hit.info && (hit.info.b || (hit.info.chunk && hit.info.chunk.b));
const disposeObj = (scene, o) => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); }); };
const RUST = new THREE.Color(0x6e4a30), CYAN = new THREE.Color(0x3fe6ff), MOLTEN = new THREE.Color(0xff7a2a);
const GROUP_NORMAL = (0x0001 << 16) | 0xffff;
function nearestIntact(D, x, z, r = 90) {
  let best = null, bd = 1e9;
  for (const b of D.buildingsNear(x, z, r)) { if (b.state !== 'intact') continue; const d = Math.hypot(b.cx - x, b.cz - z); if (d < bd) { bd = d; best = b; } }
  return best;
}
const clampMap = (grid, p, m = 0.9) => { const h = grid.span / 2 * m; p.x = Math.max(-h, Math.min(h, p.x)); p.z = Math.max(-h, Math.min(h, p.z)); return p; };

export const NEW5 = {
  // ---- 지구 자전 정지: 땅은 멈추고 그 위의 모든 것이 관성으로 한쪽으로 날아감 ----
  spinstop: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), dir = sideOf(f);          // 화면 가로로 날아가게
      const R0 = S.P >= 75 ? grid.span * 0.75 : 130 * S.r ** 0.8, T0 = 1.8;
      audio.rumble(T0 + 4); audio.wind(8);
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          if (this.t < T0) { fx.addShake(dt * 1.2); D.quake(c.x, c.z, R0, 0.3, dt); return true; }
          const u = Math.min(1, (this.t - T0) / 1.2);
          const cur = R0 * u;
          // 중심에서 바깥으로 차례로 뜯겨 나감
          if (this.k < 12) {
            this.k++;
            for (const ch of D.gather(c.x, c.z, cur, 1)) {
              if (ch.state === 1 && ch.spun) continue;
              const pos = D.chunkPos(ch);
              const h = Math.max(0, pos.y - grid.sample(pos.x, pos.z));
              const sp = (35 + 45 * Math.min(1, h / 60)) * S.v * (0.8 + R() * 0.4);
              if (D.launch(ch, dir.x * sp, 4 + R() * 8, dir.z * sp, 1.5)) ch.spun = true;
            }
            world.blastTrees(c.x, c.z, cur, cur);
          }
          for (let i = 0; i < 10; i++) { const a = R() * 6.28, d = R() * cur; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.smoke.emit(x, grid.sample(x, z) + 2, z, dir.x * 60, 3, dir.z * 60, 4, 6, 22, [0.62, 0.58, 0.52, 0.55], [0.6, 0.58, 0.55, 0], 0.15, 0.4); }
          return this.t < T0 + 5;
        },
      });
      const g = cineGame(A); if (!g) return;
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.8 - 120).add(v3(0, 50, 0)), c.clone().add(v3(0, 20, 0)), { dur: T0 + 0.4, fov: 55, caption: '지구 자전 정지' }),
        watch(c.clone().addScaledVector(f, -R0 * 1.5 - 90).addScaledVector(dir, R0 * 0.8).add(v3(0, 35, 0)), () => c.clone().addScaledVector(dir, R0 * 0.9).add(v3(0, 25, 0)), { dur: 5, fov: 62, ts: 0.55, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 자기장 폭주: 철골 조각이 공중의 한 점으로 끌려가 거대한 금속 덩어리가 되어 떨어짐 ----
  magnet: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const R0 = 110 * S.r ** 0.8;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const core = c.clone().add(v3(0, 60 + R0 * 0.5, 0));
      const mag = A.spawn(makeMagCore(), 8); mag.position.copy(core);
      const ball = makeScrapBall(); ball.position.copy(core); ball.scale.setScalar(0.1); scene.add(ball);
      let vol = 0, rc = 3;
      const T = 9;
      const st = { ballPos: core.clone() };
      audio.hum(T); audio.charge(2);
      A.addActive({
        t: 0, acc: 0, dropped: false,
        update(dt) {
          this.t += dt;
          mag.rotation.x += dt * 1.3; mag.rotation.y += dt * 2;
          mag.scale.setScalar(8 + rc * 0.6 + Math.sin(this.t * 20) * 0.6);
          fx.light(core.x, core.y, core.z, 6000, R0 * 3, 0.05, 0x8fc8ff);
          if (this.t < T) {
            this.acc += dt;
            if (this.acc > 0.15) {
              this.acc = 0;
              for (const ch of D.gather(c.x, c.z, R0 * Math.min(1, 0.4 + this.t / T), 1)) {
                const pos = D.chunkPos(ch);
                const d = core.distanceTo(pos);
                if (d < rc + ch.size) { D.removeChunk(ch); vol += ch.vol || 1; continue; }
                if (R() > 0.35) continue;
                const sp = 18 + 30 * (1 - Math.min(1, d / R0));
                const v = core.clone().sub(pos).normalize().multiplyScalar(sp);
                if (D.launch(ch, v.x, v.y, v.z, 2)) ch.body.setGravityScale(0, true);
              }
              // 이미 끌려오는 파편이 핵에 닿으면 흡수
              for (const ch of D.loose) { if (ch.state !== 1) continue; if (Math.hypot(ch.x - core.x, ch.y - core.y, ch.z - core.z) < rc + 2) { D.removeChunk(ch); vol += ch.vol || 1; } }
              rc = 3 + Math.cbrt(vol) * 0.9;
              ball.scale.setScalar(rc);
              if (R() < 0.5) fx.sparks(core, UP, 8);
            }
            return true;
          }
          if (!this.dropped) {
            this.dropped = true; A.remove(mag); scene.remove(ball);
            for (const ch of D.loose) if (ch.state === 1 && ch.body.gravityScale && ch.body.gravityScale() === 0) ch.body.setGravityScale(1, true);
            const rd = v3(R() - 0.5, 0, R() - 0.5).normalize();
            this.ball = D.addBall(core, v3(rd.x * 18, -5, rd.z * 18), rc, ball, { life: 40, onHit: () => { fx.addShake(1.2); A.ctx.audio.thud(); } });
            this.rollT = 0;
            audio.whoosh(2);
          }
          // 굴러다니다 (자기 펄스로 방향이 바뀜) 마지막에 자기장이 반전되며 튕겨 나감
          const bl = this.ball;
          if (bl && D.balls.includes(bl)) {
            this.rollT += dt;
            const v = bl.body.linvel(), p0 = bl.body.translation();
            st.ballPos.set(p0.x, p0.y, p0.z);
            if (this.rollT < 8) {
              if (R() < dt * 0.9) { const a = R() * 6.28; bl.body.setLinvel({ x: v.x * 0.4 + Math.cos(a) * 22, y: v.y, z: v.z * 0.4 + Math.sin(a) * 22 }, true); fx.ring(st.ballPos, rc * 3, 0.6, 0x8fc8ff, 0.5); audio.hum(0.5); }
            } else if (!this.flung) {
              this.flung = true;
              const out = v3(p0.x - c.x, 0, p0.z - c.z); if (out.lengthSq() < 1) out.set(1, 0, 0); out.normalize();
              bl.body.setLinvel({ x: out.x * 120, y: 30, z: out.z * 120 }, true);
              fx.ring(st.ballPos, rc * 8, 1, 0xbfe0ff, 0.7); fx.flash = Math.max(fx.flash, 0.2); audio.boom(2.5, 60); audio.whoosh(2);
            }
          }
          return this.t < T + 14;
        },
        dispose() { A.remove(mag); if (!this.dropped) scene.remove(ball); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.6 - 120).addScaledVector(sd, 60).add(v3(0, 30, 0)), core, { dur: 5, fov: 58, caption: '자기장 폭주', smooth: 0.3 }),
        watch(c.clone().addScaledVector(f, -R0 * 1.2 - 80).addScaledVector(sd, -R0 * 0.6).add(v3(0, 50, 0)), core, { dur: T - 5 + 0.3, fov: 55, smooth: 0.3 }),
        watch(c.clone().addScaledVector(f, -R0 * 1.4 - 100).add(v3(0, 25, 0)), () => st.ballPos, { dur: 3, fov: 58, ts: 0.6, smooth: 0.3 }),
        chase(() => st.ballPos, () => { const b = st.ballPos.clone().sub(c).setY(0); return b.lengthSq() > 1 ? b : f; }, { back: 70, up: 30, side: 30, ahead: 20, dur: 9, fov: 60, smooth: 0.25 }),
      ]);
    },
  },

  // ---- 엔트로피 가속: 시간이 수백 년 빨리 흘러 건물이 녹슬고 풍화돼 무너짐 ----
  entropy: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 120 * S.r ** 0.8, T = 12;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glow(0xc8a060, 0)); dome.position.copy(c); dome.scale.setScalar(R0); scene.add(dome);
      const blds = D.buildingsNear(c.x, c.z, R0).filter(b => Math.hypot(b.cx - c.x, b.cz - c.z) < R0).map(b => [b, 2 + R() * (T - 4)]);
      audio.rewind(T); audio.wind(T);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const on = Math.min(1, this.t / 1) * Math.min(1, (T + 1 - this.t));
          dome.material.opacity = 0.16 * on * (0.75 + 0.25 * Math.sin(this.t * 14));
          // 낮과 밤이 빠르게 바뀌는 깜빡임
          fx.light(c.x, c.y + R0, c.z, 3000 * (0.5 + 0.5 * Math.sin(this.t * 9)), R0 * 3, 0.05, 0xffe0b0);
          this.acc += dt;
          if (this.acc > 0.3 && this.t < T) {
            this.acc = 0;
            for (const [b] of blds) if (b.state === 'intact') D.tint(b, RUST, 0.06);
            world.paintScorch(c.x, c.z, R0, 0.05);
            if (this.t > 3) world.blastTrees(c.x, c.z, R0 * Math.min(1, this.t / T), 0);
            { const a = R() * 6.28, d = R() * R0 * 0.6; D.burn(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, R0 * 0.4, 0.8); }
          }
          for (const it of blds) {
            if (it[1] < 0 || this.t < it[1]) continue;
            const b = it[0]; it[1] = -1;
            if (b.state === 'intact') { D.flatten(b, 0.7 + R() * 0.3, R() - 0.5, R() - 0.5, 4 + R() * 3); if (R() < 0.6) fx.collapseDust(b); audio.crumble(30); }
          }
          return this.t < T + 1;
        },
        dispose() { disposeObj(scene, dome); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.5 - 100).add(v3(0, 35, 0)), c.clone().add(v3(0, 25, 0)), { dur: 5, fov: 55, caption: '엔트로피 가속', smooth: 0.3 }),
        orbit(c, { dist: R0 * 1.4 + 80, h: 50 + R0 * 0.3, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.9, dur: 7, fov: 55, look: 15 }),
      ]);
    },
  },

  // ---- 물질 액화: 건물이 녹아 흘러내려 웅덩이로 번짐 ----
  melt: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 90 * S.r ** 0.8;
      const blds = D.buildingsNear(c.x, c.z, R0).map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).filter(x => x[0] < R0).sort((a, b) => a[0] - b[0]).slice(0, 60);
      const pools = [];
      let k = 0;
      audio.hum(10);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          while (k < blds.length && blds[k][0] <= R0 * Math.min(1, this.t / 6)) {
            const b = blds[k++][1];
            if (b.state !== 'intact') continue;
            D.tint(b, MOLTEN, 0.35);
            D.flatten(b, 1, R() - 0.5, R() - 0.5, 5 + R() * 2);
            const ext = Math.max(b.maxx - b.minx, b.maxz - b.minz);
            const pm = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshStandardMaterial({ color: b.col.clone().lerp(MOLTEN, 0.3), roughness: 0.08, metalness: 0.4, emissive: 0x401000 }));
            pm.rotation.x = -Math.PI / 2; pm.position.set(b.cx, b.baseY + 0.4, b.cz); pm.scale.setScalar(0.1); pm.renderOrder = 2; scene.add(pm);
            pools.push({ m: pm, b, t: 0, R: ext * (0.8 + 0.4 * Math.min(2, b.height / 30)) });
          }
          for (const pl of pools) {
            pl.t += dt;
            const u = Math.min(1, pl.t / 6);
            pl.m.scale.setScalar(pl.R * u);
            if (u < 1 && R() < 0.6) { const b = pl.b; fx.fire.emit(b.cx + (R() - 0.5) * 10, b.baseY + R() * b.height * (1 - u), b.cz + (R() - 0.5) * 10, 0, -4, 0, 1, 2, 0.8, [1, 0.6, 0.25, 0.9], [0.8, 0.2, 0.02, 0], 0.4, -3); }
          }
          return this.t < 14;
        },
        dispose() { for (const pl of pools) disposeObj(scene, pl.m); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.3 - 80).addScaledVector(sd, 40).add(v3(0, 28, 0)), c.clone().add(v3(0, 15, 0)), { dur: 6, fov: 55, caption: '물질 액화', smooth: 0.3 }),
        orbit(c, { dist: R0 * 1.5 + 90, h: 60, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.7, dur: 5, fov: 55 }),
      ]);
    },
  },

  // ---- 복셀 분해: 위에서 내려오는 격자면을 지나는 순간 건물이 블록으로 흩어짐 ----
  voxel: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const R0 = 100 * S.r ** 0.8, T = 7;
      const blds = D.buildingsNear(c.x, c.z, R0);
      let top = c.y + 30; for (const b of blds) top = Math.max(top, b.baseY + b.height + 5);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(R0 * 2, R0 * 2, 24, 24), new THREE.MeshBasicMaterial({ color: 0x3fe6ff, wireframe: true, transparent: true, opacity: 0.6, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2; scene.add(plane);
      const tinted = new Set();
      audio.buzz(T); audio.charge(1);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T), y = top - (top - c.y) * u;
          plane.position.set(c.x, y, c.z); plane.material.opacity = 0.6 * Math.min(1, (T + 0.5 - this.t) * 2);
          this.acc += dt;
          if (this.acc > 0.1 && u < 1) {
            this.acc = 0;
            for (const ch of D.gather(c.x, c.z, R0, 1)) {
              const pos = D.chunkPos(ch);
              if (pos.y < y || ch.state !== 0) continue;
              if (ch.b && !tinted.has(ch.b)) { tinted.add(ch.b); D.tint(ch.b, CYAN, 0.45); }
              if (D.launch(ch, (pos.x - c.x) * 0.06 + (R() - 0.5) * 6, 6 + R() * 10, (pos.z - c.z) * 0.06 + (R() - 0.5) * 6, 3)) { ch.body.setGravityScale(0.25, true); if (R() < 0.3) fx.sparks(pos, UP, 2); }
            }
          }
          if (u >= 1 && !this.done) { this.done = true; for (const ch of D.loose) if (ch.state === 1 && ch.body.gravityScale() === 0.25) ch.body.setGravityScale(1, true); }
          return this.t < T + 0.6;
        },
        dispose() { disposeObj(scene, plane); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 1.6 - 90).addScaledVector(sd, 50).add(v3(0, (top - c.y) * 0.5 + 20, 0)), c.clone().add(v3(0, (top - c.y) * 0.45, 0)), { dur: T * 0.6, fov: 58, caption: '복셀 분해', smooth: 0.3 }),
        orbit(c, { dist: R0 * 1.5 + 100, h: (top - c.y) * 0.6 + 30, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.7, dur: T * 0.4 + 3, fov: 58, look: 20 }),
      ]);
    },
  },

  // ---- 거대 젠가: 건물 층이 하나씩 옆으로 빠지다가 와르르 무너짐 ----
  jenga: {
    fire(A, hit) {
      const p = hit.point, { D, fx, audio, camera } = A.ctx;
      const G = funScale(A);
      const first = (hitB(hit) && hitB(hit).state === 'intact' ? hitB(hit) : null) || nearestIntact(D, p.x, p.z, 120);
      if (!first) return;
      const n = G.giant ? Math.min(6, 1 + Math.round(G.size * 0.5)) : 1;
      const list = [first, ...D.buildingsNear(first.cx, first.cz, 120).filter(b => b !== first && b.state === 'intact').slice(0, n - 1)];
      const f = camDir(camera, v3(first.cx, first.baseY, first.cz)), sd = sideOf(f);
      for (const b of list) D.fracture(b, 0);
      const pulls = Math.max(3, Math.min(6, Math.round(2 + G.hit)));
      audio.charge(1);
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          while (this.k < pulls && this.t > 1 + this.k * 1.1) {
            this.k++;
            for (const b of list) {
              if (b.state !== 'fractured') continue;
              const fix = b.chunks.filter(c => c.state === 0);
              if (!fix.length) continue;
              const ks = [...new Set(fix.map(c => c.k))].sort((a, c) => a - c);
              if (ks.length < 3) continue;
              const layer = ks[1 + Math.floor(R() * (ks.length - 2))];
              const s = (R() < 0.5 ? 1 : -1);
              for (const c of fix) if (c.k === layer) D.launch(c, sd.x * s * 22 * G.pw, 1, sd.z * s * 22 * G.pw, 0.3);
              fx.dust(v3(b.cx, b.baseY + 3, b.cz), 4); audio.crumble(25);
            }
          }
          return this.t < 1 + pulls * 1.1 + 2;
        },
      });
      const g = cineGame(A); if (!g) return;
      const ctr = v3(first.cx, first.baseY, first.cz), H = first.height;
      g.cine.play([
        orbit(ctr, { dist: H * 1.3 + 50, h: H * 0.6, a0: Math.atan2(-f.z, -f.x) + 0.25, a1: Math.atan2(-f.z, -f.x) - 0.35, dur: 1 + pulls * 1.1 + 2, fov: 55, look: H * 0.4, caption: '거대 젠가', ts: 0.85 }),
      ]);
    },
  },

  // ---- 거대 지우개: 누르고 끄는 대로 도시가 지워짐 ----
  eraser: {
    holdStart(A, hit) {
      const G = funScale(A);
      const w = 14 * G.size;
      const m = A.spawn(makeEraser(), w);
      const p = hit ? hit.point : { x: 0, y: 0, z: 0 };
      m.position.set(p.x, p.y + w, p.z);
      A.ctx.audio.buzz(1);
      return { m, w, G, pos: v3(p.x, p.y, p.z), t: 0, acc: 0 };
    },
    holdUpdate(A, st, dt, aim) {
      const { D, fx, grid, world, audio } = A.ctx;
      st.t += dt;
      if (aim) st.pos.lerp(v3(aim.x, aim.y, aim.z), Math.min(1, dt * 6));
      const rub = Math.sin(st.t * 14) * st.w * 0.4;
      const x = st.pos.x + rub, z = st.pos.z;
      const gy = grid.sample(x, z);
      st.m.position.set(x, gy + st.w * 0.35, z); st.m.rotation.y = 0.3;
      D.laser(x, z, st.w * 0.9, dt);
      for (const b of D.buildingsNear(x, z, st.w * 0.7)) if (b.state === 'intact' && Math.hypot(b.cx - x, b.cz - z) < st.w * 0.6) D.vaporizeBuilding(b);
      st.acc += dt;
      if (st.acc > 0.1) { st.acc = 0; world.paintFrost(x, z, st.w * 1.1, 0.5); world.blastTrees(x, z, st.w, st.w); audio.crumble(4); }
      for (let i = 0; i < 4; i++) fx.smoke.emit(x + (R() - 0.5) * st.w * 2, gy + 1, z + (R() - 0.5) * st.w, (R() - 0.5) * 8, 3 + R() * 4, (R() - 0.5) * 8, 1.4, st.w * 0.08, st.w * 0.05, [0.95, 0.66, 0.74, 1], [0.9, 0.6, 0.7, 0], 1.5, -10);
    },
    holdEnd(A, st) { A.remove(st.m); },
  },

  // ---- 거대 팽이: 떨어져 돌며 거리를 튕겨 다니다 쓰러짐 ----
  top: {
    fire(A, hit) {
      const p = hit.point, { D, fx, audio, grid, camera } = A.ctx;
      const G = funScale(A);
      const rt = 9 * G.size;
      const m = A.spawn(makeTop(), rt);
      const pos = v3(p.x, grid.sample(p.x, p.z) + 300, p.z);
      const vel = v3(R() - 0.5, 0, R() - 0.5).normalize().multiplyScalar(14 * G.pw);
      const hitSet = new Map();
      const T = 12;
      const st = { pos, landed: false, tilt: 0, done: false };
      const se = A.summon(m);
      audio.whoosh(2);
      A.addActive({
        t: 0, acc: 0, spin: 0,
        update(dt) {
          if (se.captured) return !se.gone;
          this.t += dt;
          this.spin += dt * 18;
          const gy = grid.sample(pos.x, pos.z);
          if (!st.landed) {
            pos.y -= dt * 220;
            if (pos.y <= gy) { pos.y = gy; st.landed = true; A.blast(pos, rt * 1.5, 30 * G.pw, { lift: 0.5, silent: false }); fx.addShake(1.2); }
          } else if (this.t < T) {
            vel.applyAxisAngle(UP, (R() - 0.5) * dt * 2);
            pos.addScaledVector(vel, dt); clampMap(grid, pos, 0.92); pos.y = grid.sample(pos.x, pos.z);
            st.tilt = 0.05 + Math.max(0, (this.t - T + 4) / 4) * 0.5;
            for (const b of D.buildingsNear(pos.x, pos.z, rt)) {
              if (b.state === 'gone') continue;
              const last = hitSet.get(b) || -9; if (this.t - last < 0.6) continue;
              hitSet.set(b, this.t);
              D.blastFrom(b, pos, 28 * G.pw, { lift: 0.2, lod: 1 });
              fx.sparks(v3(pos.x, pos.y + rt * 0.5, pos.z), UP, 14); audio.crumble(15);
              const away = v3(pos.x - b.cx, 0, pos.z - b.cz).normalize();
              vel.reflect(away.multiplyScalar(-1)).normalize().multiplyScalar(14 * G.pw);
            }
            this.acc += dt;
            if (this.acc > 0.25) { this.acc = 0; D.explode({ x: pos.x, y: pos.y + 2, z: pos.z, r: rt * 1.1, power: 14 * G.pw, lift: 0.3, lod: 2 }); A.ctx.world.blastTrees(pos.x, pos.z, rt, rt); fx.dust(pos, rt * 0.4); }
          } else if (!st.done) {
            st.done = true;
            A.blast(pos.clone().addScaledVector(vel.clone().normalize(), rt), rt * 1.6, 30 * G.pw, { lift: 0.4 });
            fx.addShake(1); audio.thud();
          }
          m.position.copy(pos);
          m.rotation.set(0, 0, 0);
          m.rotateOnWorldAxis(sideOf(vel.clone().normalize()), st.done ? 1.35 : st.tilt * Math.sin(this.t * 3));
          m.rotateY(st.done ? 0 : this.spin);
          return this.t < T + 3;
        },
        dispose() { A.remove(m); },
      });
      const g = cineGame(A); if (!g) return;
      g.cine.play([
        watch(v3(p.x, grid.sample(p.x, p.z), p.z).addScaledVector(camDir(camera, v3(p.x, p.y, p.z)), -rt * 10 - 60).add(v3(0, rt * 2 + 20, 0)), () => pos.clone().add(v3(0, rt * 0.5, 0)), { dur: 4, fov: 55, caption: '거대 팽이', smooth: 0.3 }),
        chase(() => pos, () => vel, { back: rt * 7 + 30, up: rt * 2.5 + 10, side: rt * 3, ahead: 0, dur: 6, fov: 58, smooth: 0.25 }),
      ]);
    },
  },

  // ---- 거대 축구공: 공중으로 차올린 공이 튕기며 연쇄로 부숨 ----
  soccer: {
    fire(A, hit, cam) {
      const p = hit.point, { D, fx, audio, scene, camera } = A.ctx;
      const G = funScale(A);
      const r = 6 * G.size;
      const kicks = A.S.P >= 10 ? 2 : 1;
      const balls = [];
      const kick = (tgt) => {
        const from = cam.clone().add(v3(0, 25, 0));
        const tf = 2.4, g = 9.81;
        const vel = tgt.clone().sub(from).divideScalar(tf); vel.y += 0.5 * g * tf;
        vel.multiplyScalar(1 + 0.15 * G.pw);
        const m = makeSoccer(); m.scale.setScalar(r); m.castShadow = true; scene.add(m);
        const b = D.addBall(from, vel, r, m, { life: 25, onHit: () => { fx.addShake(0.6); audio.thud(); } });
        balls.push(b);
      };
      kick(v3(p.x, p.y, p.z));
      if (kicks > 1) A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t > 3) { kick(v3(p.x + (R() - 0.5) * 80, p.y, p.z + (R() - 0.5) * 80)); return false; } return true; } });
      audio.thud(); audio.whoosh(2);
      const g = cineGame(A); if (!g) return;
      const bpos = () => { const t = balls[0] && balls[0].body.translation(); return t ? v3(t.x, t.y, t.z) : v3(p.x, p.y, p.z); };
      const bvel = () => { const v = balls[0] && balls[0].body.linvel(); return v ? v3(v.x, 0, v.z) : camDir(camera, v3(p.x, p.y, p.z)); };
      g.cine.play([
        chase(bpos, bvel, { back: r * 6 + 30, up: r * 2 + 8, side: r * 2, ahead: 40, dur: 3.5, fov: 60, caption: '거대 축구공', smooth: 0.15 }),
        watch(v3(p.x, p.y, p.z).addScaledVector(sideOf(camDir(camera, v3(p.x, p.y, p.z))), r * 12 + 90).add(v3(0, r * 3 + 25, 0)), bpos, { dur: 5, fov: 58, ts: 0.6, smooth: 0.25 }),
      ]);
    },
  },

  // ---- 장난감 블록 낙하: 알록달록한 거대 블록이 쏟아져 쌓이고 튕김 (실제 물리) ----
  blocks: {
    fire(A, hit) {
      const p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const G = funScale(A);
      const n = Math.min(40, Math.round(8 + 6 * A.S.n ** 0.6));
      const R0 = 40 + 20 * G.size;
      const list = [];
      let spawned = 0;
      audio.whoosh(3);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          this.acc += dt;
          while (spawned < n && this.acc > 0.18) {
            this.acc -= 0.18; spawned++;
            const kind = Math.floor(R() * 3), s = (6 + R() * 8) * Math.max(0.6, G.size * 0.6);
            const m = makeBlock(kind, BLOCK_COLS[Math.floor(R() * BLOCK_COLS.length)]); m.scale.setScalar(s); scene.add(m);
            const a = R() * 6.28, d = Math.sqrt(R()) * R0;
            const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = grid.sample(x, z) + 160 + R() * 140;
            const body = D.phys.chunk(x, y, z, { box: [s / 2, s / 2, s / 2, 0, 0, 0, 1] }, 0.55, GROUP_NORMAL, 0.55 * s * s * s);
            body.setDynamic(true); body.setLinvel({ x: (R() - 0.5) * 6, y: -30, z: (R() - 0.5) * 6 });
            body.applyTorqueImpulse({ x: (R() - 0.5) * s ** 4, y: (R() - 0.5) * s ** 4, z: (R() - 0.5) * s ** 4 });
            list.push({ m, body, s, pv: 30, hits: 0, e: A.summon(m) });
          }
          for (const it of list) {
            if (it.e.captured) { if (it.body.alive) D.phys.remove(it.body); continue; }
            if (!it.body.alive) continue;
            const t = it.body.translation(), q = it.body.rotation(), v = it.body.linvel();
            it.m.position.set(t.x, t.y, t.z); it.m.quaternion.set(q.x, q.y, q.z, q.w);
            const sp = Math.hypot(v.x, v.y, v.z);
            // 세게 부딪히면 주변 건물이 부서짐
            if (it.pv > 14 && sp < it.pv * 0.55 && it.hits < 3) {
              it.hits++;
              D.explode({ x: t.x, y: t.y, z: t.z, r: it.s * 1.4, power: 12 + it.pv * 0.6 * G.pw, lift: 0.2, lod: 1 });
              fx.dust(v3(t.x, t.y - it.s * 0.4, t.z), it.s * 0.6); audio.thud();
            }
            it.pv = sp;
          }
          return this.t < 40;
        },
        dispose() { for (const it of list) { scene.remove(it.m); it.m.geometry.dispose(); it.m.material.dispose(); if (it.body.alive) D.phys.remove(it.body); } },
      });
      const g = cineGame(A); if (!g) return;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z), f = camDir(camera, c), sd = sideOf(f);
      g.cine.play([
        watch(c.clone().addScaledVector(f, -R0 * 2.5 - 90).addScaledVector(sd, 40).add(v3(0, 30, 0)), c.clone().add(v3(0, 50, 0)), { dur: 4, fov: 58, caption: '장난감 블록 낙하', smooth: 0.3 }),
        orbit(c, { dist: R0 * 2.2 + 80, h: 45, a0: Math.atan2(-f.z, -f.x), a1: Math.atan2(-f.z, -f.x) + 0.6, dur: 5, fov: 55, look: 10 }),
      ]);
    },
  },
};

export const NEW5_ENDINGS = {
  spinstop: (A, c) => {
    // 지도 위 모든 것이 한쪽으로 쓸려 날아가고, 지평선 너머까지 휩쓸림
    const { D, camera, fx, grid, world, audio } = A.ctx;
    const dir = sideOf(camDir(camera, c));
    const half = grid.span / 2;
    for (const b of D.buildings) {
      if (b.state !== 'intact') continue;
      const up = (b.cx - c.x) * -dir.x + (b.cz - c.z) * -dir.z;            // 바람 위쪽부터
      D.fling(b, dir.x * (60 + R() * 40), 6 + R() * 10, dir.z * (60 + R() * 40), 5 + R() * 2, Math.max(0, (up + half) / (half * 2)) * 2.5 + R() * 0.6);
    }
    for (const ch of D.loose) if (ch.state !== 3) D.launch(ch, dir.x * 140, 15, dir.z * 140, 1);
    world.blastTrees(c.x, c.z, grid.span, grid.span);
    crustCollapse(A, c, { level: 0.8, cracks: 8, dur: 10 });
    audio.wind(14); audio.rumble(12);
    // 지도를 가로지르는 거대한 먼지 폭풍
    A.addActive({ t: 0, update(dt) { this.t += dt; const n = Math.round(30 * A.ctx.quality.fxScale); for (let i = 0; i < n; i++) { const x = (R() * 2 - 1) * half * 1.2, z = (R() * 2 - 1) * half * 1.2; fx.smoke.emit(x, grid.sample(x, z) + 5 + R() * 120, z, dir.x * (120 + R() * 80), 4, dir.z * (120 + R() * 80), 4, 20, 70, [0.6, 0.55, 0.48, 0.6], [0.55, 0.52, 0.48, 0], 0.05, 0.3); } fx.addShake(dt * 0.8); return this.t < 12; } });
    worldEnd(A, c, 'dust', { delay: 1.5, waveSpeed: 3000, planetKind: 'shatter' });
  },

  magnet: (A, c) => { liftAll(A, c, 5); crustCollapse(A, c, { level: 0.8, cracks: 5 }); worldEnd(A, c, 'void', { delay: 5, planetKind: 'shatter' }); },
  entropy: (A, c) => { wipeMap(A, c, 'nuke', { dur: 12 }); A.ctx.world.blastTrees(c.x, c.z, A.ctx.grid.span, 0); worldEnd(A, c, 'dust', { delay: 4, planetKind: 'ash' }); },
  melt: (A, c) => { wipeMap(A, c, 'nuke', { dur: 10 }); flood(A, { dur: 14, color: 0x6a5a50, height: 0.3 }); worldEnd(A, c, 'fire', { delay: 4 }); },
  voxel: (A, c) => { wipeMap(A, c, 'void', { dur: 9 }); worldEnd(A, c, 'void', { delay: 3, planetKind: 'shatter' }); },
  jenga: (A, c) => { wipeMap(A, c, 'nuke', { dur: 8 }); crustCollapse(A, c, { level: 0.8, cracks: 6 }); worldEnd(A, c, 'crack', { delay: 4 }); },
  eraser: (A, c) => { wipeMap(A, c, 'void', { dur: 8 }); worldEnd(A, c, 'void', { delay: 2, planetKind: 'void' }); },
  top: (A, c) => { copies(A, 'top', 8, 4); crustCollapse(A, c, { level: 0.8, cracks: 6 }); worldEnd(A, c, 'impact', { delay: 5 }); },
  soccer: (A, c) => { copies(A, 'soccer', 30, 6); crustCollapse(A, c, { level: 0.8 }); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'impact', { delay: 4 }); },
  blocks: (A, c) => { copies(A, 'blocks', 6, 5); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'impact', { delay: 6 }); },
};
