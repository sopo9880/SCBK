// 추가 무기: 집속탄, 벙커버스터, 융단폭격, 레일건, 네이팜, 신의 지팡이, 싱크홀, 쓰나미, 반중력, 괴수 발
import * as THREE from 'three';
import { makeBomb, makeRod, makeBomber, makeFoot } from './models.js';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

function camForward(cam, tgt) { const f = v3().subVectors(tgt, cam.position); f.y = 0; return f.lengthSq() > 1e-6 ? f.normalize() : v3(0, 0, -1); }

export const EXTRA = {
  // ---- 집속탄: 공중에서 터져 자탄 살포 ----
  cluster: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, audio } = A.ctx;
      const burstY = p.y + 110 + 20 * S.r;
      A.addProjectile({
        mesh: A.spawn(makeBomb(), 1.6), pos: v3(p.x, p.y + 260, p.z), vel: v3(0, -60, 0), g: 30, align: 'down', trail: { size: 0.7 },
        onUpdate: (pr) => {
          if (pr.pos.y > burstY) return true;
          fx.explosion({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z }, 5, { smokeColumn: false });
          audio.boom(0.5, 400);
          const n = Math.round(Math.min(120, Math.max(14, 16 * S.n ** 0.75)));
          const spread = 26 * S.r;
          for (let i = 0; i < n; i++) {
            const a = R() * Math.PI * 2, s = Math.sqrt(R()) * spread;
            A.addProjectile({
              mesh: A.spawn(makeBomb(), 0.45), pos: pr.pos.clone(), vel: v3(Math.cos(a) * s, -20 - R() * 15, Math.sin(a) * s), g: 30, drag: 0.15, align: 'down',
              onHit: (q) => A.blast(q, 9 * S.r, 26 * S.v, { vap: 1.5 * S.r, crater: [3 * S.r, 1 * S.r], smokeColumn: false, silent: R() > 0.25 }),
            });
          }
          return false;
        },
        onHit: (q) => A.blast(q, 14 * S.r, 30 * S.v),
      });
      audio.whoosh(2);
    },
  },

  // ---- 벙커버스터: 지붕을 뚫고 들어가 1층에서 폭발 ----
  bunker: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, audio, grid } = A.ctx;
      const m = makeRod(); m.children[0].material = m.children[0].material.clone(); m.children[0].material.color.set(0x3b3f36); m.children[0].material.emissiveIntensity = 0;
      A.addProjectile({
        mesh: A.spawn(m, 1.4), pos: v3(p.x, p.y + 300, p.z), vel: v3(0, -190, 0), align: 'down', trail: { size: 0.8 },
        onHit: (q, info) => {
          const b = info && (info.b || (info.chunk && info.chunk.b));
          fx.dust(q, 6); audio.thud();
          if (b) {
            // 지붕 관통 → 잠시 뒤 1층에서 폭발
            const depth = { x: q.x, y: b.baseY + 3, z: q.z };
            const r = Math.max(16 * S.r, Math.sqrt(b.area) * 0.75);
            A.addActive({ t: 0, update(dt) {
              this.t += dt;
              if (this.t < 0.35) return true;
              A.ctx.D.explode({ x: depth.x, y: depth.y, z: depth.z, r, power: 30 * S.v, vaporize: 4 * S.r, lift: 0.05, scorch: 0.7, lod: 0 });
              fx.explosion(depth, r * 0.5, { smokeColumn: true });
              for (let i = 0; i < 16; i++) { const a = R() * 6.28; fx.dust({ x: b.cx + Math.cos(a) * Math.sqrt(b.area) * 0.6, y: b.baseY + 2, z: b.cz + Math.sin(a) * Math.sqrt(b.area) * 0.6 }, 6); }
              audio.boom(1.6, A.ctx.camera.position.distanceTo(v3(depth.x, depth.y, depth.z)));
              fx.addShake(1.2);
              return false;
            } });
          } else {
            // 땅에 박힘 → 지하 폭발로 큰 구덩이
            const gq = { x: q.x, y: grid.sample(q.x, q.z) - 4, z: q.z };
            A.blast(gq, 22 * S.r, 40 * S.v, { vap: 4 * S.r, crater: [13 * S.r, 7 * S.r], lift: 0.9 });
          }
        },
      });
      audio.whoosh(1.2);
    },
  },

  // ---- 융단폭격: 드래그한 선을 따라 폭격기 편대 ----
  carpet: {
    holdStart(A, hit) {
      const st = { a: null, b: null, line: null };
      return st;
    },
    holdUpdate(A, st, dt, aim) {
      if (!aim) return;
      if (!st.a) st.a = v3(aim.x, aim.y, aim.z);
      st.b = v3(aim.x, aim.y, aim.z);
      if (!st.line) {
        st.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([st.a, st.b]), new THREE.LineDashedMaterial({ color: 0xffc233, dashSize: 8, gapSize: 6, depthTest: false }));
        st.line.renderOrder = 30; A.ctx.scene.add(st.line);
      }
      st.line.geometry.setFromPoints([st.a.clone().add(v3(0, 2, 0)), st.b.clone().add(v3(0, 2, 0))]);
      st.line.computeLineDistances();
    },
    holdEnd(A, st) {
      if (st.line) { A.ctx.scene.remove(st.line); st.line.geometry.dispose(); st.line.material.dispose(); }
      if (!st.a) return;
      const { camera, grid, fx, audio } = A.ctx;
      const S = A.S;
      let a = st.a, b = st.b || st.a;
      if (a.distanceTo(b) < 40) {
        const f = camForward(camera, a), side = v3(-f.z, 0, f.x);
        a = st.a.clone().addScaledVector(side, -220); b = st.a.clone().addScaledVector(side, 220);
      }
      const dir = v3().subVectors(b, a); dir.y = 0; const len = dir.length(); dir.normalize();
      const side = v3(-dir.z, 0, dir.x);
      const V = 120, alt = Math.max(a.y, b.y) + 300, lead = 180;
      const spacing = Math.max(12, 26 / S.n ** 0.3);
      const planes = [-28, 0, 28].map((off, i) => {
        const m = A.spawn(makeBomber(), 0.75);
        const start = a.clone().addScaledVector(dir, -(lead + 380 + i * 30)).addScaledVector(side, off); start.y = alt + i * 6;
        m.position.copy(start); m.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
        return { m, start, off, nextDrop: 0, done: false };
      });
      audio.drone && audio.drone(14);
      A.addActive({
        t: 0,
        update(dt) {
          this.t += dt;
          let alive = false;
          for (let pi = 0; pi < planes.length; pi++) {
            const pl = planes[pi];
            const along = this.t * V - (lead + 380 + pi * 30);
            pl.m.position.copy(pl.start).addScaledVector(dir, this.t * V);
            const s = along + lead; // 이 폭탄이 떨어질 지점의 선상 위치
            if (s >= pl.nextDrop && pl.nextDrop <= len) {
              pl.nextDrop += spacing;
              const pos = pl.m.position.clone().add(v3(0, -3, 0));
              A.addProjectile({
                mesh: A.spawn(makeBomb(), 0.7), pos, vel: dir.clone().multiplyScalar(V).add(v3(0, -5, 0)), g: 30, drag: 0.55, align: 'down',
                onHit: (q) => A.blast(q, 15 * S.r, 30 * S.v, { vap: 2 * S.r, crater: [4 * S.r, 1.5 * S.r], smokeColumn: R() < 0.3, silent: R() > 0.4 }),
              });
            }
            if (along < len + 500) alive = true;
            // 비행운
            if (R() < 0.6) { const w = pl.m.position; fx.smoke.emit(w.x, w.y, w.z, 0, 0, 0, 5, 1.2, 5, [0.95, 0.96, 0.98, 0.45], [0.9, 0.92, 0.95, 0], 0.05, 0, 0.05); }
          }
          return alive;
        },
        dispose() { for (const pl of planes) A.remove(pl.m); },
      });
    },
  },

  // ---- 레일건: 카메라 방향으로 일직선 관통 ----
  railgun: {
    fire(A, hit, cam) {
      const S = A.S, { D, fx, audio, grid, scene, world } = A.ctx;
      const from = cam.clone().add(v3(0, -3, 0));
      const dir = v3(hit.point.x, hit.point.y, hit.point.z).sub(from).normalize();
      // 지형에 닿을 때까지 (최대 3km)
      let end = from.clone(), dist = 0;
      const step = 6;
      for (; dist < 3000; dist += step) {
        end.copy(from).addScaledVector(dir, dist);
        if (end.y < grid.sample(end.x, end.z)) break;
      }
      const r = 6 * S.r;
      D.lineBlast(from, end, r, 70 * S.v);
      // 빔 연출
      const vFrom = from.clone().addScaledVector(dir, 30); // 빔 그래픽은 카메라 앞 30m부터
      const len = vFrom.distanceTo(end);
      const mid = vFrom.clone().add(end).multiplyScalar(0.5);
      const g = new THREE.Group();
      const mk = (rad, col, op) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); return m; };
      const core = mk(0.35 * S.r, new THREE.Color(2.2, 2.6, 3.2), 1), glow = mk(1.4 * S.r, new THREE.Color(0.15, 0.4, 0.9), 0.45);
      g.add(core, glow); g.position.copy(mid); g.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
      scene.add(g);
      for (let d = 30; d < len; d += 45) {
        const pp = from.clone().addScaledVector(dir, d);
        if (R() < 0.5) fx.smoke.emit(pp.x, pp.y, pp.z, (R() - 0.5) * 6, 2, (R() - 0.5) * 6, 2 + R() * 2, 2, 12, [0.8, 0.85, 0.95, 0.5], [0.7, 0.72, 0.75, 0], 0.6, 0.5, 0.05);
      }
      fx.explosion(end, 12 * S.r, { smokeColumn: true });
      A.crater(end.x, end.z, 8 * S.r, 4 * S.r);
      world.paintScorch(end.x, end.z, 10 * S.r, 0.8);
      fx.light(end.x, end.y + 10, end.z, 6e4, 300, 0.4, 0x9fc8ff);
      fx.addShake(1.4);
      audio.crack ? audio.crack() : audio.boom(1.2, 100);
      A.addActive({ t: 0, update(dt) { this.t += dt; const k = Math.max(0, 1 - this.t / 0.7); core.material.opacity = k; glow.material.opacity = 0.45 * k; g.scale.set(1 + this.t * 3, 1, 1 + this.t * 3); return this.t < 0.7; },
        dispose() { scene.remove(g); core.geometry.dispose(); glow.geometry.dispose(); core.material.dispose(); glow.material.dispose(); } });
    },
  },

  // ---- 네이팜: 불바다 ----
  napalm: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, world, audio, grid } = A.ctx;
      A.addProjectile({
        mesh: A.spawn(makeBomb(), 1.2), pos: v3(p.x - 30, p.y + 200, p.z - 10), vel: v3(20, -55, 6), g: 30, align: 'down', trail: { size: 0.6 },
        onHit: (q) => {
          const r = 55 * S.r, dur = 16 * S.t;
          audio.boom(1.2, A.ctx.camera.position.distanceTo(v3(q.x, q.y, q.z)));
          // 처음: 불길이 확 번짐
          for (let i = 0; i < 160 * A.ctx.quality.fxScale; i++) {
            const a = R() * 6.28, sp = r * (0.6 + R() * 0.9);
            fx.fire.emit(q.x, q.y + 2, q.z, Math.cos(a) * sp, 3 + R() * 8, Math.sin(a) * sp, 1.1 + R() * 0.9, 10, 26, [0.9, 0.38, 0.08, 0.5], [0.6, 0.1, 0.02, 0], 2.2, 3);
          }
          fx.light(q.x, q.y + 10, q.z, 8e4, r * 6, 1.2, 0xff7a20);
          A.addActive({
            t: 0, acc: 0,
            update(dt) {
              this.t += dt;
              const k = Math.min(1, this.t / 0.8) * Math.min(1, (dur - this.t) / 3);
              D.burn(q.x, q.z, r, dt * k);
              world.blastTrees(q.x, q.z, r, 0);
              if (this.t < 1.5) world.paintScorch(q.x, q.z, r * Math.min(1, this.t), 0.15);
              this.acc += dt;
              const rate = 110 * A.ctx.quality.fxScale * k;
              while (rate > 0 && this.acc > 1 / rate) {
                this.acc -= 1 / rate;
                const a = R() * 6.28, d = Math.sqrt(R()) * r, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d, y = grid.sample(x, z);
                fx.fire.emit(x, y + 1 + R() * 3, z, (R() - 0.5) * 2, 5 + R() * 7, (R() - 0.5) * 2, 0.9 + R() * 1.0, 7 + R() * 5, 14 + R() * 8, [0.95, 0.4, 0.08, 0.45], [0.5, 0.07, 0.02, 0], 1.4, 5);
                if (R() < 0.25) fx.smoke.emit(x, y + 6, z, 0, 6 + R() * 6, 0, 8 + R() * 6, 6, 30, [0.08, 0.07, 0.06, 0.7], [0.25, 0.24, 0.23, 0], 0.3, 1.5, 0.1);
              }
              if (R() < dt * 2 * k) fx.light(q.x + (R() - 0.5) * r, q.y + 8, q.z + (R() - 0.5) * r, 2e4, r * 3, 0.5, 0xff7020);
              return this.t < dur;
            },
          });
        },
      });
      audio.whoosh(2);
    },
  },

  // ---- 신의 지팡이: 궤도 텅스텐 막대 ----
  rod: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { fx, audio, D } = A.ctx;
      A.addProjectile({
        mesh: A.spawn(makeRod(), 1.6 * Math.sqrt(S.r)), pos: v3(p.x + 40, p.y + 3200, p.z + 20), vel: v3(-40 / 1.3, -3200 / 1.3, -20 / 1.3), align: 'down', trail: { size: 2.2, fire: true, every: 0.006 },
        onHit: (q) => {
          const r = 44 * S.r;
          D.explode({ x: q.x, y: q.y, z: q.z, r, power: 62 * S.v, vaporize: 8 * S.r, lift: 1.3, scorch: 0.4, lod: 0 });
          A.crater(q.x, q.z, 24 * S.r, 15 * S.r);
          A.ctx.world.paintScorch(q.x, q.z, r * 0.8, 0.9);
          A.ctx.world.blastTrees(q.x, q.z, r * 1.4, r * 0.6);
          // 운동 에너지 충돌: 불덩이 대신 하늘로 치솟는 흙기둥
          for (let i = 0; i < 220 * A.ctx.quality.fxScale; i++) {
            const a = R() * 6.28, s = R() * 14 * S.r, up = 40 + R() * 140 * Math.sqrt(S.r);
            const c = 0.42 + R() * 0.1;
            fx.smoke.emit(q.x + Math.cos(a) * s, q.y + 2, q.z + Math.sin(a) * s, Math.cos(a) * 12, up, Math.sin(a) * 12, 6 + R() * 6, 8 * Math.sqrt(S.r), 30 * Math.sqrt(S.r), [c, c * 0.9, c * 0.78, 0.85], [0.5, 0.47, 0.43, 0], 0.9, -8, 0.04);
          }
          fx.ring(q, r * 2.6, 0.8, 0xffffff, 0.7);
          fx.flash = Math.max(fx.flash, 0.35);
          fx.light(q.x, q.y + 20, q.z, 2e5, r * 10, 0.5, 0xffe6c0);
          fx.addShake(3);
          audio.boom(3, A.ctx.camera.position.distanceTo(v3(q.x, q.y, q.z)));
        },
      });
      audio.whoosh(1.4);
    },
  },

  // ---- 싱크홀 ----
  sinkhole: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid } = A.ctx;
      const r = 36 * S.r, depth = 32 * S.r, dur = 6;
      audio.rumble(dur + 1);
      A.addActive({
        t: 0, acc: 0, dug: 0,
        update(dt) {
          this.t += dt;
          const k = ease.inOut(Math.min(1, this.t / dur));
          const want = depth * k;
          this.acc += dt;
          if (this.acc > 0.25 && want - this.dug > 0.5) {
            this.acc = 0;
            A.crater(p.x, p.z, r, want - this.dug);
            this.dug = want;
            D.scheduleTerrainRebuild();
          }
          D.sink(p.x, p.z, r * 1.15, dt, 10 + 20 * k);
          fx.addShake(dt * 2.2);
          if (R() < dt * 30) { const a = R() * 6.28, d = r * (0.8 + R() * 0.4); fx.dust({ x: p.x + Math.cos(a) * d, y: grid.sample(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d), z: p.z + Math.sin(a) * d }, 6); }
          return this.t < dur + 1;
        },
      });
    },
  },

  // ---- 쓰나미 ----
  tsunami: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, scene, camera, world } = A.ctx;
      const dir = camForward(camera, p).negate();        // 카메라 쪽으로 밀려옴
      const side = v3(-dir.z, 0, dir.x);
      const halfW = Math.min(grid.span * 0.5, 700 * Math.sqrt(S.r));
      const H = 62 * S.r, speed = 48;
      const startS = -Math.min(grid.span * 0.4, 480);       // 조준점 기준 출발 거리
      const endS = Math.min(grid.span * 0.45, 900);
      const origin = v3(p.x, 0, p.z);
      // 파도 단면: 뒤 경사 → 마루 → 말려 내려오는 앞면
      const prof = [[-90, 0], [-55, 0.25], [-25, 0.62], [-8, 0.92], [0, 1.0], [7, 0.95], [11, 0.78], [10, 0.55], [6, 0.32], [3, 0.08], [1, 0]];
      const nx = 64, geo = new THREE.BufferGeometry();
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nx; i++) for (let j = 0; j < prof.length; j++) {
        pos.push((i / nx - 0.5) * 2, prof[j][1], prof[j][0]); uv.push(i / nx, j / (prof.length - 1));
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < prof.length - 1; j++) {
        const a = i * prof.length + j, b = a + prof.length;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uH: { value: H }, uW: { value: halfW } },
        vertexShader: `uniform float uTime, uH, uW; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vY;
          void main(){ vUv = uv; vec3 p = position;
            float wob = sin(p.x * 9.0 + uTime * 1.3) * 0.06 + sin(p.x * 23.0 - uTime * 2.1) * 0.03;
            p.y = p.y * uH * (1.0 + wob); p.x *= uW; p.z *= uH / 22.0;
            vY = position.y;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vY;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main(){
            float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
            vec3 deep = vec3(0.01, 0.07, 0.09), shallow = vec3(0.05, 0.26, 0.28);
            vec3 c = mix(deep, shallow, vY) + fres * vec3(0.35, 0.45, 0.5);
            float foam = smoothstep(0.55, 0.95, vUv.y) * (0.5 + 0.5 * n(vec2(vUv.x * 160.0, vUv.y * 10.0 - uTime * 3.0)));
            foam += smoothstep(0.85, 1.0, vUv.y) * 0.6 + smoothstep(0.08, 0.0, vY) * 0.5 * n(vec2(vUv.x * 300.0, uTime * 2.0));
            c = mix(c, vec3(0.92, 0.95, 0.96), clamp(foam, 0.0, 1.0));
            gl_FragColor = vec4(c, 0.93);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true, side: THREE.DoubleSide, depthWrite: true,
      });
      const wave = new THREE.Mesh(geo, mat); wave.frustumCulled = false; wave.renderOrder = 5;
      scene.add(wave);
      audio.wind(14); audio.rumble(12);
      const st = { s: startS, prev: startS, t: 0, acc: 0 };
      A.addActive({
        update(dt) {
          st.t += dt;
          st.s += speed * dt;
          const front = origin.clone().addScaledVector(dir, st.s);
          const gy = grid.sample(front.x, front.z);
          const k = Math.min(1, (st.s - startS) / 120) * Math.min(1, (endS - st.s) / 150);
          wave.position.set(front.x, gy - 2, front.z);
          wave.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
          wave.scale.set(1, Math.max(0.02, k), 1);
          mat.uniforms.uTime.value = st.t;
          // 물리: 앞면 띠에 닿은 건물/파편을 밀어냄
          D.sweep({ ox: origin.x, oz: origin.z, dx: dir.x, dz: dir.z, prev: st.prev - 20, front: st.s + 8, halfW, waterY: gy + H * k, power: 26 * S.v * k }, dt);
          world.blastTrees(front.x, front.z, 30, 30);
          st.prev = st.s;
          // 물보라
          st.acc += dt;
          const rate = 120 * A.ctx.quality.fxScale * k;
          while (rate > 0 && st.acc > 1 / rate) {
            st.acc -= 1 / rate;
            const l = (R() * 2 - 1) * halfW;
            const pp = front.clone().addScaledVector(side, l);
            const y = grid.sample(pp.x, pp.z);
            if (R() < 0.5) fx.smoke.emit(pp.x + dir.x * 6, y + H * k * (0.85 + R() * 0.2), pp.z + dir.z * 6, dir.x * 14, 6 + R() * 8, dir.z * 14, 2 + R() * 2, 6, 22, [0.9, 0.93, 0.95, 0.7], [0.85, 0.88, 0.9, 0], 0.8, -4, 0.05);
            else fx.smoke.emit(pp.x + dir.x * 3, y + 1, pp.z + dir.z * 3, dir.x * 20, 3, dir.z * 20, 1.5 + R(), 5, 16, [0.85, 0.9, 0.92, 0.6], [0.8, 0.85, 0.88, 0], 1.2, -2, 0.05);
          }
          // 젖은 땅 (어둡게)
          if (R() < dt * 8) { const l = (R() * 2 - 1) * halfW; const pp = front.clone().addScaledVector(side, l).addScaledVector(dir, -30); world.paintScorch(pp.x, pp.z, 60, 0.12); }
          fx.addShake(dt * 0.6 * k);
          return st.s < endS;
        },
        dispose() { scene.remove(wave); geo.dispose(); mat.dispose(); },
      });
    },
  },

  // ---- 괴수 발 ----
  stomp: {
    fire(A, hit) {
      const S = A.S, p = hit.point, { D, fx, audio, grid, camera, scene } = A.ctx;
      const dir = camForward(camera, p);
      const foot = A.spawn(makeFoot(), 0.9 * S.r);
      foot.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
      const steps = 4, gap = 55 * S.r, up = 130 * S.r;
      const pts = [];
      for (let i = 0; i < steps; i++) { const q = v3(p.x, 0, p.z).addScaledVector(dir, i * gap).addScaledVector(v3(-dir.z, 0, dir.x), (i % 2 ? 1 : -1) * 14 * S.r); q.y = grid.sample(q.x, q.z); pts.push(q); }
      const T_DOWN = 0.55, T_REST = 0.35, T_UP = 0.8;
      const per = T_DOWN + T_REST + T_UP;
      foot.position.copy(pts[0]).add(v3(0, up, 0));
      A.addActive({
        t: 0, hitStep: -1,
        update(dt) {
          this.t += dt;
          const i = Math.floor(this.t / per), u = this.t - i * per;
          if (i >= steps) return false;
          const q = pts[i], prev = pts[Math.max(0, i - 1)];
          if (u < T_DOWN) {
            const k = ease.in(u / T_DOWN);
            const from = i === 0 ? q : prev;
            foot.position.copy(from).lerp(q, Math.min(1, u / (T_DOWN * 0.5))); foot.position.y = q.y + up * (1 - k);
          } else {
            if (this.hitStep !== i) {
              this.hitStep = i;
              const r = 26 * S.r;
              D.explode({ x: q.x, y: q.y + 6, z: q.z, r, power: 30 * S.v, lift: -0.7, scorch: 0.2, lod: 0 });
              A.crater(q.x, q.z, 14 * S.r, 2.2 * S.r);
              A.ctx.world.blastTrees(q.x, q.z, r, r * 0.6);
              for (let k2 = 0; k2 < 40 * A.ctx.quality.fxScale; k2++) { const a = R() * 6.28; fx.dust({ x: q.x + Math.cos(a) * r * 0.8, y: q.y + 1, z: q.z + Math.sin(a) * r * 0.8 }, 6 * Math.sqrt(S.r)); }
              fx.ring(q, r * 3.5, 0.9, 0xc9a27a, 0.45);
              fx.addShake(2.4);
              audio.thud(); audio.boom(1.4, camera.position.distanceTo(q));
            }
            if (u > T_DOWN + T_REST) { const k = ease.inOut((u - T_DOWN - T_REST) / T_UP); foot.position.y = q.y + up * k; }
          }
          return true;
        },
        dispose() { A.remove(foot); },
      });
    },
  },
};
