// 기본 무기: 폭탄, 미사일, 궤도 레이저, 운석우, 지진, 철거 철구
import * as THREE from 'three';
import { makeBomb, makeMissile, makeMeteor, makeBall } from './models.js';
import { funScale } from './defs.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const beamCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
beamMat.userData.shared = beamCoreMat.userData.shared = true;

export const CLASSIC = {
  bomb: {
    fire(A, hit) {
      const S = A.S, p = hit.point;
      A.addProjectile({
        mesh: A.spawn(makeBomb(), 1.1 * Math.sqrt(S.r)), pos: v3(p.x + 8, p.y + 160, p.z + 4), vel: v3(-4, -45, -2), g: 30,
        align: 'down', trail: { size: 0.6 },
        onHit: (q) => A.blast(q, 26 * S.r, 34 * S.v, { vap: 3 * S.r, crater: [7 * S.r, 2.6 * S.r] }),
      });
      A.ctx.audio.whoosh(2.2);
    },
  },

  // 미사일: 지도 밖(수평선 쪽)에서 포물선을 그리며 날아와 꽂힘
  missile: {
    fire(A, hit, cam) {
      const S = A.S, p = hit.point, { grid } = A.ctx;
      const tgt = v3(p.x, p.y, p.z);
      const f = v3(p.x - cam.x, 0, p.z - cam.z); if (f.lengthSq() < 1) f.set(0, 0, -1); f.normalize();
      const side = v3(-f.z, 0, f.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      // 화면을 비스듬히 가로질러 오도록: 옆 + 약간 먼 쪽에서
      const dir = side.clone().multiplyScalar(0.85).addScaledVector(f, 0.5).normalize();
      const dist = Math.max(1100, grid.span * 0.55);
      const T = 2.6, g = 40;
      const from = tgt.clone().addScaledVector(dir, dist); from.y = Math.max(tgt.y, grid.sample(from.x, from.z)) + 140;
      const vel = v3((tgt.x - from.x) / T, (tgt.y - from.y + 0.5 * g * T * T) / T, (tgt.z - from.z) / T);
      A.addProjectile({
        mesh: A.spawn(makeMissile(), 3.2), pos: from, vel, g, align: 'fwd', trail: { size: 2.6, fire: true, every: 0.006 }, ignoreHits: true,
        onUpdate: (pr) => { if (pr.ignoreHits && pr.pos.distanceTo(tgt) < 260) pr.ignoreHits = false; A.ctx.fx.light(pr.pos.x, pr.pos.y, pr.pos.z, 6000, 120, 0.05, 0xffb060); return true; },
        onHit: (q) => A.blast(q, 18 * S.r, 42 * S.v, { vap: 2 * S.r, crater: [4.5 * S.r, 1.6 * S.r] }),
      });
      A.ctx.audio.whoosh(T);
    },
  },

  laser: {
    holdStart(A) { A.ctx.audio.laserStart(); return { t: 0, acc: 0, mesh: null }; },
    holdUpdate(A, L, dt, aim) {
      if (!aim) return;
      const { D, fx, world, scene, audio } = A.ctx;
      const S = A.S;
      L.t += dt; L.acc += dt;
      const r = 5 * S.r;
      const n = D.laser(aim.x, aim.z, r, dt);
      if (!L.mesh) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), beamMat), new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 12, 1, true), beamCoreMat));
        L.mesh = g; scene.add(g);
      }
      const top = aim.y + 1500;
      L.mesh.position.set(aim.x, (aim.y + top) / 2, aim.z);
      const w = r * (0.75 + 0.15 * Math.sin(L.t * 40));
      L.mesh.scale.set(w, top - aim.y, w);
      if (L.acc > 0.03) {
        L.acc = 0;
        fx.sparks({ x: aim.x, y: aim.y + 0.5, z: aim.z }, { x: 0, y: 1, z: 0 }, 5);
        fx.smoke.emit(aim.x, aim.y + 1, aim.z, (Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4, 3, r, r * 4, [0.1, 0.1, 0.1, 0.6], [0.3, 0.3, 0.3, 0], 0.5, 1);
        world.paintScorch(aim.x, aim.z, r * 1.2, 0.5);
        if (Math.random() < 0.3) world.blastTrees(aim.x, aim.z, r * 2, r);
        fx.light(aim.x, aim.y + 4, aim.z, 3000, 80, 0.1, 0xff4020);
      }
      fx.addShake(dt * 0.6);
      if (n > 2) audio.crumble(n);
    },
    holdEnd(A, L) {
      if (L.mesh) { A.ctx.scene.remove(L.mesh); L.mesh.children.forEach(c => c.geometry.dispose()); }
      A.ctx.audio.laserStop();
    },
  },

  meteor: {
    fire(A, hit) {
      const S = A.S, p = hit.point;
      const az = Math.random() * Math.PI * 2;
      const dirIn = v3(Math.cos(az) * 0.6, -1, Math.sin(az) * 0.6).normalize();
      const add = (target, size, delay, r, power) => {
        const start = v3(target.x, target.y, target.z).addScaledVector(dirIn, -520);
        A.addActive({
          t: 0, update(dt) {
            this.t += dt * 1000;
            if (this.t < delay) return true;
            A.addProjectile({
              mesh: A.spawn(makeMeteor(), size), pos: start, vel: dirIn.clone().multiplyScalar(160 + Math.random() * 40), align: null,
              trail: { size: size * 0.9, fire: true }, spin: true,
              onHit: (q) => A.blast(q, r, power, { vap: r * 0.25, crater: [r * 0.5, r * 0.22] }),
            });
            return false;
          },
        });
      };
      add(p, 7 * Math.sqrt(S.r), 0, 36 * S.r, 40 * S.v);
      const n = Math.round(8 * Math.sqrt(S.n));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 120 * S.r;
        add({ x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d }, 2 + Math.random() * 2.5, 300 + Math.random() * 2600, (12 + Math.random() * 6) * S.r, 30 * S.v);
      }
      A.ctx.audio.whoosh(3);
    },
  },

  quake: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, audio } = A.ctx;
      const R = 260 * S.r, I = 0.8 + 0.5 * S.v, dur = 8 * S.t;
      fx.ring(p, R, 1.6, 0xc9a27a, 0.35);
      audio.rumble(dur);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const k = Math.sin(Math.min(1, this.t / dur) * Math.PI);
          D.quake(p.x, p.z, R, I * (0.4 + k), dt);
          fx.addShake(dt * 3 * k);
          this.acc += dt;
          if (this.acc > 0.25) {
            this.acc = 0;
            const ang = Math.random() * 6.28, d = Math.random() * R * 0.8;
            const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
            fx.dust({ x, y: grid.sample(x, z), z }, 4);
            if (Math.random() < 0.3) fx.ring({ x: p.x, y: grid.sample(p.x, p.z), z: p.z }, R, 1.2, 0xb08a64, 0.2);
          }
          return this.t < dur;
        },
      });
    },
  },

  ball: {
    fire(A, hit, cam) {
      const S = A.S, p = hit.point, G = funScale(A);
      const r = 5 * (G.giant ? G.size : 1.1);
      const m = A.spawn(makeBall(), r);
      const from = cam.add(v3(0, -4, 0));
      const dir = v3(p.x, p.y + r, p.z).sub(from);
      const dist = dir.length(); dir.normalize();
      const sp = Math.min(160, (60 + dist * 0.12) * Math.sqrt(S.v));
      const tFlight = dist / sp;
      const vel = dir.multiplyScalar(sp); vel.y += 0.5 * 9.81 * tFlight;
      A.ctx.D.addBall(from, vel, r, m, { onHit: G.giant && G.size < 3 ? null : (b) => { const t = b && { x: b.cx, y: b.baseY + b.height * 0.4, z: b.cz }; if (t) A.blast(t, 6 * G.hit, 30 * G.pw, { vap: G.hit, silent: true, smokeColumn: false }); } });
      A.ctx.audio.whoosh(0.6);
    },
  },
};
