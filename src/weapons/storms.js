// 자연재해형: EF5 토네이도, 블랙홀(완전 흡수 옵션)
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

function funnelMat(color = [0.3, 0.28, 0.26], alpha = 0.8, speed = 2.4) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSpeed: { value: speed }, uAlpha: { value: alpha }, uFade: { value: 1 }, uCol: { value: new THREE.Color(...color) } },
    vertexShader: `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec3 p = position;
        float w = sin(uv.y * 9.0 + uTime * 1.7) * 0.06 + sin(uv.y * 23.0 - uTime * 2.3) * 0.025;
        p.xz *= 1.0 + w;
        vec4 mv = modelViewMatrix * vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uSpeed, uAlpha, uFade; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 q = vec2(vUv.x * 8.0 + uTime * uSpeed + vUv.y * 4.0, vUv.y * 7.0 - uTime * 1.1);
        float s = n(q * vec2(2.0, 1.0)) * 0.55 + n(q * vec2(6.0, 3.0)) * 0.3 + n(q * vec2(14.0, 7.0)) * 0.15;
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = smoothstep(0.25, 0.75, s) * (0.45 + rim * 0.8) * uAlpha * uFade;
        a *= smoothstep(0.0, 0.05, vUv.y);
        vec3 c = uCol * (0.65 + 0.7 * s);
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

function boltMesh(from, to) {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = from.clone().lerp(to, t);
    if (i > 0 && i < n) { p.x += (R() - 0.5) * 40 * (1 - t * 0.5); p.z += (R() - 0.5) * 40 * (1 - t * 0.5); p.y += (R() - 0.5) * 10; }
    pts.push(p);
  }
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 10), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 64, 1.1, 5, false), mat));
  // 가지
  for (let b = 0; b < 3; b++) {
    const s = 2 + Math.floor(R() * (n - 6));
    const bp = [pts[s].clone()];
    let c = pts[s].clone();
    for (let k = 0; k < 5; k++) { c = c.clone().add(v3((R() - 0.5) * 50, -18 - R() * 15, (R() - 0.5) * 50)); bp.push(c); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 24, 0.5, 4, false), mat));
  }
  return g;
}

class Rain {
  constructor(scene) {
    const N = 4000;
    this.pos = new Float32Array(N * 6);
    this.N = N;
    for (let i = 0; i < N; i++) this._seed(i, true);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    scene.add(this.mesh); this.scene = scene; this.geo = g;
  }
  _seed(i, any) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 260;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = any ? (R() - 0.3) * 260 : 180 + R() * 60;
    const p = this.pos; p.set([x, y, z, x - 1.2, y + 7, z - 0.6], i * 6);
  }
  update(dt, cam, k) {
    this.mat.opacity = 0.55 * k;
    this.mesh.visible = k > 0.02;
    if (!this.mesh.visible) return;
    this.mesh.position.set(cam.position.x, cam.position.y, cam.position.z);
    const p = this.pos;
    for (let i = 0; i < this.N; i++) {
      const o = i * 6;
      p[o + 1] -= 70 * dt; p[o + 4] -= 70 * dt; p[o] += 10 * dt; p[o + 3] += 10 * dt;
      if (p[o + 1] < -120) this._seed(i, false);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

export const STORMS = {
  tornado: {
    fire(A, hit) {
      const { scene, D, fx, world, grid, audio, game, camera } = A.ctx;
      const S = A.S, p = hit.point;
      const r = 70 * S.r;                 // 영향 반경
      const core = r * 0.36;              // 깔때기 지면 반경
      const dur = 22 * S.t;
      const cloudY = grid.sample(p.x, p.z) + 360 + 60 * S.r;
      const g = new THREE.Group(); scene.add(g);
      // 슈퍼셀 먹구름 (원판 + 아래로 처진 벽구름)
      const cloud = new THREE.Mesh(new THREE.CylinderGeometry(1100, 1300, 140, 64, 6, true), funnelMat([0.16, 0.17, 0.19], 0.95, 0.3));
      const cloudBase = new THREE.Mesh(new THREE.CircleGeometry(1250, 64), funnelMat([0.13, 0.14, 0.16], 0.97, 0.25));
      cloudBase.rotation.x = Math.PI / 2;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r * 3.2, r * 1.2, 120, 48, 6, true), funnelMat([0.2, 0.2, 0.22], 0.9, 0.9));
      // 깔때기 3겹
      const funnels = [
        new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, core * 0.55, 1, 56, 40, true), funnelMat([0.33, 0.3, 0.28], 0.92, 2.8)),
        new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, core * 0.4, 1, 48, 36, true), funnelMat([0.4, 0.37, 0.34], 0.7, -2.0)),
        new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, core * 0.9, 1, 48, 30, true), funnelMat([0.36, 0.32, 0.28], 0.45, 1.6)),
      ];
      // 보조 소용돌이 (다중 와류)
      const subs = [0, 1, 2].map(() => new THREE.Mesh(new THREE.CylinderGeometry(9, 3, 1, 16, 10, true), funnelMat([0.38, 0.34, 0.3], 0.8, 4)));
      for (const m of [cloud, cloudBase, wall, ...funnels, ...subs]) { m.renderOrder = 11; m.frustumCulled = false; g.add(m); }
      const rain = new Rain(scene);
      const mats = [cloud, cloudBase, wall, ...funnels, ...subs].map(m => m.material);
      const bolts = [];
      audio.wind(dur); audio.rumble && audio.rumble(dur * 0.8);
      const st = { x: p.x, z: p.z, y: p.y, t: 0, vx: 0, vz: 0, acc: 0, boltT: 1.2, cx: p.x, cz: p.z };
      A.addActive({
        update(dt, aim) {
          st.t += dt;
          const t = st.t;
          const k = Math.min(1, t / 3) * Math.min(1, (dur - t) / 3); // 생성~소멸
          const kSky = Math.min(1, t / 2.5) * Math.min(1, (dur + 2 - t) / 3);
          if (game) game.storm = Math.max(0, kSky);
          // 이동: 커서 쪽으로 + 배회
          if (aim) {
            const dx = aim.x - st.x, dz = aim.z - st.z, d = Math.hypot(dx, dz);
            const sp = 20;
            st.vx += ((d > 3 ? dx / d * sp : 0) - st.vx) * dt * 0.7;
            st.vz += ((d > 3 ? dz / d * sp : 0) - st.vz) * dt * 0.7;
          }
          st.x += (st.vx + Math.sin(t * 0.6) * 5) * dt; st.z += (st.vz + Math.cos(t * 0.8) * 5) * dt;
          st.y = grid.sample(st.x, st.z);
          st.cx += (st.x - st.cx) * dt * 0.2; st.cz += (st.z - st.cz) * dt * 0.2;
          const H = cloudY - st.y;
          // 메시 배치
          cloud.position.set(st.cx, cloudY + 70, st.cz); cloud.rotation.y += dt * 0.05;
          cloudBase.position.set(st.cx, cloudY, st.cz);
          wall.position.set(st.x, cloudY - 55, st.z); wall.rotation.y += dt * 0.3;
          funnels.forEach((f, i) => {
            const lean = Math.sin(t * 0.4 + i) * 0.06;
            f.scale.set(Math.max(0.01, k), H, Math.max(0.01, k));
            f.position.set(st.x + Math.sin(t * 0.5) * 8, st.y + H / 2, st.z + Math.cos(t * 0.45) * 8);
            f.rotation.set(lean + st.vz * 0.004, 0, -lean - st.vx * 0.004);
          });
          subs.forEach((s, i) => {
            const a = t * 2.2 + i * 2.094, rr = core * 0.55;
            s.scale.set(k, 130 + 40 * Math.sin(t * 1.3 + i), k);
            s.position.set(st.x + Math.cos(a) * rr, st.y + s.scale.y / 2, st.z + Math.sin(a) * rr);
          });
          for (const m of mats) { m.uniforms.uTime.value = t; }
          for (const f of [...funnels, ...subs, wall]) f.material.uniforms.uFade.value = k;
          cloud.material.uniforms.uFade.value = cloudBase.material.uniforms.uFade.value = kSky;
          rain.update(dt, camera, kSky);
          // 물리: 강한 회오리
          D.field({ x: st.x, y: st.y, z: st.z, r: r * (0.5 + 0.5 * k), mode: 'vortex', grab: core * 1.1 * k, strength: 62 * S.v * k, height: Math.min(H * 0.55, 260) }, dt);
          world.blastTrees(st.x, st.z, core * 1.4 * k, core * 1.1 * k);
          world.paintScorch(st.x, st.z, core * 0.8, 0.04);
          // 잔해 구름 (바닥)
          st.acc += dt;
          const rate = 170 * A.ctx.quality.fxScale * k;
          while (rate > 0 && st.acc > 1 / rate) {
            st.acc -= 1 / rate;
            const a = R() * 6.28, rr = core * (0.4 + R() * 1.3);
            const tx = -Math.sin(a), tz = Math.cos(a);
            const hgt = R() ** 2 * 140;
            const c = 0.32 + R() * 0.12;
            fx.smoke.emit(st.x + Math.cos(a) * rr, st.y + hgt, st.z + Math.sin(a) * rr, tx * 45 + st.vx - Math.cos(a) * 8, 10 + R() * 14, tz * 45 + st.vz - Math.sin(a) * 8,
              1.6 + R() * 1.6, 6 + hgt * 0.05, 18 + hgt * 0.15, [c * 1.05, c * 0.95, c * 0.82, 0.7], [0.38, 0.35, 0.32, 0], 0.5, 3, 0.08);
          }
          if (R() < dt * 10 * k) fx.dust({ x: st.x + (R() - 0.5) * core * 2, y: st.y, z: st.z + (R() - 0.5) * core * 2 }, 7);
          fx.addShake(dt * 0.35 * k);
          // 번개
          st.boltT -= dt;
          if (st.boltT <= 0 && kSky > 0.4) {
            st.boltT = 0.6 + R() * 2.2;
            const a = R() * 6.28, d = 60 + R() * 500;
            const bx = st.cx + Math.cos(a) * d, bz = st.cz + Math.sin(a) * d;
            const to = v3(bx + (R() - 0.5) * 60, grid.sample(bx, bz), bz + (R() - 0.5) * 60);
            const mesh = boltMesh(v3(bx, cloudY, bz), to);
            scene.add(mesh);
            bolts.push({ mesh, t: 0 });
            fx.light(to.x, to.y + 150, to.z, 2.5e5, 1500, 0.35, 0xbfd4ff);
            fx.flash = Math.max(fx.flash, 0.12);
            const dist = camera.position.distanceTo(to);
            const delay = Math.min(4, dist / 343);
            A.addActive({ t: 0, update(dt2) { this.t += dt2; if (this.t >= delay) { audio.thunder ? audio.thunder() : audio.boom(1.2, dist); return false; } return true; } });
            if (R() < 0.35) A.blast(to, 8, 18, { silent: true, noFx: false, scorch: 0.6 });
          }
          for (let i = bolts.length - 1; i >= 0; i--) {
            const b = bolts[i]; b.t += dt;
            b.mesh.visible = b.t < 0.08 || (b.t > 0.14 && b.t < 0.24);
            if (b.t > 0.3) { scene.remove(b.mesh); b.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); bolts.splice(i, 1); }
          }
          return t < dur + 2;
        },
        dispose() {
          if (game) game.storm = 0;
          scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          for (const b of bolts) scene.remove(b.mesh);
          rain.dispose();
        },
      });
    },
  },

  blackhole: {
    fire(A, hit) {
      const { scene, D, fx, world, grid, audio } = A.ctx;
      const S = A.S, p = hit.point;
      const absorb = A.opts.absorb;
      const y = absorb ? p.y + 26 + 6 * S.r : p.y + 38 + 10 * S.r;
      const dur = (absorb ? 16 : 11) * S.t;
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      const disk = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.45, 16, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.5), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      disk.rotation.x = Math.PI / 2 - 0.35;
      const disk2 = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.25, 12, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.7, 2.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      disk2.rotation.x = Math.PI / 2 - 0.3;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 20), new THREE.MeshBasicMaterial({ color: 0x6a3cff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
      g.add(core, disk, disk2, halo); g.position.set(p.x, y, p.z); g.scale.setScalar(0.01);
      scene.add(g);
      const st = { t: 0, eaten: 0, acc: 0, core: 7 * Math.sqrt(S.r), grow: 1, craterT: 0 };
      const Rr = (absorb ? 260 : 190) * S.r, grab0 = (absorb ? 110 : 70) * S.r;
      audio.hum(dur);
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          const grow = Math.min(1, t / 1.5), shrink = t > dur - 0.8 ? Math.max(0, (dur - t) / 0.8) : 1;
          // 흡수 모드: 삼킬수록 커짐
          if (absorb) st.grow = Math.min(3.2, 1 + st.eaten * 0.0035);
          const c = st.core * st.grow;
          g.scale.setScalar(Math.max(0.01, c * grow * shrink));
          disk.rotation.z += dt * 3; disk2.rotation.z -= dt * 1.7;
          const eaten = D.field({ x: p.x, y, z: p.z, r: Rr * grow, mode: 'gravity', core: c * (absorb ? 1.9 : 1.3), grab: grab0 * grow * (absorb ? st.grow * 0.7 + 0.3 : 1), strength: absorb ? 85 : 55, consume: absorb }, dt);
          st.eaten += eaten;
          world.blastTrees(p.x, p.z, grab0 * 0.6 * grow, grab0 * 0.5 * grow);
          // 흡수 모드: 땅까지 빨려 올라감
          if (absorb) {
            st.craterT += dt;
            if (st.craterT > 0.5) { st.craterT = 0; A.crater(p.x, p.z, c * 2.2, 0.8 * st.grow); }
            if (R() < dt * 25) { const a = R() * 6.28, d = R() * grab0; fx.dust({ x: p.x + Math.cos(a) * d, y: grid.sample(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d), z: p.z + Math.sin(a) * d }, 4); }
          }
          // 강착 원반 파티클
          st.acc += dt;
          const rate = (absorb ? 160 : 90) * A.ctx.quality.fxScale;
          while (st.acc > 1 / rate) {
            st.acc -= 1 / rate;
            const u = R() * 6.28, rr = c * (3 + R() * 5);
            const px = p.x + Math.cos(u) * rr, pz = p.z + Math.sin(u) * rr, py = y + (R() - 0.5) * c;
            const tx = -Math.sin(u), tz = Math.cos(u);
            fx.fire.emit(px, py, pz, (tx * 1.2 - Math.cos(u) * 0.8) * rr * 1.4, -(py - y) * 1.5, (tz * 1.2 - Math.sin(u) * 0.8) * rr * 1.4, 0.6, c * 0.5, 0.1,
              [0.6, 0.35, 1, 0.9], [1, 0.5, 0.15, 0], 0, 0);
          }
          fx.addShake(dt * (absorb ? 0.7 : 0.4));
          if (t >= dur) {
            if (absorb) {
              // 붕괴: 섬광과 함께 소멸 (아무것도 내뱉지 않음)
              fx.flash = Math.max(fx.flash, 0.5);
              fx.ring({ x: p.x, y, z: p.z }, c * 30, 0.9, 0xd0b0ff, 0.9, true);
              audio.boom(1.5, 300);
            } else {
              fx.explosion({ x: p.x, y, z: p.z }, 30, { smokeColumn: false });
              fx.ring({ x: p.x, y, z: p.z }, Rr * 0.8, 1.2, 0xb08cff, 0.7, true);
              D.explode({ x: p.x, y, z: p.z, r: Rr * 0.7, power: 26 * S.v, lift: 0.1 });
              audio.boom(2, 200);
            }
            if (A.ctx.hud) A.ctx.hud.toast(`블랙홀이 조각 ${st.eaten.toLocaleString()}개를 삼켰습니다`, 'info');
            return false;
          }
          return true;
        },
        dispose() { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); },
      });
    },
  },
};
