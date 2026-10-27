// v1.13 영화 오마주: 땅울림 — 지평선 너머에서 바위 거인 수십이 한 줄로 걸어와 도시를 밟고 지나감
// 장면의 흐름만 빌리고 거인은 새로 디자인 (검은 바위 몸, 갈라진 틈의 주황빛, 몸에서 피어오르는 증기)
import * as THREE from 'three';
import { cineGame, camDir } from './cam.js';
import { wipeMap, worldEnd } from './apocalypse.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const disposeObj = (scene, o) => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); };

// 공용 재질 (거인 수십 개가 같이 씀)
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    rock: new THREE.MeshStandardMaterial({ color: 0x4a423b, roughness: 0.95, metalness: 0.02, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c2723, roughness: 0.95, metalness: 0.02, flatShading: true }),
    seam: new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }),
  };
  return MATS;
}
const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = true; return o; };

// 바위 거인 (원점 = 발바닥, 키 약 2.15, 앞 = +Z)
function makeColossus(r) {
  const M = mats();
  const g = new THREE.Group();
  const lean = new THREE.Group(); g.add(lean);                 // 몸을 앞으로 숙이는 축 (골반)
  lean.position.y = 1.0;
  const pelvis = box(0.52, 0.22, 0.32, M.dark); lean.add(pelvis);
  const torso = new THREE.Group(); torso.position.y = 0.1; lean.add(torso);
  const belly = box(0.5, 0.32, 0.32, M.rock); belly.position.y = 0.12; torso.add(belly);
  const chest = box(0.66 + r * 0.08, 0.5, 0.42, M.rock); chest.position.set(0, 0.52, 0.02); chest.rotation.x = -0.08; torso.add(chest);
  const back = box(0.5, 0.36, 0.18, M.dark); back.position.set(0, 0.55, -0.24); torso.add(back);
  // 갈라진 틈 (주황빛)
  for (const [x, y, w, h, rz] of [[-0.12, 0.6, 0.03, 0.34, 0.3], [0.16, 0.45, 0.03, 0.28, -0.4], [0.02, 0.18, 0.22, 0.02, 0.1], [-0.2, 0.3, 0.02, 0.2, 0.0]]) {
    const s = box(w, h, 0.02, M.seam); s.position.set(x, y, 0.24); s.rotation.z = rz; s.castShadow = false; torso.add(s);
  }
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.06); torso.add(head);
  const skull = box(0.26, 0.3, 0.28, M.rock); skull.position.y = 0.12; head.add(skull);
  const brow = box(0.28, 0.06, 0.06, M.dark); brow.position.set(0, 0.2, 0.14); head.add(brow);
  for (const s of [-1, 1]) { const e = box(0.07, 0.025, 0.02, M.eye); e.position.set(s * 0.065, 0.15, 0.145); e.castShadow = false; head.add(e); }
  const jaw = box(0.2, 0.08, 0.2, M.dark); jaw.position.set(0, -0.02, 0.04); head.add(jaw);
  const limb = (w, L, m) => { const p = new THREE.Group(); const b = box(w, L, w * 1.05, m); b.position.y = -L / 2; p.add(b); return p; };
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.42, 0.66, 0); torso.add(sh);
    const up = limb(0.17, 0.44, M.rock); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.44; up.add(el);
    const fo = limb(0.15, 0.42, M.dark); el.add(fo);
    const hand = box(0.17, 0.14, 0.12, M.rock); hand.position.y = -0.48; fo.add(hand);
    arms.push({ sh, el, s });
    const hip = new THREE.Group(); hip.position.set(s * 0.16, 0, 0); lean.add(hip);
    const th = limb(0.21, 0.5, M.rock); hip.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.5; th.add(kn);
    const sn = limb(0.18, 0.46, M.dark); kn.add(sn);
    const foot = box(0.21, 0.07, 0.34, M.rock); foot.position.set(0, -0.48, 0.06); kn.add(foot);
    const sm = box(0.02, 0.2, 0.02, M.seam); sm.position.set(0, -0.2, 0.1); sm.castShadow = false; kn.add(sm);
    legs.push({ hip, kn, foot, s });
  }
  g.userData = { lean, torso, head, arms, legs };
  return g;
}

export const MOVIE4 = {
  rumbling: {
    fire(A, hit) {
      const S = A.S, P = S.P, p = hit.point, { scene, D, fx, grid, audio, camera, world, game } = A.ctx;
      const gnd = (x, z) => (game && game.groundAt ? game.groundAt(x, z) : grid.sample(x, z));
      const half = grid.span / 2;
      const c = v3(p.x, gnd(p.x, p.z), p.z);
      const f = camDir(camera, c);                 // 카메라에서 보는 방향 → 거인은 그 반대편 지평선에서 카메라 쪽으로 걸어옴
      const dir = f.clone().negate(), side = v3(-dir.z, 0, dir.x);
      const Hs = 55 * S.r ** 0.32;                   // 키 (×1 50m, ×10 66m, ×100 88m)
      const sc = Hs / 2.15;
      const N = Math.round(Math.min(34, 6 + 5 * Math.sqrt(P)));
      const W = Math.max(grid.span * 1.6, N * Hs * 0.55);
      const speed = Math.max(9, Math.min(38, grid.span / 32));
      const D0 = half + 260 + Hs;                   // 출발: 지도 밖
      const travel = D0 + half + 320;
      const T = travel / speed;
      const stride = sc * 0.95;                     // 한 걸음 길이
      const G = [];
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N - 0.5 + (R() - 0.5) * 0.4 / N;
        const m = makeColossus(R()); m.scale.setScalar(sc * (0.85 + R() * 0.3)); scene.add(m);
        const lane = side.clone().multiplyScalar(u * W);
        const base = c.clone().addScaledVector(f, D0 + (R() - 0.3) * Hs * 0.8).add(lane);
        G.push({ m, base, ph: R() * Math.PI * 2, sideFoot: 0, hitT: 0, seen: new Set(), sc: m.scale.x, lastStep: 0, steam: R() });
      }
      const st = { t: 0, stepSnd: 0 };
      audio.rumble(Math.min(30, T)); audio.drone(Math.min(20, T));
      if (game) game.ensureView(D0 * 2.5, Hs * 4);
      const inMap = (q, pad = 40) => Math.abs(q.x) < half + pad && Math.abs(q.z) < half + pad;
      const tmp = v3();
      A.addActive({
        update(dt) {
          st.t += dt; st.stepSnd -= dt;
          const t = st.t;
          const dist = speed * t;
          let near = 1e9;
          for (const gi of G) {
            // 몸: 줄을 지어 앞으로, 걸음에 맞춰 위아래로 흔들림
            const ph = gi.ph + (dist / stride) * Math.PI;
            const pos = gi.base.clone().addScaledVector(dir, dist);
            pos.y = gnd(pos.x, pos.z) + Math.abs(Math.sin(ph)) * gi.sc * 0.05;
            gi.m.position.copy(pos);
            gi.m.lookAt(pos.clone().add(dir));
            const U = gi.m.userData;
            U.lean.rotation.x = 0.12 + Math.sin(ph * 2) * 0.03;
            U.lean.rotation.z = Math.sin(ph) * 0.05;
            U.head.rotation.y = Math.sin(t * 0.3 + gi.steam * 9) * 0.2;
            for (const L of U.legs) { const a = Math.sin(ph + (L.s > 0 ? Math.PI : 0)); L.hip.rotation.x = -a * 0.5; L.kn.rotation.x = Math.max(0, Math.cos(ph + (L.s > 0 ? Math.PI : 0))) * 0.8; }
            for (const Ar of U.arms) { const a = Math.sin(ph + (Ar.s > 0 ? 0 : Math.PI)); Ar.sh.rotation.x = -a * 0.35; Ar.el.rotation.x = -0.3 - Math.max(0, a) * 0.3; }
            near = Math.min(near, camera.position.distanceTo(pos));
            // 발이 땅에 닿는 순간 (반 걸음마다)
            const k = Math.floor(ph / Math.PI);
            if (k !== gi.lastStep) {
              gi.lastStep = k;
              const L = U.legs[k & 1];
              L.foot.getWorldPosition(tmp); const q = v3(tmp.x, gnd(tmp.x, tmp.z), tmp.z);
              const r = Hs * 0.13;
              if (inMap(q)) {
                A.blast(q, r, 32 * S.v, { crater: [r * 0.6, r * 0.12], lift: 0.25, silent: true, lod: 1, smokeColumn: false });
                for (const b of D.buildingsNear(q.x, q.z, r * 1.3)) if (b.state === 'intact') { const d = Math.max(1, Math.hypot(b.cx - q.x, b.cz - q.z)); D.flatten(b, 1, (b.cx - q.x) / d, (b.cz - q.z) / d, 0.4); }
                fx.ring(v3(q.x, q.y + 1, q.z), r * 3, 0.6, 0xb8a890, 0.35);
              }
              fx.dust(q, r * 0.8);
              if (st.stepSnd <= 0) { st.stepSnd = 0.22; audio.boom(1.6, camera.position.distanceTo(q)); }
            }
            // 몸통이 지나가며 건물을 밀어 무너뜨림
            gi.hitT -= dt;
            if (gi.hitT <= 0 && inMap(pos, 60)) {
              gi.hitT = 0.25;
              for (const b of D.buildingsNear(pos.x, pos.z, Hs * 0.32)) {
                if (gi.seen.has(b) || b.state === 'gone') continue;
                gi.seen.add(b);
                if (b.state === 'intact' && b.height < Hs * 0.45) { const d = Math.max(1, Math.hypot(b.cx - pos.x, b.cz - pos.z)); D.flatten(b, 1, dir.x, dir.z, 0.6); fx.dust(v3(b.cx, b.baseY, b.cz), 8); }
                else D.blastFrom(b, pos.clone().addScaledVector(dir, -Hs * 0.2), 45 * S.v, { lift: 0.1, lod: 1 });
              }
            }
            // 증기
            if (R() < dt * 6) {
              const sp = pos.clone().add(v3(0, gi.sc * (1.6 + R() * 0.5), 0)).addScaledVector(side, (R() - 0.5) * gi.sc * 0.6);
              fx.smoke.emit(sp.x, sp.y, sp.z, (R() - 0.5) * 2, 3 + R() * 3, (R() - 0.5) * 2, 3 + R() * 3, gi.sc * 0.25, gi.sc * 1.1, [0.92, 0.92, 0.94, 0.45], [0.95, 0.95, 0.97, 0], 0.4, 0.8, 0.1);
            }
          }
          fx.addShake(Math.min(0.08, 25 / Math.max(50, near)) * dt * 30);
          if (t > T) return false;
          return true;
        },
        dispose() { for (const gi of G) disposeObj(scene, gi.m); },
      });
      const g = cineGame(A); if (!g) return;
      const lineAt = () => c.clone().addScaledVector(f, D0 - speed * st.t);
      const T1 = 7, T2 = 6, T3 = 6;
      g.cine.play([
        { dur: T1, caption: '땅울림', update: (t, u, out) => {
          const L = lineAt();
          out.pos.copy(c).addScaledVector(f, -Math.min(half * 0.6, 260)).add(v3(0, 35 + Hs * 0.2, 0));
          out.look.copy(L).add(v3(0, Hs * 0.55, 0)); out.fov = 40 - u * 6; out.smooth = 0.15;
        } },
        { dur: T2, caption: '', update: (t, u, out) => {
          const L = lineAt();
          out.pos.copy(L).addScaledVector(dir, Hs * (2.4 - u * 0.6)).addScaledVector(side, Hs * 0.3).add(v3(0, 4, 0));
          out.pos.y = Math.max(out.pos.y, gnd(out.pos.x, out.pos.z) + 4);
          out.look.copy(L).add(v3(0, Hs * 0.9, 0)); out.fov = 62; out.smooth = 0.12;
        } },
        { dur: T3, caption: '', update: (t, u, out) => {
          const L = lineAt();
          out.pos.copy(L).addScaledVector(side, W * 0.32).addScaledVector(dir, Hs * 1.2).add(v3(0, Hs * 0.7, 0));
          out.look.copy(L).addScaledVector(side, -W * 0.1).add(v3(0, Hs * 0.5, 0)); out.fov = 55; out.smooth = 0.12;
        } },
        { dur: Math.max(5, T - T1 - T2 - T3), caption: '', update: (t, u, out) => {
          out.pos.copy(c).addScaledVector(f, -half * 1.1).addScaledVector(side, half * 0.5).add(v3(0, half * 0.75 + 200, 0));
          out.look.copy(lineAt()).lerp(c, 0.4); out.fov = 50; out.smooth = 0.1;
        } },
      ]);
    },
  },
};

export const MOVIE4_ENDINGS = {
  // ×100: 거인의 행진이 지평선 너머까지 모든 것을 밟고 지나감
  rumbling: (A, c) => { wipeMap(A, c, 'impact', { dur: 10 }); worldEnd(A, c, 'impact', { delay: 4 }); },
};
