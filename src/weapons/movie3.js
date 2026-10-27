// v1.7 영화 오마주: 초능력자 대결 — 자체 디자인한 두 초능력자가 건물 사이를 날며 싸움
import * as THREE from 'three';
import { cineGame, camDir } from './cam.js';
import { ease } from '../cinematic.js';
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
    // v1.9: 위력이 커져도 두 사람만 싸우고, 싸움의 규모(범위·충격·들어 올리는 것)가 커짐.
    // 정해진 순서의 기술(던지기, 건물 내려꽂기, 멱살 관통 질주, 지형 들어 올리기…)을 번갈아 씀
    fire(A, hit) {
      const S = A.S, P = S.P, p = hit.point, { scene, D, fx, grid, audio, camera, world, game } = A.ctx;
      const gnd = (x, z) => (game && game.groundAt ? game.groundAt(x, z) : grid.sample(x, z));
      const half = grid.span / 2;
      const c = v3(p.x, gnd(p.x, p.z), p.z);
      const big = P >= 75;
      const sz = 9 * S.r ** 0.3;                                    // 키 약 13~26m
      const R0 = Math.min(half * 0.94, Math.max(110 * S.r ** 1.1, big ? half * 0.8 : 0));   // 싸움 범위
      const imp = 12 * S.r;                                         // 한 방의 충격 반경 9 → 52
      const pw = 40 * S.v;
      const rr = 15 * S.r ** 1.2;                                   // 뜯어 올리는 땅 반경 11 → 87
      const maxH = P >= 40 ? 1e9 : P >= 5 ? 140 : 45;               // 들어 올릴 수 있는 건물 높이
      const nLift = P >= 75 ? 7 : P >= 25 ? 4 : P >= 5 ? 2 : 1;      // 한 번에 뽑는 건물 수
      const cols = [[0x1e2c4a, 0x7fd8ff], [0x3a1414, 0xff5a3a]];
      const f0 = camDir(camera, c), sd0 = v3(-f0.z, 0, f0.x);
      const F = cols.map(([su, ac], i) => {
        const m = makeFlyer(su, ac); m.scale.setScalar(sz); scene.add(m);
        const pos = c.clone().addScaledVector(sd0, (i ? 1 : -1) * Math.min(R0 * 0.6, 160)).add(v3(0, 45 + R() * 20, 0));
        return { m, pos, vel: v3(), accent: ac, state: 'fly', pose: 'fly', t: 0, hit: new Set(), recover: 0, face: null, punch: 0, free: false };
      });
      const st = { mid: c.clone().add(v3(0, 50, 0)), slow: 0, t: 0, done: false };
      const beams = [], rocks = [], held = [];
      const seenAll = new Set();
      const clampMap = (q) => { const L = half * 0.97; q.x = Math.max(-L, Math.min(L, q.x)); q.z = Math.max(-L, Math.min(L, q.z)); return q; };
      const keepUp = (q, h = 1) => { const gy = gnd(q.x, q.z); if (q.y < gy + h) q.y = gy + h; return q; };
      const ground = (q) => v3(q.x, gnd(q.x, q.z), q.z);
      const lerpV = (a, b, u) => a.clone().lerp(b, u);
      // 지나는 길의 건물을 뚫고 부숨
      const plough = (a, b, rad, power, seen = seenAll) => {
        if (a.distanceToSquared(b) < 0.01) return;
        D.lineBlast(a, b, rad, power * 0.6);
        const L = a.distanceTo(b);
        for (const bd of D.buildingsNear(b.x, b.z, rad + L * 0.5)) {
          if (seen.has(bd) || bd.state === 'gone') continue;
          const top = bd.baseY + (bd.state === 'flat' ? bd.flatH : bd.height);
          if (b.y > top + rad * 0.4 || b.y < bd.baseY - rad) continue;
          seen.add(bd);
          D.blastFrom(bd, a, power, { lift: 0.15, lod: 1 });
          fx.dust(b, rad * 0.7); audio.crumble(50); fx.addShake(0.5);
        }
        world.blastTrees(b.x, b.z, rad, rad);
        if (R() < 0.7) fx.smoke.emit(b.x, b.y, b.z, 0, 2, 0, 2, sz * 0.4, sz * 1.6, [0.6, 0.58, 0.55, 0.6], [0.6, 0.6, 0.6, 0], 0.5, 0.3);
      };
      // 큰 충격 (폭발 + 충격파 + 주변 건물 외벽)
      const shock = (q, r, power, o = {}) => {
        A.blast(q, r, power, { lift: o.lift ?? 0.5, crater: o.crater, smokeColumn: o.col, lod: 1 });
        fx.ring(ground(q).add(v3(0, 2, 0)), r * 4, 0.9, 0xffffff, 0.5);
        D.ringPush(q, r * 0.5, r * 5, 30 * S.v, 0.35);
        for (const bd of D.buildingsNear(q.x, q.z, r * 2.2)) if (bd.state === 'intact') D.blastFrom(bd, q, power * 0.5, { lift: 0.15, lod: 1 });
        fx.flash = Math.max(fx.flash, o.flash ?? 0.15); fx.addShake(o.shake ?? 1.6);
        audio.boom(2 + r / 30, camera.position.distanceTo(q));
        if (o.slow) st.slow = Math.max(st.slow, o.slow);
      };
      // 건물이 많은 방향 (멱살 질주·던지기·마무리)
      const densestDir = (from, len, minTop) => {
        let best = null, bn = -1e9;
        const toC = v3(c.x - from.x, 0, c.z - from.z); if (toC.lengthSq() > 1) toC.normalize();
        for (let k = 0; k < 16; k++) {
          const a = k / 16 * Math.PI * 2, d = v3(Math.sin(a), 0, Math.cos(a));
          let n = 0;
          for (let s2 = 20; s2 < len; s2 += 25) {
            const x = from.x + d.x * s2, z = from.z + d.z * s2;
            if (Math.abs(x) > half * 0.97 || Math.abs(z) > half * 0.97) { n -= 3; break; }
            for (const bd of D.buildingsNear(x, z, 6)) if (bd.state === 'intact' && bd.baseY + bd.height > gnd(x, z) + minTop) n++;
          }
          n += d.dot(toC) * 3;
          if (n > bn) { bn = n; best = d; }
        }
        return best || v3(1, 0, 0);
      };
      const pickBuildings = (q, rad, n) => {
        const list = D.buildingsNear(q.x, q.z, rad).filter(b => b.state === 'intact' && b.height > 8 && b.height <= maxH);
        if (!list.length) return [];
        list.sort((a, b) => (b.height - Math.hypot(b.cx - q.x, b.cz - q.z) * 0.15) - (a.height - Math.hypot(a.cx - q.x, a.cz - q.z) * 0.15));
        const B = list[0], out = [B];
        if (n > 1) {
          const near = list.filter(b => b !== B && Math.hypot(b.cx - B.cx, b.cz - B.cz) < Math.max(40, imp * 2)).sort((a, b) => Math.hypot(a.cx - B.cx, a.cz - B.cz) - Math.hypot(b.cx - B.cx, b.cz - B.cz));
          out.push(...near.slice(0, n - 1));
        }
        return out;
      };
      // 들고 다니는 묶음 (건물·바위). center 를 움직이고 rot 으로 돌림
      const makeHeld = (bs, center, mesh) => {
        const items = [];
        for (const b of bs) { const h = D.carryBuilding(b); if (h) items.push({ h, off: h.center.clone().sub(center) }); }
        const g = { items, center: center.clone(), rot: new THREE.Quaternion(), mesh, size: 0 };
        for (const b of bs) g.size = Math.max(g.size, b.height, b.maxx - b.minx, b.maxz - b.minz);
        g.apply = () => {
          for (const it of g.items) it.h.set(it.off.clone().applyQuaternion(g.rot).add(g.center), g.rot);
          if (g.mesh) { g.mesh.position.copy(g.center); g.mesh.quaternion.copy(g.rot); }
        };
        g.drop = () => { for (const it of g.items) it.h.drop(); g.items.length = 0; if (g.mesh) { disposeObj(scene, g.mesh); g.mesh = null; } const i = held.indexOf(g); if (i >= 0) held.splice(i, 1); };
        held.push(g);
        return g;
      };
      const makeRock = (r) => {
        const geo = new THREE.IcosahedronGeometry(r, 3);
        const pa = geo.attributes.position, colA = [];
        for (let i = 0; i < pa.count; i++) {
          let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
          const n = 1 + 0.18 * Math.sin(x * 0.21 + z * 0.13) * Math.cos(y * 0.17 + x * 0.05) + 0.1 * (R() - 0.5);
          x *= n; z *= n;
          if (y > 0) y *= 0.08; else y *= 1.05 * n;            // 윗면은 평평 (그 위에 건물), 아래는 뾰족한 흙덩이
          pa.setXYZ(i, x, y, z);
          const top = y > -r * 0.1;
          colA.push(...(top ? [0.36, 0.42, 0.26] : [0.36 + 0.06 * R(), 0.3, 0.24]));
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));
        m.castShadow = true; scene.add(m);
        return m;
      };
      const beamMesh = (col) => {
        const g = new THREE.Group();
        for (const s2 of [-1, 1]) { const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 6, 1, true), glow(col, 0.9)); bm.userData.off = s2; g.add(bm); }
        scene.add(g); return g;
      };
      const drawBeam = (g, from, end) => {
        const d = end.clone().sub(from); if (d.lengthSq() < 1e-6) return; const dn = d.clone().normalize();
        g.children.forEach((m) => { const o = v3(-dn.z, 0, dn.x).multiplyScalar(m.userData.off * 0.04 * sz); const a2 = from.clone().add(o); m.position.copy(a2).lerp(end, 0.5); m.scale.set(sz * 0.08, a2.distanceTo(end), sz * 0.08); m.quaternion.setFromUnitVectors(UP, end.clone().sub(a2).normalize()); });
      };
      const eyes = (f) => f.pos.clone().add(v3(0, sz * 1.8, 0));
      const hover = (f, t) => { f.pos.y += Math.sin(st.t * 1.7 + (f === F[0] ? 0 : 2)) * 0.15; };

      // ---------- 기술 ----------
      // 각 기술: { dur, cap, init(), step(t, dt), cam(t, out) } — X 가 공격, Y 가 당함
      const M = {
        clash(X, Y) {
          const m = {};
          return { dur: 2.8, cap: '정면 충돌', init() {
            m.a0 = X.pos.clone(); m.b0 = Y.pos.clone();
            m.mid = lerpV(X.pos, Y.pos, 0.5); keepUp(m.mid, 30 + imp * 0.4); clampMap(m.mid);
            const d = Y.pos.clone().sub(X.pos).setY(0); if (d.lengthSq() < 1) d.set(1, 0, 0); d.normalize(); m.d = d;
            X.pose = Y.pose = 'punch'; audio.whoosh(1.5);
          }, step(t, dt) {
            if (t < 1.4) { const u = ease.in(t / 1.4); X.pos.copy(lerpV(m.a0, m.mid.clone().addScaledVector(m.d, -sz * 0.9), u)); Y.pos.copy(lerpV(m.b0, m.mid.clone().addScaledVector(m.d, sz * 0.9), u)); X.face = Y.pos; Y.face = X.pos; X.punch = Y.punch = 0.3; }
            else {
              if (!m.hit) {
                m.hit = true;
                fx.explosion(m.mid, imp * 0.8, { smokeColumn: false }); fx.ring(m.mid, imp * 7, 0.8, 0xffffff, 0.7, true);
                D.explode({ x: m.mid.x, y: m.mid.y, z: m.mid.z, r: imp * 1.8, power: pw, lift: 0.3, lod: 1 });
                for (const bd of D.buildingsNear(m.mid.x, m.mid.z, imp * 3.5)) if (bd.state === 'intact' && bd.baseY + bd.height > m.mid.y - imp * 2) D.blastFrom(bd, m.mid, pw * 0.7, { lift: 0.1, lod: 1 });
                D.ringPush(m.mid, 0, imp * 9, 30 * S.v, 0.3);
                fx.flash = Math.max(fx.flash, 0.25); fx.addShake(2); audio.boom(3, camera.position.distanceTo(m.mid)); st.slow = 0.8;
                X.vel.copy(m.d).multiplyScalar(-70); Y.vel.copy(m.d).multiplyScalar(70);
              }
              for (const f of [X, Y]) { f.pos.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.exp(-dt * 2.5)); f.pose = 'fly'; }
            }
          }, cam: (t, out) => side(out, X.pos, Y.pos, 1, 1.2) };
        },
        brawl(X, Y) {
          return { dur: 3.2, cap: '', init() { X.state = Y.state = 'fly'; X.pose = Y.pose = 'fly'; }, step(t, dt) { brawlStep(dt); }, cam: (t, out) => side(out, X.pos, Y.pos, -1, 1) };
        },
        throw(X, Y) {
          const m = {};
          return { dur: 4.4, cap: '건물로 던지기', init() {
            m.x0 = X.pos.clone(); m.y0 = Y.pos.clone(); Y.pose = 'dazed'; X.pose = 'grab';
            m.dir = densestDir(Y.pos, Math.max(R0 * 1.2, 200), 10);
            m.V = Math.max(110, Math.min(R0 * 1.4, 600) / 2.3);
          }, step(t, dt) {
            if (t < 0.7) { X.pos.copy(lerpV(m.x0, m.y0.clone().addScaledVector(m.dir, -sz * 2.2), ease.inOut(t / 0.7))); X.face = Y.pos; }
            else if (t < 1.8) {
              // 상대를 잡고 빙빙 돌림
              const k = (t - 0.7) / 1.1, ang = k * k * Math.PI * 5 + Math.atan2(m.dir.x, m.dir.z);
              Y.pos.copy(X.pos).add(v3(Math.sin(ang) * sz * 2.4, sz * 0.3, Math.cos(ang) * sz * 2.4)); X.face = Y.pos; Y.face = X.pos;
              if (!m.w) { m.w = 1; audio.whoosh(1.2); }
              m.relY = gnd(X.pos.x, X.pos.z) + Math.max(10, Math.min(28, 6 + imp * 0.3));
            } else {
              if (!m.rel) { m.rel = true; X.pose = 'punch'; X.punch = 0.4; Y.vel.copy(m.dir).multiplyScalar(m.V); fx.ring(Y.pos, sz * 6, 0.5, 0xffffff, 0.5, true); audio.whoosh(2); st.slow = 0.4; m.seen = new Set(); }
              if (!m.land) {
                const prev = Y.pos.clone();
                Y.pos.addScaledVector(Y.vel, dt); Y.pos.y += (gnd(Y.pos.x, Y.pos.z) + 14 - Y.pos.y) * Math.min(1, dt * 2);
                Y.face = Y.pos.clone().sub(Y.vel);
                plough(prev, Y.pos, sz * 1.4 + imp * 0.35, pw * 1.3, m.seen);
                const out = Math.abs(Y.pos.x) > half * 0.97 || Math.abs(Y.pos.z) > half * 0.97;
                if (t > 4.0 || out) { m.land = true; clampMap(Y.pos); const gq = ground(Y.pos); shock(gq, imp * 1.3, pw * 1.3, { crater: [imp * 0.7, imp * 0.3], slow: 0.5 }); Y.pos.copy(gq).add(v3(0, 1, 0)); Y.vel.set(0, 0, 0); }
              }
            }
          }, cam: (t, out) => t < 1.8 ? side(out, X.pos, Y.pos, 1, 1.6) : m.land ? side(out, X.pos, Y.pos, 1, 0.6) : chaseCam(out, Y.pos, m.dir, sz * 5 + 40, 18 + sz, 25) };
        },
        slam(X, Y) {
          const m = {};
          return { dur: 6.8, cap: '건물 뽑아 내려꽂기', init() {
            m.p0 = clampMap(ground(Y.pos)); Y.pose = 'dazed'; m.y0 = Y.pos.clone(); m.x0 = X.pos.clone();
            m.bs = pickBuildings(m.p0, Math.max(R0 * 0.7, 150), nLift);
            if (!m.bs.length) { m.none = true; return; }
            const B = m.bs[0]; m.B = B;
            let cx = 0, cz = 0, top = 0; for (const b of m.bs) { cx += b.cx; cz += b.cz; top = Math.max(top, b.height); }
            m.ctr = v3(cx / m.bs.length, B.baseY + top * 0.5, cz / m.bs.length);
            const out = v3(m.ctr.x - m.p0.x, 0, m.ctr.z - m.p0.z); if (out.lengthSq() < 1) out.set(1, 0, 0); out.normalize();
            m.top = top; m.size = Math.max(...m.bs.map(b => Math.max(b.maxx - b.minx, b.maxz - b.minz)));
            m.grabAt = v3(m.ctr.x, B.baseY + Math.min(top * 0.25, 20), m.ctr.z).addScaledVector(out, -(m.size * 0.5 + sz));
            m.H = m.p0.clone().add(v3(0, top * 0.6 + 60 + imp, 0));
            m.flipAx = v3(-out.z, 0, out.x);
          }, step(t, dt) {
            if (m.none) { smashLike(X, Y, t, dt, m); return; }
            // 바닥에 쓰러진 상대
            if (t < 0.6) Y.pos.copy(lerpV(m.y0, m.p0.clone().add(v3(0, 1, 0)), ease.in(t / 0.6)));
            if (t < 1.1) { X.pos.copy(lerpV(m.x0, m.grabAt, ease.inOut(Math.min(1, t / 1.1)))); X.face = m.ctr; X.pose = 'grab'; }
            else if (!m.g) {
              // 뿌리째 뽑음
              m.g = makeHeld(m.bs, m.ctr, null);
              for (const b of m.bs) { const q = v3(b.cx, b.baseY, b.cz); fx.dust(q, Math.max(b.maxx - b.minx, 10) * 0.8); A.crater(b.cx, b.cz, Math.max(b.maxx - b.minx, b.maxz - b.minz) * 0.55, 2.5 + m.top * 0.04); world.blastTrees(b.cx, b.cz, m.size, m.size); }
              D.explode({ x: m.ctr.x, y: m.B.baseY + 2, z: m.ctr.z, r: m.size * 0.9 + imp * 0.4, power: pw * 0.5, lift: 0.4, lod: 1 });
              fx.ring(ground(m.ctr).add(v3(0, 2, 0)), m.size * 3, 0.8, 0xc8b8a0, 0.5); fx.addShake(1.4); audio.crumble(80); audio.roar(1.2);
            }
            if (m.g) {
              const g = m.g;
              if (t < 3.6) { const u = ease.inOut((t - 1.1) / 2.5); g.center.copy(lerpV(m.ctr, m.H, u)); g.rot.setFromAxisAngle(m.flipAx, Math.PI * u); X.pose = 'lift'; if (R() < 0.5) fx.smoke.emit(g.center.x + (R() - 0.5) * m.size, g.center.y - m.top * 0.4, g.center.z + (R() - 0.5) * m.size, 0, -4, 0, 2.5, 3, 9, [0.55, 0.5, 0.45, 0.5], [0.6, 0.58, 0.55, 0], 0.4, 0); }
              else if (t < 4.2) { g.center.copy(m.H).add(v3(0, Math.sin((t - 3.6) * 10) * 0.6, 0)); if (!m.ch) { m.ch = 1; audio.charge && audio.charge(0.6); st.slow = 0.6; } }
              else if (t < 4.8) { const u = ease.in((t - 4.2) / 0.6); g.center.copy(lerpV(m.H, m.p0.clone().add(v3(0, m.top * 0.3, 0)), u)); }
              else if (!m.hit) {
                m.hit = true; g.drop();
                const r = Math.max(m.size * 1.1, imp * 1.5);
                shock(m.p0, r, pw * 1.6, { crater: [r * 0.6, r * 0.3], lift: 0.7, flash: 0.3, shake: 2.4, slow: 0.9, col: true });
                for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const q = m.p0.clone().add(v3(Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7)); keepUp(q, 2); D.explode({ x: q.x, y: q.y, z: q.z, r: r * 0.5, power: pw, lift: 0.5, lod: 1 }); fx.dust(q, r * 0.4); }
              }
              if (!m.hit) {
                g.apply();
                // 들고 있는 사람: 묶음 아래(뒤집힌 건물의 바닥 쪽)에 붙음
                // 들고 있는 사람: 건물의 원래 바닥 쪽을 잡음 → 뒤집히면 위에서 내리누름
                X.pos.copy(g.center).add(v3(0, -(m.top * 0.5 + sz * 2.1), 0).applyQuaternion(g.rot));
                X.face = Y.pos;
              } else { X.pose = 'fly'; X.pos.y += dt * 25; }
            }
            if (t > 6.0) { Y.pose = 'fly'; Y.pos.y += dt * 30; }
          }, cam: (t, out) => {
            if (m.none) return side(out, X.pos, Y.pos, 1, 1);
            if (t < 1.1) return wideCam(out, m.ctr, m.top * 1.8 + 140, 25, 0.5);
            if (t < 4.2) return lowUp(out, m.p0, m.g ? m.g.center : m.ctr, m.top * 1.6 + 160);
            return wideCam(out, m.p0, m.size * 4 + imp * 4 + 120, 45 + m.top * 0.3, 0.9);
          } };
        },
        drag(X, Y) {
          const m = {};
          return { dur: 5, cap: '멱살 잡고 관통', init() {
            m.x0 = X.pos.clone(); m.y0 = Y.pos.clone(); X.pose = 'grab'; Y.pose = 'dazed';
            m.dir = densestDir(Y.pos, Math.max(R0 * 1.6, 260), 12);
            const hs = []; for (const bd of D.buildingsNear(Y.pos.x, Y.pos.z, R0)) if (bd.state === 'intact') hs.push(bd.height);
            hs.sort((a, b) => a - b); m.alt = Math.max(8, Math.min(35, (hs[hs.length >> 1] || 20) * 0.45));
            m.V = Math.max(90, Math.min(R0 * 1.6, 700) / 3.5); m.seen = new Set();
          }, step(t, dt) {
            if (t < 0.6) { X.pos.copy(lerpV(m.x0, m.y0.clone().addScaledVector(m.dir, -sz * 1.6), ease.inOut(t / 0.6))); X.face = Y.pos; return; }
            if (t < 4.2) {
              if (!m.go) { m.go = 1; audio.whoosh(3); }
              const prev = Y.pos.clone();
              Y.pos.addScaledVector(m.dir, m.V * dt); Y.pos.y += (gnd(Y.pos.x, Y.pos.z) + m.alt - Y.pos.y) * Math.min(1, dt * 3);
              clampMap(Y.pos);
              X.pos.copy(Y.pos).addScaledVector(m.dir, -sz * 1.5).add(v3(0, sz * 0.2, 0));
              X.face = Y.pos.clone().addScaledVector(m.dir, 10); Y.face = X.pos;
              plough(prev, Y.pos, sz * 1.7 + imp * 0.3, pw * 1.4, m.seen);
              if (R() < dt * 4) fx.addShake(0.6);
            } else {
              if (!m.th) { m.th = 1; X.pose = 'punch'; X.punch = 0.4; Y.vel.copy(m.dir).multiplyScalar(60).add(v3(0, 70, 0)); Y.free = true; shock(Y.pos, imp * 0.8, pw, { slow: 0.4 }); }
            }
          }, cam: (t, out) => {
            const sd = v3(-m.dir.z, 0, m.dir.x);
            out.pos.copy(Y.pos).addScaledVector(m.dir, 25 + sz * 2).addScaledVector(sd, 45 + sz * 3).add(v3(0, 22 + m.alt * 0.6, 0));
            out.look.copy(Y.pos).addScaledVector(m.dir, -10); out.fov = 62; out.smooth = 0.15; out.timeScale = st.slow > 0 ? 0.4 : 1;
          } };
        },
        laser(X, Y) {
          const m = {};
          return { dur: 4.4, cap: '레이저 맞대결', init() {
            m.mid = clampMap(lerpV(X.pos, Y.pos, 0.5)); m.mid.y = gnd(m.mid.x, m.mid.z) + 45 + imp * 0.5;
            const d = Y.pos.clone().sub(X.pos).setY(0); if (d.lengthSq() < 1) d.set(1, 0, 0); d.normalize(); m.d = d;
            m.dist = Math.max(70, Math.min(R0 * 0.5, 220));
            m.xa = X.pos.clone(); m.ya = Y.pos.clone(); X.pose = Y.pose = 'fly'; Y.free = false;
            m.bx = beamMesh(X.accent); m.by = beamMesh(Y.accent); beams.push(m.bx, m.by);
            m.sw = R() < 0.5 ? 1 : -1;
          }, step(t, dt) {
            const xt = m.mid.clone().addScaledVector(m.d, -m.dist * 0.5), yt = m.mid.clone().addScaledVector(m.d, m.dist * 0.5);
            const u = Math.min(1, t / 0.7); X.pos.copy(lerpV(m.xa, xt, ease.inOut(u))); Y.pos.copy(lerpV(m.ya, yt, ease.inOut(u))); X.face = Y.pos; Y.face = X.pos;
            if (t < 0.7) return;
            if (!m.on) { m.on = 1; audio.laserStart && audio.laserStart(); }
            const ex = eyes(X), ey = eyes(Y);
            if (t < 2.6) {
              // 두 줄기가 가운데서 맞부딪힘
              const k = 0.5 + 0.18 * Math.sin(t * 4.3);
              const L = lerpV(ex, ey, k);
              drawBeam(m.bx, ex, L); drawBeam(m.by, ey, L);
              fx.sparks(L, UP, 10); if (R() < 0.4) fx.explosion(L, sz * 0.4, { smokeColumn: false });
              fx.addShake(0.15); m.L = L;
            } else {
              if (!m.pop) { m.pop = 1; shock(m.L, imp * 1.2, pw, { slow: 0.6, flash: 0.35 }); }
              // 튕겨 나간 레이저가 땅을 가름
              const k = (t - 2.6) / 1.8;
              for (const [g, e, f, s2] of [[m.bx, ex, X, 1], [m.by, ey, Y, -1]]) {
                const a = Math.atan2(m.d.x, m.d.z) + s2 * m.sw * (0.6 + k * 1.6);
                const tgt = m.mid.clone().add(v3(Math.sin(a) * m.dist * (0.4 + k * 1.2), 0, Math.cos(a) * m.dist * (0.4 + k * 1.2)));
                const dir = tgt.clone().setY(gnd(tgt.x, tgt.z)).sub(e).normalize();
                const h2 = D.raycast(e, dir, R0 * 3);
                const end = h2 ? v3(h2.point.x, h2.point.y, h2.point.z) : e.clone().addScaledVector(dir, R0 * 3);
                drawBeam(g, e, end);
                D.lineBlast(e.clone().addScaledVector(dir, sz * 3), end, 3.5 * S.r ** 0.5, 30);
                if (h2) { fx.sparks(end, UP, 6); D.laser(end.x, end.z, 4 * S.r ** 0.5, dt); world.paintScorch(end.x, end.z, 6, 0.6); }
              }
            }
          }, end() { for (const g of [m.bx, m.by]) { disposeObj(scene, g); const i = beams.indexOf(g); if (i >= 0) beams.splice(i, 1); } if (audio.laserStop) audio.laserStop(); },
          cam: (t, out) => side(out, X.pos, Y.pos, -1, 1.25) };
        },
        terrain(X, Y) {
          const m = {};
          return { dur: 7.4, cap: '땅째 뜯어 던지기', init() {
            // 뜯어낼 자리: 공격자 아래, 상대와 충분히 떨어진 곳
            // 건물이 많이 얹힌 땅을 고름 (상대와는 충분히 떨어진 곳)
            let bestN = -1;
            for (let k = 0; k < 25; k++) {
              const a = k * 2.4, d = k ? Math.min(R0 * 0.6, 250) * Math.sqrt(k / 24) : 0;
              const q = clampMap(v3(X.pos.x + Math.cos(a) * d, 0, X.pos.z + Math.sin(a) * d));
              if (Math.hypot(q.x - Y.pos.x, q.z - Y.pos.z) < rr * 3) continue;
              const n = D.buildingsNear(q.x, q.z, rr * 0.8).filter(b => b.state === 'intact' && Math.hypot(b.cx - q.x, b.cz - q.z) < rr * 0.85).length - d * 0.004;
              if (n > bestN) { bestN = n; m.q = q; }
            }
            if (!m.q) m.q = clampMap(ground(X.pos).add(v3(rr * 3, 0, 0)));
            m.q.y = gnd(m.q.x, m.q.z);
            m.x0 = X.pos.clone(); m.y0 = Y.pos.clone(); X.pose = 'fly';
            m.T = clampMap(ground(Y.pos)); m.H = m.q.clone().add(v3(0, rr * 1.4 + 70, 0));
          }, step(t, dt) {
            if (t < 1.0) { X.pos.copy(lerpV(m.x0, m.q.clone().add(v3(0, 0.5, 0)), ease.in(t))); X.face = m.q.clone().add(v3(0, -5, 0)); X.pose = 'punch'; }
            else if (t < 1.7) {
              if (!m.dig) { m.dig = 1; fx.ring(m.q.clone().add(v3(0, 2, 0)), rr * 1.8, 0.9, 0xc8b8a0, 0.6); fx.dust(m.q, rr * 0.8); fx.addShake(1.8); audio.boom(2.2, camera.position.distanceTo(m.q)); D.explode({ x: m.q.x, y: m.q.y + 1, z: m.q.z, r: rr * 0.5, power: pw * 0.4, lift: 0.2, lod: 1 }); X.pose = 'lift'; }
              if (R() < dt * 8) { const a = R() * Math.PI * 2; fx.dust(m.q.clone().add(v3(Math.cos(a) * rr, 0, Math.sin(a) * rr)), rr * 0.3); }
              fx.addShake(dt * 2);
            } else if (!m.g) {
              // 땅덩어리를 위의 건물과 함께 뜯어냄
              const bs = D.buildingsNear(m.q.x, m.q.z, rr * 0.8).filter(b => b.state === 'intact' && Math.hypot(b.cx - m.q.x, b.cz - m.q.z) < rr * 0.85).slice(0, 40);
              const rock = makeRock(rr); rocks.push(rock);
              const ctr = m.q.clone().add(v3(0, -rr * 0.06, 0));
              m.g = makeHeld(bs, ctr, rock); m.g.apply();
              A.crater(m.q.x, m.q.z, rr * 1.05, rr * 0.55); world.blastTrees(m.q.x, m.q.z, rr * 1.1, rr * 1.1);
              fx.dust(m.q, rr); audio.crumble(100); audio.roar(1.5); fx.addShake(2); st.slow = 0.5;
              m.spin = v3(R() - 0.5, 0.2, R() - 0.5).normalize();
            }
            if (m.g && !m.hit) {
              const g = m.g;
              if (t < 4.0) { const u = ease.inOut((t - 1.7) / 2.3); g.center.copy(lerpV(m.q, m.H, u)); g.rot.setFromAxisAngle(m.spin, u * 0.3); if (R() < 0.8) fx.smoke.emit(g.center.x + (R() - 0.5) * rr, g.center.y - rr * 0.6, g.center.z + (R() - 0.5) * rr, 0, -5, 0, 2.5, rr * 0.08, rr * 0.25, [0.5, 0.44, 0.36, 0.55], [0.55, 0.5, 0.45, 0], 0.4, 0); }
              else if (t < 4.6) { g.center.copy(m.H); if (!m.aim) { m.aim = 1; audio.charge && audio.charge(0.6); } }
              else if (t < 5.9) {
                if (!m.thr) { m.thr = 1; audio.whoosh(2); m.T = clampMap(ground(Y.pos)); }
                const u = (t - 4.6) / 1.3; const a = lerpV(m.H, m.T.clone().add(v3(0, rr * 0.3, 0)), ease.in(u)); a.y += Math.sin(u * Math.PI) * rr * 0.8;
                g.center.copy(a); g.rot.setFromAxisAngle(m.spin, 0.3 + u * 1.2);
              } else {
                m.hit = true; g.drop();
                shock(m.T, rr * 1.6, pw * 1.8, { crater: [rr * 1.1, rr * 0.5], lift: 0.8, flash: 0.35, shake: 3, slow: 1, col: true });
                for (let k = 0; k < 9; k++) {
                  const r2 = rr * (0.18 + R() * 0.15), mm = makeRock(r2); rocks.push(mm);
                  const a = R() * Math.PI * 2, sp = 40 + R() * 60;
                  A.addProjectile({ mesh: mm, pos: m.T.clone().add(v3(0, r2 + 2, 0)), vel: v3(Math.cos(a) * sp, 35 + R() * 50, Math.sin(a) * sp), g: 25, spin: 3,
                    onHit: (q) => { A.blast(q, r2 * 1.6, pw * 0.7, { silent: R() > 0.4, lod: 1, lift: 0.4 }); const i = rocks.indexOf(mm); if (i >= 0) rocks.splice(i, 1); } });
                }
                Y.pos.copy(m.T).add(v3(0, 1, 0)); Y.pose = 'dazed';
              }
              if (!m.hit) {
                g.apply();
                X.pos.copy(g.center).add(v3(0, -rr * 0.9 - sz * 2.1, 0)); X.face = Y.pos; X.pose = t < 4.6 ? 'lift' : 'punch'; if (t >= 4.6) X.punch = 0.2;
              }
            }
            if (m.hit) { X.pose = 'fly'; X.pos.y += (m.H.y - X.pos.y) * Math.min(1, dt); }
            if (!m.hit && t > 1.7) { Y.pos.copy(lerpV(m.y0, m.T.clone().add(v3(0, 30, 0)), Math.min(1, (t - 1.7) / 2))); Y.face = m.g ? m.g.center : X.pos; Y.pose = 'fly'; }
            if (t > 6.8) { Y.pose = 'fly'; Y.pos.y += dt * 30; }
          }, cam: (t, out) => {
            if (t < 1.7) return wideCam(out, m.q.clone().add(v3(0, 10, 0)), rr * 4 + 140, 30, 0.4);
            if (t < 4.6) return lowUp(out, m.q, m.g ? m.g.center : m.q, rr * 3.5 + 170);
            if (t < 5.9) { const a = m.g ? m.g.center : m.T; const mid = lerpV(m.H, m.T, 0.5); return wideCam(out, mid, m.H.distanceTo(m.T) * 0.8 + rr * 3 + 120, 40 + rr * 0.5, 1.1, a); }
            return wideCam(out, m.T, rr * 5 + 180, 50 + rr * 0.5, 1.1);
          } };
        },
        smash(X, Y) { const m = {}; return { dur: 3.8, cap: '내려찍기', init() {}, step(t, dt) { smashLike(X, Y, t, dt, m); }, cam: (t, out) => (m.hitT ? wideCam(out, m.g, imp * 5 + 120, 30 + imp * 0.3, 0.7) : side(out, X.pos, Y.pos, 1, 1.3)) }; },
        finisher(X, Y) {
          const m = {};
          return { dur: 6.4, cap: '마지막 일격', init() {
            m.dir = densestDir(X.pos, Math.max(R0 * 2, 300), 6);
            m.x0 = X.pos.clone(); m.y0 = Y.pos.clone();
            m.at = clampMap(X.pos.clone()); m.at.y = gnd(m.at.x, m.at.z) + 30 + imp * 0.4;
            const len = Math.min(Math.max(R0 * 2, 300), half * 1.8); m.V = len / 2.4;
            X.pose = 'fly'; Y.pose = 'dazed'; Y.free = false; m.seen = new Set(); m.k = 0;
          }, step(t, dt) {
            if (t < 1.6) {
              const u = ease.inOut(Math.min(1, t / 0.8));
              X.pos.copy(lerpV(m.x0, m.at, u)); Y.pos.copy(lerpV(m.y0, m.at.clone().addScaledVector(m.dir, sz * 2.4), u)); X.face = Y.pos; Y.face = X.pos;
              const U = X.m.userData; U.aura.scale.setScalar(0.6 + t * 0.9); U.aura.material.opacity = 0.15 + t * 0.12;
              if (!m.ch) { m.ch = 1; audio.charge && audio.charge(1.5); }
              if (R() < 0.5) fx.sparks(X.pos.clone().add(v3(0, sz, 0)), UP, 4);
              fx.addShake(t * 0.2); X.pose = t > 1.2 ? 'punch' : 'lift';
            } else if (!m.go) {
              m.go = 1; X.punch = 0.6; const U = X.m.userData; U.aura.scale.set(0.6, 1.1, 0.6); U.aura.material.opacity = 0.12;
              shock(Y.pos, imp * 1.2, pw, { flash: 0.5, slow: 0.8, shake: 2.5 });
              fx.ring(Y.pos, imp * 12, 1, 0xffffff, 0.7, true);
            } else if (!m.land) {
              const prev = Y.pos.clone();
              Y.pos.addScaledVector(m.dir, m.V * dt);
              const u = (t - 1.6) / 2.4; Y.pos.y += (gnd(Y.pos.x, Y.pos.z) + 22 * (1 - u) - Y.pos.y) * Math.min(1, dt * 3);
              Y.face = prev;
              plough(prev, Y.pos, sz * 2 + imp * 0.5, pw * 2, m.seen);
              // ×10 이상: 날아간 자리를 따라 땅이 파임 (×100이면 협곡)
              if (P >= 10) { m.k += m.V * dt; if (m.k > imp * 0.6) { m.k = 0; A.crater(Y.pos.x, Y.pos.z, imp * (big ? 0.9 : 0.5), imp * (big ? 0.6 : 0.25)); } }
              const out = Math.abs(Y.pos.x) > half * 0.97 || Math.abs(Y.pos.z) > half * 0.97;
              if (u >= 1 || out) { m.land = true; clampMap(Y.pos); m.end = ground(Y.pos); shock(m.end, imp * 2.4, pw * 2.2, { crater: [imp * 1.5, imp * 0.7], lift: 0.8, flash: 0.4, shake: 3, slow: 1, col: true }); Y.pos.copy(m.end); }
            }
          }, cam: (t, out) => {
            if (t < 1.6) return side(out, X.pos, Y.pos, 1, 0.7);
            if (!m.land) return chaseCam(out, Y.pos, m.dir, sz * 6 + 50, 22 + sz, 30);
            return wideCam(out, m.end, imp * 6 + 160, 50 + imp * 0.5, 0.8);
          } };
        },
      };
      // 내려찍기 (건물이 없을 때 slam 대신에도 씀)
      const smashLike = (X, Y, t, dt, m) => {
        if (!m.s) { m.s = 1; m.y0 = Y.pos.clone(); m.x0 = X.pos.clone(); m.top = clampMap(Y.pos.clone()); m.top.y = gnd(m.top.x, m.top.z) + 110 + imp * 1.5; Y.pose = 'dazed'; }
        if (t < 1.0) { const u = ease.inOut(t); Y.pos.copy(lerpV(m.y0, m.top, u)); X.pos.copy(lerpV(m.x0, m.top.clone().add(v3(0, sz * 3, 0)), u)); X.face = Y.pos; X.pose = 'lift'; return; }
        if (t < 1.3) { X.pose = 'lift'; X.face = Y.pos; return; }
        if (!m.down) { m.down = 1; X.pose = 'punch'; X.punch = 0.4; fx.flash = Math.max(fx.flash, 0.2); audio.boom(2, camera.position.distanceTo(Y.pos)); fx.ring(Y.pos, imp * 5, 0.5, 0xffffff, 0.6); st.slow = 0.3; m.g = ground(Y.pos); }
        if (!m.hitT) {
          Y.pos.y -= (160 + 60 * S.v) * dt; Y.pos.x += (m.g.x - Y.pos.x) * 0.2; Y.pos.z += (m.g.z - Y.pos.z) * 0.2;
          if (R() < 0.8) fx.trail(Y.pos, sz * 0.5, false);
          if (Y.pos.y <= m.g.y + 1) {
            m.hitT = t; Y.pos.y = m.g.y + 0.5;
            shock(m.g, imp * 1.8, pw * 1.6, { crater: [imp * 1.1, imp * 0.5], lift: 0.7, slow: 0.9, flash: 0.3, shake: 2.6, col: true });
            // 방사형으로 땅이 갈라짐
            for (let k = 0; k < 7; k++) {
              const a = k / 7 * Math.PI * 2 + R() * 0.3, L = imp * (2.4 + R());
              const e = m.g.clone().add(v3(Math.cos(a) * L, 0, Math.sin(a) * L)); e.y = gnd(e.x, e.z);
              D.lineBlast(m.g.clone().add(v3(0, 2, 0)), e.clone().add(v3(0, 2, 0)), imp * 0.35, pw);
              for (let j = 1; j <= 3; j++) { const q = lerpV(m.g, e, j / 3.5); A.crater(q.x, q.z, imp * 0.3 * (1 - j * 0.2), imp * 0.18); }
              for (const bd of D.buildingsNear(e.x, e.z, imp * 0.6)) if (bd.state === 'intact') D.flatten(bd, 0.8, Math.cos(a), Math.sin(a));
            }
          }
        } else { X.pose = 'fly'; X.pos.y -= dt * 15; }
        if (t > 3.2) { Y.pose = 'fly'; Y.pos.y += dt * 25; }
      };
      // 주먹 공방 (예전 싸움)
      const brawlStep = (dt) => {
        const [a, b] = F;
        for (const [me, op] of [[a, b], [b, a]]) {
          me.t += dt;
          if (me.state === 'knock') {
            const prev = me.pos.clone();
            me.pos.addScaledVector(me.vel, dt); me.vel.multiplyScalar(Math.exp(-dt * 0.8)); me.vel.y -= 9 * dt;
            plough(prev, me.pos, sz * 1.3 + imp * 0.2, 35 * S.v, me.hit);
            const gy = gnd(me.pos.x, me.pos.z);
            if (me.pos.y <= gy + 2 || me.vel.length() < 25 || me.t > 2.2) { if (me.pos.y <= gy + 2) { shock(v3(me.pos.x, gy, me.pos.z), imp, pw, { crater: [imp * 0.6, imp * 0.25] }); } me.state = 'fly'; me.t = 0; me.recover = 0.8; me.hit = new Set(); }
            me.face = me.pos.clone().sub(me.vel); me.pose = 'dazed';
          } else {
            me.recover = Math.max(0, me.recover - dt); me.pose = 'fly';
            const to = op.pos.clone().sub(me.pos); const d = to.length();
            const curve = v3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(st.t * 0.9 + (me === a ? 0 : 2)) * 30);
            const want = to.normalize().multiplyScalar(me.recover > 0 ? 20 : 95).add(curve).add(v3(0, Math.sin(st.t * 1.3 + (me === a ? 1 : 3)) * 12, 0));
            me.vel.lerp(want, Math.min(1, dt * 2.2));
            me.pos.addScaledVector(me.vel, dt); me.face = me.pos.clone().add(me.vel);
            if (d < sz * 2.2 && me.recover <= 0 && op.state !== 'knock' && me === a) {
              const winner = R() < 0.5 ? a : b, loser = winner === a ? b : a;
              const dirK = loser.pos.clone().sub(winner.pos).normalize().add(v3(0, -0.15 + R() * 0.3, 0)).normalize();
              loser.state = 'knock'; loser.t = 0; loser.vel.copy(dirK).multiplyScalar(190 * S.v ** 0.5);
              winner.vel.multiplyScalar(-0.2); winner.recover = 0.6;
              const q = a.pos.clone().lerp(b.pos, 0.5);
              fx.explosion(q, sz * 1.4, { smokeColumn: false }); fx.ring(q, imp * 6, 0.7, 0xffffff, 0.6, true); fx.flash = Math.max(fx.flash, 0.15);
              audio.boom(2.5, camera.position.distanceTo(q)); fx.addShake(1.5);
              D.ringPush(q, 0, imp * 8, 25, 0.3);
              for (const bd of D.buildingsNear(q.x, q.z, imp * 2)) if (bd.state === 'intact' && bd.baseY + bd.height > q.y - imp) D.blastFrom(bd, q, pw * 0.5, { lift: 0.1, lod: 1 });
              st.slow = 0.6; winner.punch = 0.4;
            }
          }
          const dd = Math.hypot(me.pos.x - c.x, me.pos.z - c.z); if (dd > R0 * 1.3) { me.pos.x = c.x + (me.pos.x - c.x) / dd * R0 * 1.3; me.pos.z = c.z + (me.pos.z - c.z) / dd * R0 * 1.3; }
          const gy = gnd(me.pos.x, me.pos.z); if (me.pos.y > gy + 220) me.pos.y = gy + 220;
        }
      };
      // ---------- 카메라 ----------
      const ts = () => (st.slow > 0 ? 0.35 : 1);
      function side(out, pa, pb, k, far = 1) {
        const ab = pb.clone().sub(pa); ab.y = 0; const sep = ab.length(); if (sep < 0.1) ab.set(1, 0, 0);
        const perp = v3(-ab.z, 0, ab.x).normalize().multiplyScalar(k);
        const mid = lerpV(pa, pb, 0.5);
        out.look.copy(mid);
        out.pos.copy(mid).addScaledVector(perp, Math.max(60, sep * 1.1 + sz * 6) * far).add(v3(0, 18 + sep * 0.15, 0));
        keepUp(out.pos, 6);
        out.fov = 58; out.smooth = 0.22; out.timeScale = ts();
      }
      function chaseCam(out, pos, dir, back, up, sdo) {
        const sd = v3(-dir.z, 0, dir.x);
        out.pos.copy(pos).addScaledVector(dir, -back).addScaledVector(sd, sdo).add(v3(0, up, 0)); keepUp(out.pos, 6);
        out.look.copy(pos).addScaledVector(dir, 30); out.fov = 64; out.smooth = 0.12; out.timeScale = ts();
      }
      const camA = Math.atan2(f0.x, f0.z) + Math.PI;
      function wideCam(out, focus, dist, h, a = 0, look = null) {
        const an = camA + a;
        out.pos.set(focus.x + Math.sin(an) * dist, 0, focus.z + Math.cos(an) * dist); out.pos.y = Math.max(gnd(out.pos.x, out.pos.z) + 8, focus.y + h);
        out.look.copy(look || focus); out.fov = 55; out.smooth = 0.1; out.timeScale = ts();
      }
      function lowUp(out, base, obj, dist) {
        const an = camA + 0.7;
        out.pos.set(base.x + Math.sin(an) * dist, 0, base.z + Math.cos(an) * dist); out.pos.y = gnd(out.pos.x, out.pos.z) + 12 + dist * 0.05;
        out.look.copy(obj); out.fov = 60; out.smooth = 0.12; out.timeScale = ts();
      }

      // ---------- 순서 ----------
      const names = P >= 40
        ? ['clash', 'throw', 'slam', 'drag', 'laser', 'terrain', 'brawl', 'slam', 'terrain', 'smash', 'finisher']
        : P >= 5 ? ['clash', 'brawl', 'throw', 'slam', 'drag', 'laser', 'terrain', 'smash', 'finisher']
          : ['clash', 'brawl', 'throw', 'slam', 'smash', 'finisher'];
      const plan = names.map((n, i) => M[n](F[i % 2], F[(i + 1) % 2]));
      let mi = -1, mt = 0, cur = null;
      const next = () => { if (cur && cur.end) cur.end(); mi++; cur = plan[mi]; mt = 0; for (const f of F) { f.free = false; f.state = 'fly'; } if (cur) cur.init(); };
      next();
      A._sfDbg = () => ({ mi, mt, name: names[mi] });
      audio.roar(1.5); audio.whoosh(2);
      const poseF = (f, dt) => {
        if (f.free) { f.pos.addScaledVector(f.vel, dt); f.vel.y -= 30 * dt; f.vel.multiplyScalar(Math.exp(-dt * 0.6)); }
        keepUp(f.pos, 0.5);
        const look = f.face ? f.face.clone() : f.pos.clone().add(v3(0, 0, 1));
        if (look.distanceToSquared(f.pos) < 0.01) look.z += 1;
        f.m.position.copy(f.pos); f.m.lookAt(look);
        const U = f.m.userData; f.punch = Math.max(0, f.punch - dt);
        const sw = Math.sin(st.t * 6 + (f === F[0] ? 0 : 1));
        if (f.pose === 'grab') { U.armR.rotation.x = -1.5; U.armL.rotation.x = -1.5; f.m.rotateX(0.35); }
        else if (f.pose === 'lift') { U.armR.rotation.x = -3.0; U.armL.rotation.x = -3.0; }
        else if (f.pose === 'dazed') { U.armR.rotation.x = 0.6 + 0.3 * sw; U.armL.rotation.x = -0.4 - 0.3 * sw; f.m.rotateX(-0.6); f.m.rotateZ(0.4 * sw); }
        else if (f.pose === 'punch') { U.armR.rotation.x = f.punch > 0 ? -1.6 : -0.6; U.armL.rotation.x = -0.4; f.m.rotateX(0.5); }
        else { U.armR.rotation.x = f.punch > 0 ? -1.6 : -0.3 + 0.2 * sw; U.armL.rotation.x = -0.2 + 0.2 * sw; f.m.rotateX(Math.min(1.1, f.vel.length() / 90)); }
        U.legL.rotation.x = 0.25 * Math.sin(st.t * 5); U.legR.rotation.x = -0.25 * Math.sin(st.t * 5);
        if (f.pose !== 'lift' || !cur || cur.cap !== '마지막 일격') U.aura.material.opacity = Math.max(U.aura.material.opacity * 0.9, 0.1 + 0.08 * Math.sin(st.t * 12));
      };
      A.addActive({
        update(dt) {
          st.t += dt; st.slow = Math.max(0, st.slow - dt);
          if (!cur) return false;
          mt += dt; cur.step(mt, dt);
          for (const f of F) poseF(f, dt);
          st.mid.copy(F[0].pos).lerp(F[1].pos, 0.5);
          if (mt >= cur.dur) { next(); if (!cur) return false; }
          return true;
        },
        dispose() {
          if (cur && cur.end) cur.end();
          for (const g of held.slice()) g.drop();
          for (const f of F) disposeObj(scene, f.m); for (const bm of beams) disposeObj(scene, bm); for (const r of rocks) disposeObj(scene, r);
          if (audio.laserStop) audio.laserStop();
        },
      });
      const g = cineGame(A); if (!g) return;
      const shots = plan.map((mv, i) => ({ dur: mv.dur, caption: i === 0 ? '초능력자 대결' : mv.cap, cut: true, update: (t, u, out) => { const c2 = cur || mv; c2.cam(c2 === cur ? mt : t, out); } }));
      g.cine.play(shots);
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
