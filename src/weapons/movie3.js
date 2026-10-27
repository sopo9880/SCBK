// v1.7 영화 오마주: 초능력자 대결 — 자체 디자인한 두 초능력자가 건물 사이를 날며 싸움
import * as THREE from 'three';
import { cineGame, camDir } from './cam.js';
import { wipeMap, crustCollapse, worldEnd } from './apocalypse.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const UP = v3(0, 1, 0);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3, ...o });
const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const disposeObj = (scene, o) => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); }); };

// 사람 모양 초능력자 (키 약 2, 앞 = +Z). 망토 없음, 몸의 빛나는 줄무늬로 구분
function makeFlyer(suit, accent) {
  const g = new THREE.Group();
  const body = std(suit), acc = glow(accent, 0.95), skin = std(0xd8b090, { roughness: 0.7, metalness: 0 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 10), body); torso.position.y = 1.25; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin); head.position.y = 1.78; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1a1410)); hair.position.y = 1.8; g.add(hair);
  const eyes = [];
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glow(accent, 1)); e.position.set(s * 0.06, 1.8, 0.15); g.add(e); eyes.push(e); }
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 20), acc); stripe.rotation.x = Math.PI / 2; stripe.position.y = 1.3; g.add(stripe);
  const chest = new THREE.Mesh(new THREE.CircleGeometry(0.09, 3), acc); chest.position.set(0, 1.42, 0.265); g.add(chest);
  const limb = (r, L) => { const p = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, L, 4, 8), body); m.position.y = -L / 2 - r; p.add(m); return p; };
  const armL = limb(0.08, 0.55), armR = limb(0.08, 0.55), legL = limb(0.1, 0.7), legR = limb(0.1, 0.7);
  armL.position.set(-0.34, 1.55, 0); armR.position.set(0.34, 1.55, 0); legL.position.set(-0.13, 0.95, 0); legR.position.set(0.13, 0.95, 0);
  for (const fist of [armL, armR]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin); f.position.y = -0.82; fist.add(f); }
  g.add(armL, armR, legL, legR);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), glow(accent, 0.12)); aura.position.y = 1.2; aura.scale.set(0.6, 1.1, 0.6); g.add(aura);
  g.traverse(o => { if (o.isMesh && !o.material.blending) o.castShadow = true; });
  g.userData = { armL, armR, legL, legR, eyes, aura };
  return g;
}

export const MOVIE3 = {
  superfight: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, D, fx, grid, audio, camera, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sz = 9 * S.r ** 0.3;                       // 키 약 18m (도시 규모에 맞춘 연출 크기)
      const R0 = 150 * S.r ** 0.6, T = 20 * S.t;
      const cols = [[0x1e2c4a, 0x7fd8ff], [0x3a1414, 0xff5a3a]];
      const f0 = camDir(camera, c), sd0 = v3(-f0.z, 0, f0.x);
      const F = cols.map(([s, a], i) => {
        const m = makeFlyer(s, a); m.scale.setScalar(sz); scene.add(m);
        const pos = c.clone().addScaledVector(sd0, (i ? 1 : -1) * R0 * 0.6).add(v3(0, 50 + R() * 30, 0));
        return { m, pos, vel: v3(), accent: a, state: 'fly', t: 0, hit: new Set(), recover: 0 };
      });
      const beams = [];
      const st = { mid: c.clone().add(v3(0, 50, 0)), slow: 0, t: 0, nextLaser: 4 };
      const keepIn = (q) => { const d = Math.hypot(q.x - c.x, q.z - c.z); if (d > R0 * 1.3) { q.x = c.x + (q.x - c.x) / d * R0 * 1.3; q.z = c.z + (q.z - c.z) / d * R0 * 1.3; } const gy = grid.sample(q.x, q.z); if (q.y < gy + 4) q.y = gy + 4; if (q.y > gy + 220) q.y = gy + 220; return q; };
      const smash = (q, r, pw) => { D.explode({ x: q.x, y: q.y, z: q.z, r, power: pw, lift: 0.3, lod: 1 }); fx.dust(q, r * 0.5); };
      audio.roar(1.5); audio.whoosh(2);
      A.addActive({
        update(dt) {
          st.t += dt; st.slow = Math.max(0, st.slow - dt);
          const [a, b] = F;
          for (const [me, op] of [[a, b], [b, a]]) {
            me.t += dt;
            if (me.state === 'knock') {
              // 맞고 날아감: 지나는 건물을 뚫음
              me.pos.addScaledVector(me.vel, dt); me.vel.multiplyScalar(Math.exp(-dt * 0.8)); me.vel.y -= 9 * dt;
              const h = D.buildingsNear(me.pos.x, me.pos.z, sz * 1.2);
              for (const bd of h) { if (me.hit.has(bd) || bd.state === 'gone' || me.pos.y > bd.baseY + (bd.flatH || bd.height) + 4) continue; me.hit.add(bd); D.blastFrom(bd, me.pos.clone().addScaledVector(me.vel, -0.05), 35 * S.v, { lift: 0.2, lod: 1 }); audio.crumble(40); fx.addShake(0.6); }
              if (R() < 0.6) fx.smoke.emit(me.pos.x, me.pos.y, me.pos.z, 0, 2, 0, 2, sz * 0.4, sz * 1.5, [0.6, 0.58, 0.55, 0.6], [0.6, 0.6, 0.6, 0], 0.5, 0.3);
              const gy = grid.sample(me.pos.x, me.pos.z);
              if (me.pos.y <= gy + 2 || me.vel.length() < 25 || me.t > 2.2) { if (me.pos.y <= gy + 2) { smash(v3(me.pos.x, gy + 1, me.pos.z), sz * 2.2, 25); A.crater(me.pos.x, me.pos.z, sz * 1.2, sz * 0.3); } me.state = 'fly'; me.t = 0; me.recover = 0.8; me.hit.clear(); }
            } else {
              // 상대에게 돌진 (곡선을 그리며)
              me.recover = Math.max(0, me.recover - dt);
              const to = op.pos.clone().sub(me.pos); const d = to.length();
              const curve = v3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(st.t * 0.9 + (me === a ? 0 : 2)) * 30);
              const want = to.normalize().multiplyScalar(me.recover > 0 ? 20 : 95).add(curve).add(v3(0, Math.sin(st.t * 1.3 + (me === a ? 1 : 3)) * 12, 0));
              me.vel.lerp(want, Math.min(1, dt * 2.2));
              me.pos.addScaledVector(me.vel, dt);
              // 주먹 충돌
              if (d < sz * 2.2 && me.recover <= 0 && op.state !== 'knock' && me === a) {
                const winner = R() < 0.5 ? a : b, loser = winner === a ? b : a;
                const dirK = loser.pos.clone().sub(winner.pos).normalize().add(v3(0, -0.15 + R() * 0.3, 0)).normalize();
                loser.state = 'knock'; loser.t = 0; loser.vel.copy(dirK).multiplyScalar(190 * S.v ** 0.5);
                winner.vel.multiplyScalar(-0.2); winner.recover = 0.6;
                const q = a.pos.clone().lerp(b.pos, 0.5);
                fx.explosion(q, sz * 1.4, { smokeColumn: false }); fx.ring(q, sz * 10, 0.7, 0xffffff, 0.6, true); fx.flash = Math.max(fx.flash, 0.15);
                audio.boom(2.5, camera.position.distanceTo(q)); fx.addShake(1.5);
                D.ringPush(q, 0, sz * 12, 25, 0.3);
                st.slow = 0.6;
                winner.punch = 0.4;
              }
            }
            keepIn(me.pos);
            // 자세: 진행 방향으로 몸을 눕힘
            const v = me.state === 'knock' ? me.vel.clone().negate() : me.vel;
            const look = me.pos.clone().add(v.lengthSq() > 1 ? v.clone().setLength(10) : op.pos.clone().sub(me.pos).setLength(10));
            me.m.position.copy(me.pos); me.m.lookAt(look); me.m.rotateX(Math.min(1.3, v.length() / 80));
            const U = me.m.userData;
            me.punch = Math.max(0, (me.punch || 0) - dt);
            U.armR.rotation.x = me.punch > 0 ? -2.6 : -0.3 + 0.2 * Math.sin(st.t * 6);
            U.armL.rotation.x = -0.2 + 0.2 * Math.sin(st.t * 6 + 1);
            U.legL.rotation.x = 0.25 * Math.sin(st.t * 5); U.legR.rotation.x = -0.25 * Math.sin(st.t * 5);
            U.aura.material.opacity = 0.1 + 0.08 * Math.sin(st.t * 12);
          }
          // 눈 레이저: 한쪽이 상대(또는 그 뒤 건물)를 향해 쏘며 건물을 가름
          st.nextLaser -= dt;
          if (st.nextLaser <= 0 && st.t < T - 2) {
            st.nextLaser = 3 + R() * 2.5;
            const me = F[R() < 0.5 ? 0 : 1], op = me === F[0] ? F[1] : F[0];
            const from = me.pos.clone().add(v3(0, sz * 1.8, 0));
            const dir = op.pos.clone().sub(from).normalize();
            const end = from.clone().addScaledVector(dir, R0 * 2.2); end.y = Math.max(grid.sample(end.x, end.z), end.y);
            const col = me.accent;
            const beam = new THREE.Group();
            for (const s2 of [-1, 1]) { const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 6, 1, true), glow(col, 0.9)); bm.userData.off = s2; beam.add(bm); }
            scene.add(beam);
            beams.push({ beam, me, op, t: 0, sweep: (R() - 0.5) * 1.2 });
            audio.laserStart && audio.laserStart();
            st.slow = Math.max(st.slow, 0.3);
          }
          for (let i = beams.length - 1; i >= 0; i--) {
            const bm = beams[i]; bm.t += dt;
            const from = bm.me.pos.clone().add(v3(0, sz * 1.8, 0));
            const dir = bm.op.pos.clone().sub(from).normalize().applyAxisAngle(UP, bm.sweep * (bm.t - 0.6));
            const len = R0 * 2;
            const h2 = D.raycast(from, dir, len);
            const end = h2 ? h2.point : from.clone().addScaledVector(dir, len);
            bm.beam.children.forEach((m) => { const o = v3(-dir.z, 0, dir.x).multiplyScalar(m.userData.off * 0.4 * sz * 0.1); const a2 = from.clone().add(o); m.position.copy(a2).lerp(end, 0.5); m.scale.set(sz * 0.08, a2.distanceTo(end), sz * 0.08); m.quaternion.setFromUnitVectors(UP, end.clone().sub(a2).normalize()); });
            D.lineBlast(from.clone().addScaledVector(dir, sz * 3), v3(end.x, end.y, end.z), 3.5 * S.r ** 0.5, 30);
            if (h2) { fx.sparks(end, UP, 6); D.laser(end.x, end.z, 4 * S.r ** 0.5, dt); world.paintScorch(end.x, end.z, 6, 0.6); }
            if (bm.t > 1.3) { disposeObj(scene, bm.beam); beams.splice(i, 1); if (!beams.length && A.ctx.audio.laserStop) A.ctx.audio.laserStop(); }
          }
          st.mid.copy(F[0].pos).lerp(F[1].pos, 0.5);
          if (st.t > T) {
            // 마지막 일격: 땅으로 내리꽂힘
            const q = F[1].pos.clone(); const gy = grid.sample(q.x, q.z);
            A.blast(v3(q.x, gy, q.z), sz * 4, 45 * S.v, { crater: [sz * 2, sz * 0.8], lift: 0.6 }); fx.addShake(2);
            return false;
          }
          return true;
        },
        dispose() { for (const f of F) disposeObj(scene, f.m); for (const bm of beams) disposeObj(scene, bm.beam); if (A.ctx.audio.laserStop) A.ctx.audio.laserStop(); },
      });
      const g = cineGame(A); if (!g) return;
      // 둘 사이를 옆에서 따라가는 맞춤 샷 (부딪히는 순간은 슬로모션)
      const follow = (dur, sideK, caption) => ({
        dur, caption, cut: true,
        update: (t, u, out) => {
          const ab = F[1].pos.clone().sub(F[0].pos); const sep = ab.length();
          const perp = v3(-ab.z, 0, ab.x).normalize().multiplyScalar(sideK);
          out.look.copy(st.mid);
          out.pos.copy(st.mid).addScaledVector(perp, Math.max(60, sep * 1.1 + sz * 6)).add(v3(0, 18 + sep * 0.15, 0));
          out.fov = 58; out.smooth = 0.25; out.timeScale = st.slow > 0 ? 0.35 : 1;
        },
      });
      g.cine.play([follow(7, 1, '초능력자 대결'), follow(7, -1, ''), follow(Math.max(2, T - 13), 1, '')]);
    },
  },
};

export const MOVIE3_ENDINGS = {
  superfight: (A, c) => {
    // 싸움의 여파로 도시 전체가 무너짐
    const { fx } = A.ctx;
    fx.flash = Math.max(fx.flash, 0.5);
    crustCollapse(A, c, { level: 1, cracks: 10 });
    wipeMap(A, c, 'nuke', { dur: 6 });
    worldEnd(A, c, 'fire', { delay: 2, planetKind: 'shatter' });
  },
};
