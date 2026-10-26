// v1.3 새 무기 (하늘·자연재해): 혜성 분열, 궤도 폭격 위성망, 감마선 폭발, 우주 쓰레기 비, 태양 질량 방출,
//                               허리케인, 대홍수, 지각 균열, 모래폭풍, 슈퍼화산
import * as THREE from 'three';
import { makeMeteor } from './models.js';
import { makeAsteroid, glowMat } from './models2.js';
import { cineGame, watch, orbit, chase, camDir } from './cam.js';
import { fxBlast, over, mapPoint, flood, copies } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';
import { funnelMat, Rain, boltMesh } from './storms.js';
import { detonate, nukeYield } from './nukes.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const dispose = (scene, o) => { scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); };

function makeJunk() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35, emissive: 0xff5010, emissiveIntensity: 0.8 });
  const kind = Math.floor(R() * 3);
  if (kind === 0) { g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.6), m)); const p = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a2a6a, metalness: 0.5, roughness: 0.3 })); g.add(p); }
  else if (kind === 1) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 10), m));
  else g.add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 10), m));
  return g;
}

export const NEW2 = {
  // ---- 혜성 분열: 푸른 꼬리를 끄는 혜성이 대기에서 여러 조각으로 갈라져 줄지어 충돌 ----
  comet: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, grid, camera, audio } = A.ctx;
      const f = camDir(camera, v3(p.x, p.y, p.z)), side = v3(-f.z, 0, f.x).multiplyScalar(R() < 0.5 ? 1 : -1);
      const dirIn = side.clone().multiplyScalar(0.8).add(v3(0, -0.6, 0)).normalize();
      const n = Math.round(5 + 4 * S.n ** 0.6);
      const line = side.clone(); // 충돌 지점들이 늘어설 방향
      const pts = [];
      for (let i = 0; i < n; i++) { const d = (i - n / 2) * 45 * S.r ** 0.6 + (R() - 0.5) * 20; const q = v3(p.x, 0, p.z).addScaledVector(line, d).addScaledVector(f, (R() - 0.5) * 40); q.y = grid.sample(q.x, q.z); pts.push(q); }
      const SPD = 900, T = 5;
      const center = v3(p.x, p.y, p.z);
      const start = center.clone().addScaledVector(dirIn, -SPD * T);
      const head = A.spawn(makeAsteroid(), 12 * S.r ** 0.4);
      head.material = head.material.clone(); head.material.emissive.set(0x80c0ff); head.material.color.set(0x8a9aa8);
      const st = { t: 0, pos: start.clone(), split: false, frags: [] };
      audio.whoosh(T);
      A.addActive({
        acc: 0,
        update(dt) {
          st.t += dt;
          const u = Math.min(1, st.t / T);
          if (!st.split) {
            st.pos.copy(start).addScaledVector(dirIn, SPD * T * u);
            head.position.copy(st.pos);
            // 얼음 꼬리 (푸른 이온 꼬리 + 흰 먼지 꼬리)
            for (let i = 0; i < 6; i++) {
              const q = st.pos.clone().addScaledVector(dirIn, -R() * 40);
              fx.fire.emit(q.x, q.y, q.z, -dirIn.x * 300, -dirIn.y * 300 + 20, -dirIn.z * 300, 1.2, 14, 30, [0.6, 0.85, 1, 0.9], [0.2, 0.4, 1, 0], 0.5, 0);
              fx.smoke.emit(q.x, q.y, q.z, -dirIn.x * 80, -dirIn.y * 80, -dirIn.z * 80, 6, 12, 50, [0.9, 0.93, 1, 0.6], [0.85, 0.9, 1, 0], 0.2, 0);
            }
            if (u > 0.55) {
              st.split = true; A.remove(head);
              fx.flash = Math.max(fx.flash, 0.15); audio.crack();
              pts.forEach((q, i) => {
                const from = st.pos.clone().add(v3((R() - 0.5) * 60, (R() - 0.5) * 30, (R() - 0.5) * 60));
                const tt = T * 0.45 + i * 0.15;
                const vel = q.clone().sub(from).divideScalar(tt);
                const sz = (5 + R() * 4) * S.r ** 0.4;
                st.frags.push(A.addProjectile({ mesh: A.spawn(makeMeteor(), sz), pos: from, vel, spin: true, trail: { size: sz, fire: true, every: 0.01 }, ignoreHits: true,
                  onUpdate: (pr) => { if (pr.pos.distanceTo(q) < 80) pr.ignoreHits = false; fx.smoke.emit(pr.pos.x, pr.pos.y, pr.pos.z, 0, 0, 0, 5, sz, sz * 4, [0.9, 0.95, 1, 0.5], [0.8, 0.85, 0.9, 0], 0.1, 0); return true; },
                  onHit: (qq) => { const r = (22 + R() * 10) * S.r; A.blast(qq, r, 46 * S.v, { vap: r * 0.2, crater: [r * 0.5, r * 0.2] }); fx.ring(qq, r * 2.5, 1, 0xcfe8ff, 0.4); } }));
              });
            }
          }
          return st.t < T * 2;
        },
        dispose() { if (!st.split) A.remove(head); },
      });
      const g = cineGame(A); if (!g) return;
      g.cine.play([
        // 혜성이 다가오는 쪽을 마주 보는 자리에서
        watch(center.clone().addScaledVector(side, 520).addScaledVector(f, -250).add(v3(0, 60, 0)), () => (st.split ? center : st.pos), { dur: T * 0.55, fov: 45, caption: '혜성 분열', smooth: 0.2 }),
        watch(center.clone().addScaledVector(side, 380).addScaledVector(f, -200).add(v3(0, 130, 0)), () => { const fr = st.frags.find(x => x && x.pos); return fr ? fr.pos.clone().lerp(center, 0.6) : center; }, { dur: T * 0.9, fov: 58, smooth: 0.4, ts: (u) => (u < 0.6 ? 0.7 : 1) }),
      ]);
    },
  },

  // ---- 궤도 폭격 위성망: 하늘의 위성들이 원을 그리며 빔을 쏘고 가운데로 모여듦 ----
  satnet: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, world, audio, camera } = A.ctx;
      const c = v3(p.x, p.y, p.z);
      const n = Math.round(6 + 4 * S.n ** 0.5), R0 = 140 * S.r ** 0.7, dur = 5 * S.t;
      const beams = [];
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), glowMat(0x9ad8ff, 0.8));
        scene.add(m); beams.push({ m, a: (i / n) * Math.PI * 2 });
      }
      audio.laserStart(); audio.charge(1);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / dur), rad = R0 * (1 - u * 0.95), w = 3 * S.r ** 0.5 * (0.8 + 0.2 * Math.sin(this.t * 40));
          this.acc += dt;
          for (const b of beams) {
            b.a += dt * 0.6;
            const x = c.x + Math.cos(b.a) * rad, z = c.z + Math.sin(b.a) * rad, y = grid.sample(x, z);
            b.m.position.set(x, y + 900, z); b.m.scale.set(w, 1800, w);
            D.laser(x, z, w * 1.6, dt);
            if (this.acc > 0.05) { fx.sparks({ x, y: y + 1, z }, { x: 0, y: 1, z: 0 }, 3); world.paintScorch(x, z, w * 2, 0.4); }
          }
          if (this.acc > 0.05) this.acc = 0;
          fx.addShake(dt * 0.4);
          if (u >= 1) { A.blast(c, 40 * S.r, 50 * S.v, { vap: 8 * S.r, crater: [10 * S.r, 4 * S.r] }); fx.flash = Math.max(fx.flash, 0.25); return false; }
          return true;
        },
        dispose() { for (const b of beams) dispose(scene, b.m); audio.laserStop(); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([orbit(c, { dist: R0 * 2.4 + 100, h: R0 * 1.2 + 60, a0: Math.atan2(-f.z, -f.x) - 0.4, a1: Math.atan2(-f.z, -f.x) + 0.6, dur: dur + 2, look: 0, caption: `궤도 폭격 위성 ${n}기`, fov: 55 })]);
    },
  },

  // ---- 감마선 폭발: 하늘이 보랏빛으로 타오르고 내리꽂힌 방사선에 모든 것이 그을리며 무너짐 ----
  grb: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, world, audio, game } = A.ctx;
      const c = v3(p.x, p.y, p.z), r = 160 * S.r, dur = 4 * S.t;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true), glowMat(0xd8b8ff, 0.6));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), glowMat(0xc8a0ff, 0.5)); disc.rotation.x = -Math.PI / 2; disc.position.set(c.x, c.y + 2, c.z); scene.add(disc);
      cone.position.set(c.x, c.y + 2500, c.z); cone.rotation.x = Math.PI; scene.add(cone);
      const list = D.buildingsNear(c.x, c.z, r).map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).sort((a, b) => a[0] - b[0]);
      let k = 0;
      fx.flash = Math.max(fx.flash, 0.6); audio.nuke();
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / dur);
          cone.scale.set(r * (0.3 + 0.7 * u), 5000, r * (0.3 + 0.7 * u));
          cone.material.opacity = 0.6 * (1 - u * 0.7);
          disc.scale.setScalar(Math.max(1, r * u)); disc.material.opacity = 0.5 * (1 - u * 0.6);
          fx.light(c.x, c.y + 60, c.z, 3e4 * (1 - u), r * 3, 0.05, 0xc8a0ff);
          if (game) game.storm = Math.max(game.storm || 0, 0.4 * (1 - u));
          const cur = r * u;
          while (k < list.length && list[k][0] <= cur) {
            const [d, b] = list[k++];
            if (b.state !== 'intact') continue;
            if (d < r * 0.25) D.vaporizeBuilding(b);
            else { D._darken(b, 0.7); D.flatten(b, 0.8 - 0.5 * d / r, (b.cx - c.x) / d, (b.cz - c.z) / d, 2.5); }
          }
          for (let i = 0; i < 10; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * cur; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.fire.emit(x, grid.sample(x, z) + 2, z, 0, 20 + R() * 30, 0, 1, 6, 2, [0.85, 0.7, 1, 0.9], [0.4, 0.2, 1, 0], 0.5, 2); }
          world.paintScorch(c.x, c.z, cur, 0.1); world.blastTrees(c.x, c.z, cur, cur * 0.6);
          return this.t < dur + 1;
        },
        dispose() { dispose(scene, cone); dispose(scene, disc); if (game) game.storm = 0; },
      });
    },
  },

  // ---- 우주 쓰레기 비: 불타는 위성 파편이 넓은 지역에 쏟아짐 ----
  junk: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { grid } = A.ctx;
      const n = Math.round(40 + 30 * S.n ** 0.7), rr = 220 * S.r ** 0.7;
      const az = R() * 6.28, dirIn = v3(Math.cos(az) * 0.7, -1, Math.sin(az) * 0.7).normalize();
      over(A, n, 9, () => {
        const a = R() * 6.28, d = Math.sqrt(R()) * rr;
        const q = v3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d); q.y = grid.sample(q.x, q.z);
        const sz = 2 + R() * 3;
        A.addProjectile({ mesh: A.spawn(makeJunk(), sz), pos: q.clone().addScaledVector(dirIn, -700), vel: dirIn.clone().multiplyScalar(220 + R() * 60), spin: true, trail: { size: sz * 0.7, fire: true, every: 0.02 },
          onHit: (qq) => A.blast(qq, (6 + R() * 6) * S.r ** 0.8, 26 * S.v, { vap: 1, crater: [2, 0.7], smokeColumn: R() < 0.2, silent: R() > 0.3 }) });
      });
      A.ctx.audio.whoosh(6);
    },
  },

  // ---- 태양 질량 방출: 오로라가 번지고 전력망이 폭발, 도시 곳곳이 불탐 ----
  cme: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, audio, game } = A.ctx;
      const c = v3(p.x, p.y, p.z), r = 300 * S.r ** 0.7, dur = 9;
      // 오로라 커튼
      const mat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uA: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT, uA; varying vec2 vUv;
          void main(){ float w = sin(vUv.x * 40.0 + uT * 1.5) * 0.5 + 0.5; float s = sin(vUv.x * 13.0 - uT * 0.7) * 0.5 + 0.5;
            float a = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.15, vUv.y) * (0.4 + 0.6 * w * s) * uA;
            vec3 c = mix(vec3(0.1, 1.0, 0.5), vec3(0.8, 0.2, 1.0), vUv.y); gl_FragColor = vec4(c * a, a); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const aur = new THREE.Mesh(new THREE.CylinderGeometry(r * 3, r * 3, 900, 96, 1, true), mat);
      aur.position.set(c.x, c.y + 1300, c.z); scene.add(aur);
      audio.hum(dur); audio.charge(2);
      const blds = D.buildingsNear(c.x, c.z, r);
      A.addActive({
        t: 0, next: 1.5,
        update(dt) {
          this.t += dt;
          mat.uniforms.uT.value = this.t; mat.uniforms.uA.value = Math.min(1, this.t / 1.5) * Math.min(1, (dur + 2 - this.t) / 2);
          if (game) game.storm = Math.max(game.storm || 0, 0.35 * mat.uniforms.uA.value);
          this.next -= dt;
          if (this.next <= 0 && this.t < dur) {
            this.next = 0.08 / Math.sqrt(S.n);
            // 변압기·전선 폭발: 전기 불꽃 + 작은 폭발 + 화재
            const b = blds[Math.floor(R() * blds.length)];
            if (b && b.state !== 'gone') {
              const q = v3(b.cx + (R() - 0.5) * 10, b.baseY + R() * b.height, b.cz + (R() - 0.5) * 10);
              fx.sparks(q, { x: 0, y: 1, z: 0 }, 10); fx.light(q.x, q.y, q.z, 8000, 120, 0.1, 0x9ae0ff);
              if (R() < 0.3) A.blast(q, 8 * S.r ** 0.8, 22 * S.v, { vap: 0.5, smokeColumn: false, silent: R() > 0.3 });
              if (R() < 0.15) fx.column(q, 3, 14);
              if (R() < 0.2) { audio.crack(); const from = q.clone().add(v3((R() - 0.5) * 40, 30, (R() - 0.5) * 40)); const bolt = boltMesh(from, q); bolt.scale.set(0.3, 1, 0.3); scene.add(bolt); A.addActive({ t: 0, update(d) { this.t += d; return this.t < 0.15; }, dispose() { dispose(scene, bolt); } }); }
            }
          }
          return this.t < dur + 2;
        },
        dispose() { dispose(scene, aur); if (game) game.storm = 0; },
      });
    },
  },

  // ---- 허리케인: 소용돌이 구름 원판 + 폭풍우, 지붕부터 뜯겨 나가고 해일이 밀려듦 ----
  hurricane: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, audio, game, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z), r = 260 * S.r ** 0.8, dur = 18 * S.t;
      const disk = new THREE.Mesh(new THREE.CircleGeometry(r * 3, 96), funnelMat([0.55, 0.56, 0.6], 0.9, 1.2));
      disk.rotation.x = Math.PI / 2; disk.position.set(c.x, c.y + 500, c.z); disk.renderOrder = 10; scene.add(disk);
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.12, 500, 48, 8, true), funnelMat([0.5, 0.52, 0.56], 0.6, 2.5));
      eye.position.set(c.x, c.y + 250, c.z); eye.renderOrder = 10; scene.add(eye);
      const rain = new Rain(scene);
      audio.wind(dur); audio.rumble(dur * 0.6);
      A.addActive({
        t: 0, acc: 0,
        update(dt, aim) {
          this.t += dt;
          const k = Math.min(1, this.t / 3) * Math.min(1, (dur - this.t) / 3);
          disk.rotation.z += dt * 0.25; eye.rotation.y += dt * 0.6;
          disk.material.uniforms.uTime.value = eye.material.uniforms.uTime.value = this.t;
          disk.material.uniforms.uFade.value = eye.material.uniforms.uFade.value = k;
          if (game) game.storm = Math.max(0, k);
          rain.update(dt, camera, k);
          D.field({ x: c.x, y: c.y, z: c.z, r, mode: 'vortex', grab: r * 0.9, strength: 12 * S.v * k, height: 120 }, dt);
          // 지붕부터 뜯기는 바람
          this.acc += dt;
          if (this.acc > 0.3) {
            this.acc = 0;
            for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; fx.smoke.emit(x, grid.sample(x, z) + 10 + R() * 40, z, -Math.sin(a) * 40, 4, Math.cos(a) * 40, 4, 12, 40, [0.6, 0.6, 0.62, 0.4], [0.6, 0.6, 0.62, 0], 0.2, 0); }
          }
          return this.t < dur;
        },
        dispose() { dispose(scene, disk); dispose(scene, eye); rain.dispose(); if (game) game.storm = 0; },
      });
      if (S.P >= 10) A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t > 5) { flood(A, { dur: 10, color: 0x4a6a7a }); return false; } return true; } });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([orbit(c, { dist: r * 2.6, h: r * 1.6, a0: Math.atan2(-f.z, -f.x) - 0.3, a1: Math.atan2(-f.z, -f.x) + 0.5, dur: 6, look: 0, caption: '허리케인', fov: 55 })]);
    },
  },

  // ---- 대홍수: 하늘이 어두워지고 비가 쏟아지며 물이 빌딩 꼭대기까지 차오름 ----
  deluge: {
    fire(A, hit) {
      const S = A.S, { scene, game, camera, audio } = A.ctx;
      const dur = 14 / Math.max(0.6, S.t);
      const rain = new Rain(scene);
      audio.wind(dur + 6); audio.rumble(dur);
      A.addActive({ t: 0, update(dt) { this.t += dt; const k = Math.min(1, this.t / 2) * Math.min(1, (dur + 8 - this.t) / 3); if (game) game.storm = k; rain.update(dt, camera, k); return this.t < dur + 8; }, dispose() { rain.dispose(); if (game) game.storm = 0; } });
      // 위력이 낮으면 저지대만, 높으면 꼭대기까지
      flood(A, { dur, color: 0x3d5e70, height: Math.min(1, 0.25 + 0.75 * Math.log10(S.P) / 2) });
    },
  },

  // ---- 지각 균열: 표적을 가로지르는 단층이 열려 양쪽 땅이 무너져 내림 ----
  rift: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, world, camera, audio } = A.ctx;
      const f = camDir(camera, v3(p.x, p.y, p.z)), dir = v3(-f.z, 0, f.x);
      const L = 500 * S.r ** 0.7, W = 14 * S.r ** 0.6, depth = 30 * S.r ** 0.5;
      const n = Math.ceil(L / 15);
      audio.rumble(6);
      A.addActive({
        t: 0, k: 0,
        update(dt) {
          this.t += dt;
          const want = Math.min(n, Math.floor(this.t / 3 * n));
          while (this.k < want) {
            const s = (this.k / n - 0.5) * L; this.k++;
            const x = p.x + dir.x * s + (R() - 0.5) * 6, z = p.z + dir.z * s + (R() - 0.5) * 6;
            A.crater(x, z, W, depth);
            D.sink(x, z, W * 2.2, 0.4, 30);
            world.paintScorch(x, z, W * 1.4, 0.7);
            for (let i = 0; i < 4; i++) fx.fire.emit(x + (R() - 0.5) * W, grid.sample(x, z) + 1, z + (R() - 0.5) * W, 0, 8 + R() * 10, 0, 2, W * 0.6, W * 0.2, [1, 0.55, 0.15, 1], [0.6, 0.1, 0.02, 0], 0.4, 1);
            fx.dust({ x, y: grid.sample(x, z) + 2, z }, W * 0.6);
          }
          D.quake(p.x, p.z, L * 0.6, 0.8 * S.v, dt);
          fx.addShake(dt * 1.5);
          return this.t < 6;
        },
      });
    },
  },

  // ---- 모래폭풍: 갈색 모래벽이 밀려와 시야를 가리고 건물을 깎아냄 ----
  sandstorm: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, camera, audio, game } = A.ctx;
      const dir = camDir(camera, v3(p.x, p.y, p.z)).negate();
      const halfW = 400 * S.r ** 0.6, dur = 16;
      const src = v3(p.x, 0, p.z).addScaledVector(dir, -600);
      audio.wind(dur);
      A.addActive({
        t: 0, front: 0, prev: 0, acc: 0,
        update(dt) {
          this.t += dt;
          this.front += 55 * dt;
          const fx0 = src.x + dir.x * this.front, fz0 = src.z + dir.z * this.front;
          const k = Math.min(1, this.t / 2) * Math.min(1, (dur - this.t) / 3);
          if (game) { game.storm = Math.max(0, 0.5 * k); if (!game._sandSet && this.front > 600) { game._sandSet = true; game.setDoom(0.45 * k + 0.2, 'dust'); } }
          this.acc += dt;
          while (this.acc > 0.008) {
            this.acc -= 0.008;
            const l = (R() - 0.5) * 2 * halfW;
            const x = fx0 - dir.z * l, z = fz0 + dir.x * l, y = grid.sample(x, z);
            fx.smoke.emit(x, y + R() * 120, z, dir.x * 50, 5, dir.z * 50, 5 + R() * 3, 30, 110, [0.72, 0.56, 0.36, 0.7], [0.7, 0.58, 0.4, 0], 0.2, 0.2);
          }
          // 바람에 깎이는 건물 (높은 층부터, 위력이 높으면 통째로)
          D.sweep({ ox: src.x, oz: src.z, dx: dir.x, dz: dir.z, prev: this.prev, front: this.front, halfW, waterY: 1e9, power: 3 * S.v }, dt);
          if (S.P > 20) for (const b of D.buildingsNear(fx0, fz0, 60)) if (b.state === 'intact' && R() < dt * 0.4) D.flatten(b, 0.5, dir.x, dir.z, 3);
          this.prev = this.front;
          return this.t < dur;
        },
        dispose() { if (game) { game.storm = 0; game._sandSet = false; } },
      });
    },
  },

  // ---- 슈퍼화산: 일대 전체가 고리 모양으로 분화하며 칼데라가 꺼지고 화산재가 하늘을 덮음 ----
  supervolcano: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, world, audio, game, camera } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const Rk = Math.min(grid.span * 0.45, 220 * S.r ** 0.7);
      const vents = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; vents.push(v3(c.x + Math.cos(a) * Rk, 0, c.z + Math.sin(a) * Rk)); }
      audio.rumble(4);
      A.addActive({
        t: 0, st: 0, acc: 0,
        update(dt) {
          this.t += dt;
          if (this.t < 3) { D.quake(c.x, c.z, Rk * 1.4, 1.2, dt); fx.addShake(dt * 1.5); A.crater(c.x, c.z, Rk * 1.2, -dt * 3); return true; }
          if (this.st === 0) {
            this.st = 1; audio.nuke(); fx.flash = Math.max(fx.flash, 0.2);
            for (const v of vents) { v.y = grid.sample(v.x, v.z); A.blast(v, 45 * S.r ** 0.6, 50 * S.v, { vap: 5, crater: [18, 8] }); }
            detonate(A, c, { kt: nukeYield(S.P) * 0.4, kind: 'ash', pullback: false, light: true });
          }
          // 칼데라 붕괴
          if (this.st === 1 && this.t > 5) { this.st = 2; A.crater(c.x, c.z, Rk * 1.05, 45 * S.r ** 0.4); crustCollapse(A, c, { level: 0.4, cracks: 6, dur: 6 }); }
          this.acc += dt;
          while (this.acc > 0.02) {
            this.acc -= 0.02;
            const v = vents[Math.floor(R() * vents.length)];
            fx.smoke.emit(v.x, v.y + 20, v.z, (R() - 0.5) * 10, 40 + R() * 40, (R() - 0.5) * 10, 18, 40, 200, [0.15, 0.13, 0.12, 0.9], [0.25, 0.24, 0.23, 0], 0.05, 3);
            fx.fire.emit(v.x, v.y + 5, v.z, (R() - 0.5) * 40, 50 + R() * 80, (R() - 0.5) * 40, 2, 6, 2, [1, 0.6, 0.2, 1], [0.7, 0.1, 0.02, 0], 0.2, -25);
          }
          if (game && this.t > 4) game.setDoom(Math.min(0.85, 0.3 + S.P / 120), 'ash');
          return this.t < 20;
        },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([orbit(c, { dist: Rk * 3, h: Rk * 1.1, a0: Math.atan2(-f.z, -f.x) - 0.3, a1: Math.atan2(-f.z, -f.x) + 0.6, dur: 10, look: 60, caption: '슈퍼화산', fov: 55 })]);
    },
  },
};

export const NEW2_ENDINGS = {
  comet: (A, c) => { copies(A, 'comet', 6, 6); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'ice', { delay: 3, planetKind: 'impact' }); },
  satnet: (A, c) => { copies(A, 'satnet', 8, 4); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'fire', { delay: 2 }); },
  grb: (A, c) => { wipeMap(A, c, 'anti', { dur: 5 }); worldEnd(A, c, 'void', { delay: 1, planetKind: 'fire' }); },
  junk: (A, c) => { copies(A, 'junk', 5, 6); wipeMap(A, c, 'nuke', { dur: 12 }); worldEnd(A, c, 'fire', { delay: 4 }); },
  cme: (A, c) => { wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'fire', { delay: 3 }); },
  hurricane: (A, c) => { copies(A, 'hurricane', 3, 4); wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'water', { delay: 5 }); },
  deluge: (A, c) => { worldEnd(A, c, 'water', { delay: 6 }); },
  rift: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 14 }); wipeMap(A, c, 'nuke', { dur: 8 }); worldEnd(A, c, 'crack', { delay: 2 }); },
  sandstorm: (A, c) => { wipeMap(A, c, 'nuke', { dur: 14 }); worldEnd(A, c, 'dust', { delay: 4, planetKind: 'ash' }); },
  supervolcano: (A, c) => { crustCollapse(A, c, { level: 1, dur: 12 }); wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'ash', { delay: 3 }); },
};
