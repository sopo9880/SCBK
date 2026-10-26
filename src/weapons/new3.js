// v1.3 새 무기 (특수·놀이·종말): 포털, 축소·확대 광선, 나노 분해, 시간 정지,
//                                크레인 진자 철구, 거대 망치, 거대 구슬 폭포, 거대 진공청소기, 달 낙하, 행성 충돌, 태양 낙하
import * as THREE from 'three';
import { glowMat } from './models2.js';
import { cineGame, watch, orbit, camDir } from './cam.js';
import { fxBlast, over, mapPoint, flood, liftAll } from './endings.js';
import { worldEnd, wipeMap, crustCollapse } from './apocalypse.js';
import { detonate, nukeYield } from './nukes.js';
import { funScale } from './defs.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const dispose = (scene, o) => { scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); };

// 달·행성 표면 (크레이터 무늬 캔버스)
function craterTex(base = '#8c8b88', dark = '#5e5d5a', n = 260) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + R() * 0.04})`; g.fillRect(R() * 1024, R() * 512, 2 + R() * 30, 2 + R() * 30); }
  for (let i = 0; i < 18; i++) { g.fillStyle = dark; g.globalAlpha = 0.35; g.beginPath(); g.ellipse(R() * 1024, R() * 512, 40 + R() * 120, 30 + R() * 80, R() * 3, 0, 6.3); g.fill(); }
  g.globalAlpha = 1;
  for (let i = 0; i < n; i++) {
    const x = R() * 1024, y = R() * 512, r = 2 + R() ** 3 * 40;
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = Math.max(1, r * 0.15); g.beginPath(); g.arc(x, y, r, 0, 6.3); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(x + r * 0.15, y + r * 0.15, r * 0.8, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makePortal(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 12, 64), glowMat(color, 1));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.96, 48), glowMat(color, 0.35));
  ring.rotation.x = disc.rotation.x = -Math.PI / 2;
  g.add(ring, disc);
  return g;
}

export const NEW3 = {
  // ---- 포털: 땅의 포털이 건물을 삼키고, 하늘의 포털에서 그대로 떨어뜨림 ----
  portal: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, audio, camera } = A.ctx;
      const r = 40 * S.r ** 0.8;
      const c = v3(p.x, grid.sample(p.x, p.z) + 0.6, p.z);
      const sky = c.clone().add(v3(0, 260 + r * 2, 0));
      const pin = makePortal(0x3aa8ff), pout = makePortal(0xff8a2a);
      pin.position.copy(c); pout.position.copy(sky); pout.rotation.x = Math.PI;
      scene.add(pin, pout);
      const queue = [];
      audio.hum(9); audio.charge(1);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const k = Math.min(1, this.t / 0.8) * Math.min(1, (9 - this.t) / 1);
          pin.scale.setScalar(r * k); pout.scale.setScalar(r * k);
          pin.rotation.y += dt * 2; pout.rotation.y -= dt * 2;
          // 포털 위 조각은 빨려 들어감
          for (const ch of D.gather(c.x, c.z, r * k, 0)) {
            if (R() > dt * 3) continue;
            const pos = D.chunkPos(ch);
            if (pos.y - c.y > 6 + 30 * (1 - Math.hypot(pos.x - c.x, pos.z - c.z) / r) && ch.state === 0) { D.launch(ch, (c.x - pos.x) * 0.3, -10, (c.z - pos.z) * 0.3); continue; }
            D.removeChunk(ch); queue.push(ch);
          }
          // 하늘 포털에서 다시 나옴
          this.acc += dt * 60;
          while (this.acc > 1 && queue.length) {
            this.acc -= 1;
            const ch = queue.shift();
            const a = R() * 6.28, d = Math.sqrt(R()) * r * 0.8;
            D.respawn(ch, sky.x + Math.cos(a) * d, sky.y - 4, sky.z + Math.sin(a) * d, (R() - 0.5) * 6, -25 - R() * 10, (R() - 0.5) * 6);
          }
          if (this.acc > 1) this.acc = 1;
          fx.light(sky.x, sky.y, sky.z, 8000, r * 6, 0.05, 0xff9a40);
          return this.t < 9 || queue.length > 0 && this.t < 20;
        },
        dispose() { dispose(scene, pin); dispose(scene, pout); },
      });
      const g = cineGame(A); if (!g) return;
      const f = camDir(camera, c);
      g.cine.play([watch(c.clone().addScaledVector(f, -r * 4).add(v3(0, 60, 0)), c.clone().add(v3(0, 110, 0)), { dur: 7, fov: 62, caption: '포털', smooth: 0.3 })]);
    },
  },

  // ---- 축소·확대 광선: 겨눈 건물이 작아져 사라지거나, 거대해져 이웃을 짓누른 뒤 무너짐 ----
  shrink: {
    fire(A, hit, cam) {
      const S = A.S, p = hit.point, { D, fx, scene, audio } = A.ctx;
      const b = hit.info && (hit.info.b || (hit.info.chunk && hit.info.chunk.b));
      const big = !!A.opts.enlarge;
      const from = cam.clone().add(v3(0, -5, 0));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 12, 1, true), glowMat(big ? 0xff6ab0 : 0x6affd8, 0.8));
      const to = v3(p.x, p.y, p.z);
      beam.position.copy(from).lerp(to, 0.5); beam.scale.set(1, from.distanceTo(to), 1);
      beam.quaternion.setFromUnitVectors(v3(0, 1, 0), to.clone().sub(from).normalize());
      scene.add(beam);
      audio.laserStart();
      A.addActive({ t: 0, update(dt) { this.t += dt; beam.material.opacity = 0.8 * (1 - this.t); return this.t < 1; }, dispose() { dispose(scene, beam); audio.laserStop(); } });
      // 맞힌 건물 + 위력에 따라 주변 건물도
      const targets = [b, ...D.buildingsNear(p.x, p.z, 30 * S.r ** 0.8).filter(x => x !== b)].filter(x => x && x.state === 'intact').slice(0, Math.max(1, Math.round(S.n * 0.8)));
      for (const t of targets) {
        if (!big) {
          D.scaleBuilding(t, 0.02, 2.2 + R(), null, () => { D.vaporizeBuilding(t); fx.sparks({ x: t.cx, y: t.baseY + 1, z: t.cz }, { x: 0, y: 1, z: 0 }, 12); });
        } else {
          const g = 2.5 + S.r * 0.8;
          const hitN = new Set();
          D.scaleBuilding(t, g, 3, (sc) => {
            // 커지면서 닿는 이웃 건물을 밀어 부숨
            const ext = Math.max(t.maxx - t.minx, t.maxz - t.minz) * 0.5 * sc;
            for (const nb of D.buildingsNear(t.cx, t.cz, ext)) { if (nb === t || hitN.has(nb) || nb.state !== 'intact') continue; hitN.add(nb); D.blastFrom(nb, v3(t.cx, t.baseY, t.cz), 30 * S.v, { lift: 0.15, lod: 1 }); }
          }, () => { D.flatten(t, 1, R() - 0.5, R() - 0.5, 2.4); t.state = 'collapsing'; fx.collapseDust(t); audio.crumble(60); });
        }
      }
    },
  },

  // ---- 나노 분해: 회색 나노머신이 퍼지며 닿는 건물을 모래처럼 무너뜨림 ----
  nano: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, world, audio } = A.ctx;
      const c = v3(p.x, p.y, p.z), R0 = 160 * S.r ** 0.8, dur = 14;
      const list = D.buildingsNear(c.x, c.z, R0).map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).sort((a, b) => a[0] - b[0]);
      let k = 0;
      audio.hum(dur);
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const cur = R0 * Math.min(1, this.t / dur) ** 0.8;
          while (k < list.length && list[k][0] <= cur) {
            const b = list[k++][1];
            if (b.state !== 'intact') continue;
            D.tint(b, new THREE.Color(0x55585c), 0.7);
            D.flatten(b, 1, 0, 0, 3 + R() * 2);
            for (let i = 0; i < 20; i++) fx.smoke.emit(b.cx + (R() - 0.5) * 20, b.baseY + R() * b.height, b.cz + (R() - 0.5) * 20, (R() - 0.5) * 2, -4, (R() - 0.5) * 2, 4, 2, 6, [0.4, 0.42, 0.44, 0.8], [0.35, 0.36, 0.38, 0], 0.5, -0.5);
          }
          if ((this.acc += dt) > 0.2) { this.acc = 0; world.paintScorch(c.x, c.z, cur, 0.08); for (const ch of D.gather(c.x, c.z, cur, 2)) if (R() < 0.05) D.removeChunk(ch); }
          return this.t < dur;
        },
      });
    },
  },

  // ---- 시간 정지: 몇 초 동안 시간이 거의 멈춤. 그동안 쏜 무기는 멈춘 채 쌓였다가 한꺼번에 재생 ----
  timestop: {
    fire(A) {
      const { D, hud, audio } = A.ctx;
      const dur = 6 + A.S.t * 3;
      const prev = D.timeScale;
      D.timeScale = 0.015;
      document.body.classList.add('timestop');
      audio.rewind(0.8);
      if (hud) hud.toast(`시간 정지 ${dur.toFixed(0)}초 — 지금 마음껏 쏘세요`, 'info');
      A.addActive({
        real: 0,
        update(dt) {
          // 무기 시간도 멈춰 있으므로 실제 시간으로 되돌려 계산
          this.real += dt / Math.max(0.001, D.timeScale);
          if (this.real >= dur) { D.timeScale = prev === 0.015 ? 1 : prev; document.body.classList.remove('timestop'); audio.whoosh(1); return false; }
          return true;
        },
        dispose() { if (D.timeScale === 0.015) D.timeScale = 1; document.body.classList.remove('timestop'); },
      });
    },
  },

  // ---- 크레인 진자 철구: 거대 크레인의 철구가 좌우로 휘둘러 건물 줄을 쓸어냄 ----
  pendulum: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, audio, camera } = A.ctx;
      const G = funScale(A), sc = G.giant ? G.size : 1.3, hm = G.hit;
      const dir = v3(-camDir(camera, v3(p.x, p.y, p.z)).z, 0, camDir(camera, v3(p.x, p.y, p.z)).x);
      const L = 90 * sc, br = 7 * sc;
      const gy = grid.sample(p.x, p.z);
      const pivot = v3(p.x, gy + L + br + 4, p.z);
      // 크레인: 탑 + 지브 + 케이블
      const crane = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0xe0b020, metalness: 0.6, roughness: 0.4 });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4 * sc, pivot.y - gy + 20 * sc, 4 * sc), steel);
      const towerPos = v3(p.x, 0, p.z).addScaledVector(camDir(camera, v3(p.x, p.y, p.z)), -L * 0.9);
      tower.position.set(towerPos.x, (gy + pivot.y + 20 * sc) / 2, towerPos.z); crane.add(tower);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(2.4 * sc, 2.4 * sc, 1), steel);
      jib.position.copy(towerPos.clone().lerp(pivot, 0.5)).setY(pivot.y + 2); jib.scale.z = towerPos.clone().setY(0).distanceTo(pivot.clone().setY(0)) + 10;
      jib.lookAt(pivot.x, pivot.y + 2, pivot.z); crane.add(jib);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * sc, 0.3 * sc, 1, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      const ballM = new THREE.Mesh(new THREE.SphereGeometry(br, 24, 16), new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.9, roughness: 0.25 }));
      ballM.castShadow = true; crane.add(cable, ballM); scene.add(crane);
      const swings = 3, w = Math.sqrt(9.81 / L) * 1.4;
      audio.whoosh(2);
      A.addActive({
        t: 0, acc: 0, prevPos: null,
        update(dt) {
          this.t += dt;
          const amp = 1.25 * Math.exp(-this.t * 0.05);
          const th = amp * Math.cos(w * this.t);
          const pos = pivot.clone().addScaledVector(dir, Math.sin(th) * L).add(v3(0, -Math.cos(th) * L, 0));
          ballM.position.copy(pos);
          cable.position.copy(pivot).lerp(pos, 0.5); cable.scale.y = L; cable.quaternion.setFromUnitVectors(v3(0, 1, 0), pivot.clone().sub(pos).normalize());
          if ((this.acc += dt) > 0.06) {
            this.acc = 0;
            const sp = this.prevPos ? pos.distanceTo(this.prevPos) / 0.06 : 0;
            if (sp > 6) D.explode({ x: pos.x, y: pos.y, z: pos.z, r: br * 1.3 + (G.giant ? 0 : 6 * hm), power: Math.min(60, sp * 0.8) * G.pw, lift: 0.15, lod: 1, lodBudget: 2 });
            this.prevPos = pos.clone();
          }
          return this.t < (swings * 2 * Math.PI) / w;
        },
        dispose() { dispose(scene, crane); },
      });
    },
  },

  // ---- 거대 망치: 하늘에서 내려온 망치가 두 번 내리침 ----
  hammer: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, grid, scene, audio, camera, world } = A.ctx;
      const G = funScale(A), sc = G.giant ? G.size : 1.3, hm = G.giant ? sc : G.hit;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const f = camDir(camera, c), side = v3(-f.z, 0, f.x);
      const len = 120 * sc, head = 30 * sc;
      const ham = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: 0x5a5f66, metalness: 0.85, roughness: 0.3 });
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(3 * sc, 3.6 * sc, len, 12), wood); handle.position.y = len / 2; ham.add(handle);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(head * 1.6, head, head), iron); hd.position.y = len; ham.add(hd);
      ham.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const pivot = c.clone().addScaledVector(side, -len); pivot.y = c.y + head * 0.5;
      ham.position.copy(pivot); scene.add(ham);
      const axis = f.clone();
      const slam = (q) => {
        D.explode({ x: q.x, y: q.y + 4, z: q.z, r: head * 1.4 * (hm / sc), power: 50 * G.pw, lift: -0.9, scorch: 0.1, lod: 0 });
        A.crater(q.x, q.z, head * 0.9 * (hm / sc), head * 0.18 * (hm / sc));
        fx.ring(q, head * 4 * (hm / sc), 1.2, 0xd0b090, 0.5); fx.addShake(2.5); audio.boom(2.8, camera.position.distanceTo(q)); world.blastTrees(q.x, q.z, head * 3, head);
        for (let i = 0; i < 30 * A.ctx.quality.fxScale; i++) { const a = R() * 6.28; fx.dust({ x: q.x + Math.cos(a) * head, y: q.y + 1, z: q.z + Math.sin(a) * head }, 8); }
      };
      audio.whoosh(1.5);
      A.addActive({
        t: 0, hits: 0,
        update(dt) {
          this.t += dt;
          const cyc = this.t % 2.2, n = Math.floor(this.t / 2.2);
          // 들어올림(0~1.2s) → 내리침(1.2~1.5s) → 머묾
          let ang;
          if (cyc < 1.2) ang = -0.15 - 1.5 * Math.sin((cyc / 1.2) * Math.PI / 2);
          else if (cyc < 1.5) ang = -1.65 + 1.65 * ((cyc - 1.2) / 0.3) ** 2 + -0.0;
          else ang = 0;
          ham.quaternion.setFromAxisAngle(axis, Math.PI / 2 + ang);
          if (cyc >= 1.5 && this.hits <= n) { this.hits = n + 1; slam(c.clone().addScaledVector(side, (n - 0.5) * head * 0.6)); }
          return this.t < 4.4;
        },
        dispose() { dispose(scene, ham); },
      });
    },
  },

  // ---- 거대 구슬 폭포: 유리구슬 수십 개가 쏟아져 굴러다니며 부딪힘 ----
  marbles: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, scene } = A.ctx;
      const G = funScale(A);
      const n = Math.round(14 + 8 * S.n ** 0.6), r0 = 5 * (G.giant ? G.size : 1.2);
      over(A, n, 4, () => {
        const r = r0 * (0.7 + R() * 0.6);
        const col = new THREE.Color().setHSL(R(), 0.8, 0.55);
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85, emissive: col, emissiveIntensity: 0.15 }));
        m.scale.setScalar(r); m.castShadow = true; scene.add(m);
        const a = R() * 6.28, d = R() * 40;
        const pos = v3(p.x + Math.cos(a) * d, p.y + 160 + R() * 60, p.z + Math.sin(a) * d);
        D.addBall(pos, v3((R() - 0.5) * 20, -10, (R() - 0.5) * 20), r, m, { life: 25, onHit: G.giant ? null : (b) => A.blast({ x: b.cx, y: b.baseY + b.height * 0.3, z: b.cz }, 4 * G.hit, 24 * G.pw, { silent: true, smokeColumn: false }) });
      });
      A.ctx.audio.whoosh(3);
    },
  },

  // ---- 거대 진공청소기: 하늘에서 내려온 흡입구가 누르는 동안 모든 걸 빨아들임 ----
  hoover: {
    holdStart(A, hit) {
      const { scene } = A.ctx;
      const G = funScale(A), sc = G.giant ? G.size : 1.3;
      const g = new THREE.Group();
      const plastic = new THREE.MeshStandardMaterial({ color: 0xd8422e, roughness: 0.4, metalness: 0.1 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 });
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(8 * sc, 16 * sc, 30 * sc, 24, 1, true), plastic); nozzle.position.y = 15 * sc; g.add(nozzle);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(16 * sc, 1.6 * sc, 8, 32), dark); lip.rotation.x = Math.PI / 2; g.add(lip);
      const hose = new THREE.Mesh(new THREE.CylinderGeometry(7 * sc, 7 * sc, 900, 16, 30, true), dark); hose.position.y = 30 * sc + 450; g.add(hose);
      for (let i = 0; i < 30; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(7.4 * sc, 0.9 * sc, 6, 16), dark); rib.rotation.x = Math.PI / 2; rib.position.y = 30 * sc + i * 20; g.add(rib); }
      const p = hit ? hit.point : v3();
      g.position.set(p.x, p.y + 300, p.z); scene.add(g);
      A.ctx.audio.wind(30); A.ctx.audio.hum(30);
      return { g, sc, t: 0, eaten: 0, aim: v3(p.x, p.y, p.z) };
    },
    holdUpdate(A, L, dt, aim) {
      const S = A.S, { D, fx, grid } = A.ctx;
      const G = funScale(A);
      L.t += dt;
      if (aim) L.aim.set(aim.x, aim.y, aim.z);
      const gy = grid.sample(L.aim.x, L.aim.z);
      const want = v3(L.aim.x, gy + 25 * L.sc, L.aim.z);
      L.g.position.lerp(want, Math.min(1, dt * 3));
      const mouth = L.g.position.clone();
      const r = 70 * (G.giant ? L.sc : G.hit * 0.8);
      L.eaten += D.field({ x: mouth.x, y: mouth.y, z: mouth.z, r, mode: 'gravity', core: 14 * L.sc, grab: r * 0.6, strength: 60 * G.pw, consume: true }, dt);
      for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = r * (0.4 + R() * 0.6); const x = mouth.x + Math.cos(a) * d, z = mouth.z + Math.sin(a) * d; fx.smoke.emit(x, grid.sample(x, z) + 1, z, (mouth.x - x) * 1.2, 12, (mouth.z - z) * 1.2, 1, 6, 1, [0.6, 0.58, 0.55, 0.5], [0.6, 0.58, 0.55, 0], 0, 0); }
      fx.addShake(dt * 0.4);
    },
    holdEnd(A, L) {
      const g = L.g;
      if (A.ctx.hud && L.eaten) A.ctx.hud.toast(`조각 ${L.eaten.toLocaleString()}개를 빨아들였습니다`, 'info');
      A.addActive({ t: 0, update(dt) { this.t += dt; g.position.y += dt * 300; return this.t < 2; }, dispose() { dispose(A.ctx.scene, g); } });
    },
  },

  // ---- 달 낙하: 달이 점점 커지며 다가와 조석력으로 물이 차오르고 떠오르다 충돌 ----
  moonfall: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, grid, game, camera, D, fx, audio } = A.ctx;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const Rm = 160 * S.P ** 0.62;                 // ×1: 작은 위성 160m … ×100: 2.8km
      const f = camDir(camera, tgt), side = v3(-f.z, 0, f.x);
      const dirIn = f.clone().multiplyScalar(0.4).addScaledVector(side, 0.3).add(v3(0, -0.85, 0)).normalize();
      const T = 14, D0 = Rm * 40 + 20000;
      const moon = new THREE.Mesh(new THREE.SphereGeometry(Rm, 64, 32), new THREE.MeshStandardMaterial({ map: craterTex(), roughness: 1, metalness: 0 }));
      scene.add(moon);
      if (game) game.ensureView(D0 * 1.5, D0);
      audio.rumble(T + 2);
      let lifted = false, flooded = false;
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T);
          const d = D0 * (1 - u) ** 1.6 + Rm * 0.9;
          moon.position.copy(tgt).addScaledVector(dirIn, -d);
          moon.rotation.y += dt * 0.05;
          // 조석력: 중력 약해지고 파편이 떠오름, 물 차오름
          const tide = Math.max(0, (u - 0.5) / 0.5);
          D.phys.setGravity(0, -9.81 * (1 - 0.7 * tide), 0);
          if (!flooded && u > 0.5 && S.P >= 10) { flooded = true; flood(A, { dur: T * 0.5, height: Math.min(0.8, 0.2 + S.P / 150) }); }
          if (!lifted && u > 0.7 && S.P >= 30) { lifted = true; for (const ch of D.loose) if (ch.state !== 3 && R() < 0.5) D.launch(ch, 0, 8 + R() * 10, 0); }
          fx.addShake(dt * tide * 1.2);
          if (u >= 1) {
            D.phys.setGravity(0, -9.81, 0);
            moon.visible = false;
            detonate(A, tgt, { kt: nukeYield(S.P) * 20, kind: 'impact', pullback: false });
            if (S.P >= 40 && game) A.addActive({ t: 0, update(x) { this.t += x; if (this.t > 10 && !game.cine.active) { game.playPlanet('shatter'); return false; } return this.t < 40; } });
            return false;
          }
          return true;
        },
        dispose() { scene.remove(moon); moon.geometry.dispose(); moon.material.map.dispose(); moon.material.dispose(); D.phys.setGravity(0, -9.81, 0); },
      });
      const g = cineGame(A); if (!g) return;
      const low = tgt.clone().addScaledVector(f, -600).addScaledVector(side, 200); low.y = tgt.y + 30;
      g.cine.play([
        watch(low, () => moon.position, { dur: T * 0.55, fov: 50, caption: S.P >= 40 ? '달이 떨어진다' : '작은 위성 낙하', smooth: 0.3 }),
        watch(() => low.clone().add(v3(0, 120, 0)), () => moon.position.clone().lerp(tgt, 0.5), { dur: T * 0.45, fov: 62, smooth: 0.3 }),
      ]);
    },
  },

  // ---- 행성 충돌: 떠돌이 행성이 하늘을 가득 채우며 다가옴 ----
  planetcrash: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, grid, game, camera, fx, audio, D } = A.ctx;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const Rp = 1500 * S.P ** 0.6;
      const f = camDir(camera, tgt);
      const dirIn = f.clone().multiplyScalar(0.6).add(v3(0, -0.8, 0)).normalize();
      const T = 16, D0 = Rp * 12 + 30000;
      const pl = new THREE.Mesh(new THREE.SphereGeometry(Rp, 64, 32), new THREE.MeshStandardMaterial({ map: craterTex('#8a5a3a', '#4a2a1a', 120), roughness: 1 }));
      const atm = new THREE.Mesh(new THREE.SphereGeometry(Rp * 1.06, 48, 24), glowMat(0xff8a50, 0.18)); atm.material.side = THREE.BackSide;
      scene.add(pl, atm);
      if (game) game.ensureView(D0 * 1.5, D0);
      audio.rumble(T); audio.drone(T);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T);
          const d = D0 * (1 - u) ** 1.4 + Rp * 0.95;
          pl.position.copy(tgt).addScaledVector(dirIn, -d); atm.position.copy(pl.position);
          pl.rotation.y += dt * 0.08;
          if (game) game.storm = Math.max(game.storm || 0, 0.6 * u);
          if (u > 0.6) { D.quake(tgt.x, tgt.z, grid.span, (u - 0.6) * 3, dt); fx.addShake(dt * 2); }
          if (u >= 1) {
            pl.visible = atm.visible = false;
            fx.flash = Math.max(fx.flash, 1);
            detonate(A, tgt, { kt: nukeYield(S.P) * 200, kind: 'impact', pullback: false });
            if (S.P >= 20 && game) A.addActive({ t: 0, update(x) { this.t += x; if (this.t > 6 && !game.cine.active) { game.playPlanet('shatter'); return false; } return this.t < 40; } });
            return false;
          }
          return true;
        },
        dispose() { scene.remove(pl, atm); pl.geometry.dispose(); pl.material.map.dispose(); pl.material.dispose(); atm.geometry.dispose(); atm.material.dispose(); if (game) game.storm = 0; },
      });
      const g = cineGame(A); if (!g) return;
      const low = tgt.clone().addScaledVector(f, -900); low.y = tgt.y + 40;
      g.cine.play([watch(low, () => pl.position, { dur: T, fov: (u) => 55 + u * 20, caption: '행성 충돌', smooth: 0.3 })]);
    },
  },

  // ---- 태양 낙하: 해가 점점 커지며 하늘이 불타고 도시가 녹아내림 ----
  sunfall: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { scene, grid, game, fx, audio, D, world } = A.ctx;
      const c = v3(p.x, grid.sample(p.x, p.z), p.z);
      const sunDir = game && game.sunDir ? game.sunDir.clone() : v3(0.3, 0.8, 0.4).normalize();
      if (sunDir.y < 0.2) sunDir.y = 0.4;
      sunDir.normalize();
      const T = 14;
      const sun = new THREE.Group();
      sun.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), glowMat(0xfff4d0, 1)), new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 24), glowMat(0xffa040, 0.35)), new THREE.Mesh(new THREE.SphereGeometry(1.7, 48, 24), glowMat(0xff6020, 0.15)));
      scene.add(sun);
      if (game) game.ensureView(80000, 20000);
      audio.rumble(T); audio.hum(T);
      const list = D.buildings.filter(b => b.state === 'intact');
      A.addActive({
        t: 0, acc: 0,
        update(dt) {
          this.t += dt;
          const u = Math.min(1, this.t / T);
          const dist = 60000 * (1 - u * 0.75);
          const rad = 800 + 14000 * u ** 2 * Math.min(1, S.P / 60);
          sun.position.copy(c).addScaledVector(sunDir, dist); sun.scale.setScalar(rad);
          if (game) { game.setDoom(Math.min(1, u * (0.4 + S.P / 120)), 'fire'); }
          // 열기: 그을리고 불붙고, 위력이 높으면 녹아내림
          if ((this.acc += dt) > 0.2) {
            this.acc = 0;
            const heat = u * Math.min(1.5, 0.3 + S.P / 50);
            for (let i = 0; i < 6 * heat; i++) { const q = mapPoint(A); if (R() < 0.4) fx.column(q, 4 + R() * 8, 15); world.paintScorch(q.x, q.z, 40, 0.3); world.blastTrees(q.x, q.z, 40, 30); }
            if (heat > 0.6) for (let i = 0; i < 6; i++) { const b = list[Math.floor(R() * list.length)]; if (b && b.state === 'intact') { D._darken(b, 0.4); if (heat > 0.9) D.flatten(b, 0.6 + R() * 0.4, 0, 0, 4); } }
          }
          fx.flash = Math.max(fx.flash, 0.15 * u * u);
          if (u >= 1) {
            if (S.P >= 50 && game) game.playPlanet('fire');
            return false;
          }
          return true;
        },
        dispose() { dispose(scene, sun); },
      });
      const g = cineGame(A); if (!g) return;
      const back = c.clone().addScaledVector(v3(sunDir.x, 0, sunDir.z).normalize(), -500); back.y = c.y + 60;
      g.cine.play([
        watch(back, () => sun.position, { dur: T * 0.5, fov: 60, caption: '태양이 다가온다', smooth: 0.3 }),
        watch(() => back.clone().add(v3(0, 120, 0)), () => c.clone().lerp(sun.position, 0.02), { dur: T * 0.5, fov: 55, smooth: 0.3 }),
      ]);
    },
  },
};

export const NEW3_ENDINGS = {
  // 멈춘 시간에 금이 가고, 시간이 다시 흐르는 순간 세계가 한꺼번에 부서짐
  timestop: (A, c) => {
    const { D } = A.ctx; const dur = 6 + A.S.t * 3;
    A.addActive({
      real: 0,
      update(dt) {
        this.real += dt / Math.max(0.001, D.timeScale);
        if (this.real < dur + 0.3) return true;
        crustCollapse(A, c, { level: 1, cracks: 10 });
        wipeMap(A, c, 'void', { dur: 5 });
        worldEnd(A, c, 'void', { delay: 1, planetKind: 'shatter' });
        return false;
      },
    });
  },
  portal: (A, c) => { liftAll(A, c, 6); worldEnd(A, c, 'void', { delay: 2, planetKind: 'void' }); },
  shrink: (A, c) => { wipeMap(A, c, A.opts.enlarge ? 'nuke' : 'void', { dur: 8 }); worldEnd(A, c, 'void', { delay: 3, planetKind: A.opts.enlarge ? 'shatter' : 'void' }); },
  nano: (A, c) => { wipeMap(A, c, 'nuke', { dur: 16 }); worldEnd(A, c, 'ash', { delay: 5, planetKind: 'ash' }); },
  pendulum: (A, c) => { crustCollapse(A, c, { level: 0.8, cracks: 6 }); wipeMap(A, c, 'nuke', { dur: 9 }); worldEnd(A, c, 'impact', { delay: 3 }); },
  hammer: (A, c) => { crustCollapse(A, c, { level: 1, cracks: 12 }); wipeMap(A, c, 'nuke', { dur: 6 }); worldEnd(A, c, 'crack', { delay: 2, planetKind: 'shatter' }); },
  marbles: (A, c) => { wipeMap(A, c, 'nuke', { dur: 10 }); worldEnd(A, c, 'impact', { delay: 4 }); },
  hoover: (A, c) => { wipeMap(A, c, 'void', { dur: 6 }); worldEnd(A, c, 'void', { delay: 2 }); },
};
