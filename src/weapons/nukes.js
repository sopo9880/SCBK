// 핵무기 3종 + 핵폭발 연출 (아케이드 / 실감)
import * as THREE from 'three';
import { makeNukeBomb, makeBomber, makeICBM, makeSilo, makeWarhead } from './models.js';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------- 부피 구름 셰이더 (화구·버섯구름·응결운·먼지벽 공용) ----------
const NOISE3 = /* glsl */`
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }`;

function cloudMat({ hot = [1, 0.6, 0.2], smoke = [0.35, 0.32, 0.3], disp = 0.25, scale = 2.2, swirl = 0.35 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uDisp: { value: disp }, uScale: { value: scale }, uSwirl: { value: swirl },
      uHot: { value: new THREE.Color(...hot) }, uSmoke: { value: new THREE.Color(...smoke) },
      uHeat: { value: 0 }, uAlpha: { value: 1 }, uUnder: { value: 0 }, uStretch: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: `${NOISE3}
      uniform float uTime, uDisp, uScale, uSwirl; uniform vec3 uStretch;
      varying vec3 vN; varying vec3 vV; varying float vNz; varying float vUp;
      void main(){
        vec3 p = position;
        float n = fbm3(p * uStretch * uScale + vec3(0.0, -uTime * uSwirl, uTime * 0.17));
        vNz = n; vUp = normal.y;
        p += normal * (n - 0.42) * uDisp;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uHot, uSmoke; uniform float uHeat, uAlpha, uUnder;
      varying vec3 vN; varying vec3 vV; varying float vNz; varying float vUp;
      void main(){
        float rim = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        float n = vNz;
        float heat = clamp(uHeat * (0.45 + 1.1 * n) + uUnder * clamp(-vUp, 0.0, 1.0) * (0.4 + n), 0.0, 1.0);
        vec3 smoke = uSmoke * (0.5 + 0.75 * n) * (0.55 + 0.45 * rim);
        vec3 col = mix(smoke, uHot * (1.0 + heat * 1.6), heat);
        float a = uAlpha * smoothstep(0.0, 0.45, rim) * (0.75 + 0.25 * n);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

// 온도(1=백열 → 0=식음) → 색
function heatColor(T, c) {
  if (T > 0.6) return c.setRGB(1, 0.85 + 0.15 * (T - 0.6) / 0.4, 0.55 + 0.45 * (T - 0.6) / 0.4);
  if (T > 0.25) return c.setRGB(1, 0.35 + 0.5 * (T - 0.25) / 0.35, 0.08 + 0.47 * (T - 0.25) / 0.35);
  return c.setRGB(0.55 + 0.45 * T / 0.25, 0.08 + 0.27 * T / 0.25, 0.02 + 0.06 * T / 0.25);
}

// ---------- 핵폭발 (물리 + 연출) ----------
export function detonate(A, q, { scale = 1, light = false } = {}) {
  const { D, fx, audio, world, camera, grid } = A.ctx;
  const S = A.S;
  const R = 380 * S.r * scale;
  const real = A.opts.realNuke;
  q = { x: q.x, y: grid.sample(q.x, q.z), z: q.z };
  // 물리: 중심부 증발 + 퍼져나가는 충격파
  D.explode({ x: q.x, y: q.y + 20, z: q.z, r: 70 * S.r * scale, power: 70 * S.v, vaporize: 55 * S.r * scale, lift: 0.5, lod: 1, scorch: 0.8 });
  world.paintScorch(q.x, q.z, R * 0.55, 0.95);
  world.paintScorch(q.x, q.z, R * 0.95, 0.45);
  world.blastTrees(q.x, q.z, R, R * 0.45);
  A.crater(q.x, q.z, 34 * S.r * scale, 10 * S.r * scale);
  const camDist = camera.position.distanceTo(v3(q.x, q.y, q.z));
  let shook = false;
  A.addActive({
    t: 0, prev: 60 * S.r * scale, dur: 3.4 * Math.sqrt(S.t * scale),
    update(dt) {
      this.t += dt;
      const t = Math.min(1, this.t / this.dur);
      const cur = R * (1 - (1 - t) ** 2.2);
      if (cur > this.prev) {
        const f = 1 - cur / R;
        D.explode({ x: q.x, y: q.y + 10, z: q.z, r: cur, inner: this.prev, power: (18 + 55 * f) * S.v, lift: 0.18, lod: cur < 160 ? 1 : 2, scorch: 0.5 * f + 0.1, lodBudget: 0 });
        fx.addShake(dt * 2 * f);
        const n = Math.round((real ? 6 : 10) * A.ctx.quality.fxScale);
        for (let k = 0; k < n; k++) {
          const u = Math.random() * 6.28, x = q.x + Math.cos(u) * cur, z = q.z + Math.sin(u) * cur;
          fx.smoke.emit(x, grid.sample(x, z) + 2, z, Math.cos(u) * 30 * f, 4, Math.sin(u) * 30 * f, 4 + Math.random() * 4, 12, 40, [0.55, 0.5, 0.45, 0.6 * f + 0.1], [0.5, 0.48, 0.46, 0], 0.8, 0.5);
        }
        if (!shook && cur >= camDist) { shook = true; fx.addShake(real ? 3.2 : 2); }
        this.prev = cur;
      }
      return t < 1;
    },
  });
  if (!real) {
    fx.nuke(q, R);
    audio.nuke();
    fx.ring(q, R * 1.15, 3.2, 0xffe2b0, 0.7);
    return;
  }
  A.addActive(new RealNukeFX(A, q, R, light));
  // 소리는 거리만큼 늦게 도착 (음속 343m/s, 최대 6초)
  const delay = Math.min(6, camDist / 343);
  A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t >= delay) { audio.nuke(); return false; } return true; } });
}

class RealNukeFX {
  constructor(A, q, R, light) {
    this.A = A; this.q = q; this.R = R; this.t = 0; this.light = light;
    const { scene, fx } = A.ctx;
    this.scene = scene;
    this.g = new THREE.Group(); this.g.position.set(q.x, q.y, q.z); scene.add(this.g);
    const seg = light ? 28 : 48;
    this.fire = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg * 0.66), cloudMat({ disp: 0.22, scale: 2.4, swirl: 0.6 }));
    this.cap = new THREE.Mesh(new THREE.TorusGeometry(1, 0.62, seg * 0.5, seg), cloudMat({ smoke: [0.42, 0.38, 0.35], disp: 0.3, scale: 2.0, swirl: 0.25 }));
    this.cap.rotation.x = Math.PI / 2;
    this.capTop = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg * 0.5, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat({ smoke: [0.48, 0.44, 0.4], disp: 0.25, scale: 2.2, swirl: 0.2 }));
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1, 1, seg * 0.5, 24, true), cloudMat({ smoke: [0.5, 0.44, 0.38], disp: 0.5, scale: 2.2, swirl: 1.4 }));
    this.wilson = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg * 0.5, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat({ smoke: [0.95, 0.95, 0.97], disp: 0.12, scale: 1.6 }));
    this.skirt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 1, seg + 16, 4, true), cloudMat({ smoke: [0.55, 0.48, 0.4], disp: 0.08, scale: 3.5, swirl: 1.2 }));
    for (const m of [this.fire, this.cap, this.capTop, this.stem, this.wilson, this.skirt]) { m.renderOrder = 12; m.frustumCulled = false; this.g.add(m); }
    this.cap.visible = this.capTop.visible = this.stem.visible = false;
    this.pl = new THREE.PointLight(0xffd8a0, 0, R * 6, 1.4); this.g.add(this.pl);
    this._c = new THREE.Color();
    fx.flash = 0.62;
    fx.light(q.x, q.y + 80, q.z, 1.2e5, R * 6, 1.6, 0xfff4e0);
    fx.addShake(0.4);
    // 열복사 화재
    const blds = A.ctx.D.buildingsNear(q.x, q.z, R * 0.6).filter(b => Math.hypot(b.cx - q.x, b.cz - q.z) > R * 0.15);
    for (let i = 0; i < Math.min(light ? 6 : 18, blds.length); i++) {
      const b = blds[Math.floor(Math.random() * blds.length)];
      const at = 0.5 + Math.random() * 3;
      A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t > at) { fx.column({ x: b.cx, y: b.baseY + b.height * 0.6, z: b.cz }, Math.max(3, Math.sqrt(b.area) * 0.25), 14 + Math.random() * 10); return false; } return true; } });
    }
    this.acc = 0;
  }
  update(dt) {
    this.t += dt;
    const t = this.t, R = this.R;
    const life = 46, fadeOut = Math.min(1, Math.max(0, (life - t) / 10));
    for (const m of [this.fire, this.cap, this.capTop, this.stem, this.wilson, this.skirt]) m.material.uniforms.uTime.value = t;
    // 화구: 급팽창 → 상승하며 식음
    const rf = R * 0.16 * (1 - Math.exp(-t / 0.35));
    const rise = R * 0.82 * (1 - Math.exp(-t / 7.5));
    const fy = rf * 0.85 + rise;
    const T = Math.exp(-t / 3.2);
    const fu = this.fire.material.uniforms;
    heatColor(T, fu.uHot.value);
    fu.uHeat.value = Math.min(1, 0.25 + T);
    const squash = 1 - 0.35 * Math.min(1, Math.max(0, (t - 2) / 4));
    this.fire.scale.set(rf * (1 + 0.25 * (1 - squash)), rf * squash, rf * (1 + 0.25 * (1 - squash)));
    this.fire.position.y = fy;
    fu.uAlpha.value = Math.min(1, t * 8) * Math.max(0, 1 - (t - 6) / 5);
    this.fire.visible = fu.uAlpha.value > 0.01;
    // 버섯 갓: 회전하는 고리 + 위쪽 돔
    if (t > 2.2) {
      const k = Math.min(1, (t - 2.2) / 7);
      const cr = R * (0.1 + 0.27 * ease.out(k));
      this.cap.visible = this.capTop.visible = true;
      this.cap.position.y = fy; this.capTop.position.y = fy + cr * 0.15;
      this.cap.scale.set(cr, cr, cr * 0.75);
      this.capTop.scale.set(cr * 1.15, cr * 0.75, cr * 1.15);
      this.cap.rotation.z += dt * 0.25;
      const cu = this.cap.material.uniforms, tu = this.capTop.material.uniforms;
      const capT = Math.max(0, T * 1.8);
      heatColor(Math.min(1, capT + 0.15), cu.uHot.value); heatColor(Math.min(1, capT), tu.uHot.value);
      cu.uHeat.value = Math.min(0.9, capT * 0.8); tu.uHeat.value = Math.min(0.6, capT * 0.5);
      cu.uUnder.value = 0.5 * Math.exp(-(t - 2.2) / 10); tu.uUnder.value = 0;
      cu.uAlpha.value = tu.uAlpha.value = Math.min(1, (t - 2.2) * 0.8) * fadeOut;
      // 기둥
      this.stem.visible = true;
      const sh = Math.max(1, fy - cr * 0.4);
      const sw = R * 0.075 * (0.6 + 0.6 * k);
      this.stem.scale.set(sw, sh, sw);
      this.stem.material.uniforms.uStretch.value.set(1, sh / sw * 0.35, 1);
      this.stem.position.y = sh / 2;
      const su = this.stem.material.uniforms;
      su.uAlpha.value = Math.min(0.95, (t - 2.2) * 0.5) * fadeOut;
      su.uHeat.value = 0.35 * T; heatColor(Math.min(1, T + 0.2), su.uHot.value);
      su.uUnder.value = 0;
    }
    // 응결운 (윌슨 구름): 순간 팽창 후 소멸
    const wu = this.wilson.material.uniforms;
    if (t < 3.5) {
      const wk = Math.min(1, t / 1.1);
      const wr = R * 0.55 * ease.out(wk);
      this.wilson.scale.set(wr, wr * 0.7, wr);
      wu.uAlpha.value = (t < 0.35 ? 0 : Math.min(0.55, (t - 0.35) * 1.2)) * Math.max(0, 1 - (t - 1.4) / 2);
      this.wilson.visible = wu.uAlpha.value > 0.01;
    } else this.wilson.visible = false;
    // 지면 충격파 먼지벽
    const su2 = this.skirt.material.uniforms;
    if (t < 9) {
      const sr = R * 1.05 * (1 - Math.exp(-t / 1.4));
      const f = Math.max(0, 1 - t / 9);
      this.skirt.scale.set(sr, 18 + 30 * f, sr);
      this.skirt.position.y = (18 + 30 * f) / 2 - 2;
      su2.uAlpha.value = Math.min(0.85, t * 3) * f;
      this.skirt.visible = true;
    } else this.skirt.visible = false;
    // 화구 빛
    this.pl.position.y = fy;
    this.pl.intensity = 6e4 * T * T + 6e3 * Math.exp(-t / 12);
    heatColor(Math.min(1, T + 0.3), this.pl.color);
    // 갓 주변 연기 덧칠
    const { fx } = this.A.ctx;
    this.acc += dt;
    const rate = (this.light ? 12 : 30) * this.A.ctx.quality.fxScale * (t < 18 ? 1 : 0);
    while (rate > 0 && this.acc > 1 / rate) {
      this.acc -= 1 / rate;
      const u = Math.random() * 6.28, cr = R * (0.1 + 0.3 * Math.min(1, t / 9));
      const q = this.q;
      fx.smoke.emit(q.x + Math.cos(u) * cr, q.y + fy + (Math.random() - 0.5) * cr * 0.4, q.z + Math.sin(u) * cr, Math.cos(u) * 4, 2 + Math.random() * 2, Math.sin(u) * 4,
        10 + Math.random() * 8, R * 0.08, R * 0.2, [0.45, 0.38, 0.33, 0.6], [0.42, 0.4, 0.39, 0], 0.2, 0.3, 0.15);
    }
    return t < life;
  }
  dispose() {
    this.scene.remove(this.g);
    this.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

// ---------- 공용: 시네마틱 마무리 샷 (폭발 후 멀리서 지켜보기) ----------
function aftermathShots(A, q, R, dirWide) {
  const wd = Math.max(500, Math.min(2200, R * 1.45));
  const base = v3(q.x, q.y, q.z);
  const side = dirWide.clone().normalize();
  return [
    { dur: 1.6, caption: '', update: (t, u, out) => {
      out.pos.copy(base).addScaledVector(side, wd).add(v3(0, 45, 0));
      out.look.copy(base).add(v3(0, R * 0.18, 0));
      out.fov = 42; out.timeScale = 0.35;
    } },
    { dur: 9, cut: false, update: (t, u, out) => {
      out.pos.copy(base).addScaledVector(side, wd * (1 + 0.25 * ease.inOut(u))).add(v3(0, 45 + 90 * ease.inOut(u), 0));
      out.look.copy(base).add(v3(0, R * (0.25 + 0.55 * ease.inOut(u)), 0));
      out.fov = 42 + 8 * u; out.timeScale = Math.min(1, 0.35 + t * 0.5); out.smooth = 0.25;
    } },
  ];
}

// ---------- 무기 ----------
export const NUKES = {
  nuke: {
    fire(A, hit) {
      const p = hit.point;
      A.addProjectile({
        mesh: A.spawn(makeNukeBomb(), 1.6), pos: v3(p.x, p.y + 340, p.z), vel: v3(0, -70, 0), g: 18, align: 'down',
        onHit: (q) => detonate(A, q),
      });
      A.ctx.audio.whoosh(4);
    },
  },

  // 폭격기가 날아와 투하
  bomber: {
    fire(A, hit) {
      const { scene, fx, audio, grid, game, camera } = A.ctx;
      const S = A.S, p = hit.point;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      // 카메라 시선과 수직인 방향으로 비행 (화면을 가로지르게)
      const camF = v3().subVectors(tgt, camera.position); camF.y = 0; camF.normalize();
      const dir = v3(-camF.z, 0, camF.x); if (Math.random() < 0.5) dir.negate();
      const perp = v3(-dir.z, 0, dir.x);
      const V = 190, alt = tgt.y + 520, T = 5, tr = 8;
      const Dfall = V * T / 2;
      const start = tgt.clone().addScaledVector(dir, -(Dfall + V * tr)); start.y = alt;
      const plane = A.spawn(makeBomber(), 1.4);
      const pu = plane.userData;
      const st = { t: 0, released: false, exploded: false, bomb: null, bombPos: v3(), relPos: v3(), planePos: start.clone(), skip: false };
      const R = 380 * S.r;
      audio.drone && audio.drone(16);
      // 비행기 + 폭탄 진행 (시네마틱과 별개로 시뮬레이션 시간 기준)
      const fly = A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          // 투하 후엔 상승하며 선회
          const pp = st.planePos;
          let heading = dir;
          if (t < tr + 0.5) pp.copy(start).addScaledVector(dir, V * t);
          else {
            const tt = t - tr - 0.5;
            const turn = Math.min(0.6, tt * 0.08);
            heading = dir.clone().applyAxisAngle(v3(0, 1, 0), turn);
            pp.addScaledVector(heading, V * dt); pp.y += Math.min(30, tt * 6) * dt;
          }
          plane.position.copy(pp);
          plane.quaternion.setFromUnitVectors(v3(0, 0, 1), heading);
          if (t >= tr + 0.5) plane.rotateZ(-Math.min(0.5, (t - tr - 0.5) * 0.15));
          // 폭탄창
          const open = Math.min(1, Math.max(0, (t - (tr - 1.2)) / 0.6)) * (t < tr + 3 ? 1 : Math.max(0, 1 - (t - tr - 3)));
          for (const d of pu.doors) d.hinge.rotation.z = d.s * open * 1.4;
          // 비행운
          st.acc = (st.acc || 0) + dt;
          while (st.acc > 0.04) {
            st.acc -= 0.04;
            for (const e of pu.engines) {
              const w = v3(e[0], e[1], e[2] - 6).multiplyScalar(1.4).applyQuaternion(plane.quaternion).add(pp);
              fx.smoke.emit(w.x, w.y, w.z, 0, 0, 0, 7, 1.0, 5, [0.95, 0.96, 0.98, 0.4], [0.9, 0.92, 0.95, 0], 0.05, 0, 0.15);
            }
          }
          // 투하
          if (!st.released && t >= tr) {
            st.released = true;
            st.relPos.copy(pp).add(v3(0, -4, 0));
            st.bomb = A.spawn(makeNukeBomb(), 2.4);
            audio.whoosh(4);
          }
          if (st.bomb && !st.exploded) {
            const u = Math.min(1, (t - tr) / T);
            st.bombPos.copy(st.relPos).addScaledVector(dir, Dfall * (1 - (1 - u) ** 2));
            st.bombPos.y = st.relPos.y - (st.relPos.y - tgt.y) * u * u;
            st.bomb.position.copy(st.bombPos);
            // 진행 방향으로 기울어짐
            const vel = dir.clone().multiplyScalar(V * (1 - u)).add(v3(0, -2 * (st.relPos.y - tgt.y) * u / T, 0)).normalize();
            st.bomb.quaternion.setFromUnitVectors(v3(0, -1, 0), vel);
            if (u >= 1) boom();
          }
          return t < tr + T + 14;
        },
        dispose() { A.remove(plane); if (st.bomb) A.remove(st.bomb); },
      });
      const boom = () => {
        if (st.exploded) return;
        st.exploded = true;
        if (st.bomb) { A.remove(st.bomb); st.bomb = null; }
        detonate(A, tgt);
      };
      if (!A.opts.cinematic || !game) return;
      // ---- 카메라 연출 ----
      const look = v3();
      const shots = [
        { dur: 3.2, caption: '폭격기 접근', update: (t, u, out) => {
          out.pos.copy(tgt).addScaledVector(perp, 140).addScaledVector(dir, -60); out.pos.y = tgt.y + 6;
          out.look.copy(st.planePos); out.fov = 26; out.smooth = 0.12;
        } },
        { dur: 3.6, update: (t, u, out) => {
          const pp = st.planePos;
          out.pos.copy(pp).addScaledVector(dir, -85).addScaledVector(perp, 18).add(v3(0, 22, 0));
          out.look.copy(pp).addScaledVector(dir, 70).add(v3(0, -18, 0));
          out.fov = 55; out.smooth = 0.1;
        } },
        { dur: 2.8, caption: '투하!', update: (t, u, out) => {
          const pp = st.planePos;
          // 비행기 옆 아래에서 폭탄창을 올려다봄 → 투하 후 폭탄을 따라 내려다봄
          out.pos.copy(pp).addScaledVector(perp, 45).addScaledVector(dir, -12).add(v3(0, -22, 0));
          if (st.bomb) out.look.copy(pp).lerp(st.bombPos, Math.min(1, (st.t - tr) * 0.9)); else out.look.copy(pp).add(v3(0, -3, 0));
          out.fov = 50; out.smooth = 0.1;
        } },
        { dur: 3.4, update: (t, u, out) => {
          const bp = st.bomb ? st.bombPos : tgt;
          out.pos.copy(bp).addScaledVector(dir, -26).add(v3(0, 30, 0));
          look.copy(bp).addScaledVector(dir, 40); look.y = tgt.y;
          out.look.copy(look); out.fov = 68; out.smooth = 0.06;
        } },
        ...aftermathShots(A, tgt, R, perp.clone().negate().addScaledVector(dir, 0.4)),
      ];
      game.cine.play(shots, {
        onSkip: () => { st.t = Math.max(st.t, tr + T); boom(); },
      });
    },
  },

  // 대륙간 탄도미사일
  icbm: {
    fire(A, hit) {
      const { scene, fx, audio, grid, game, camera } = A.ctx;
      const S = A.S, p = hit.point;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      // 사일로: 지도 가장자리, 카메라 반대편
      const half = grid.span / 2;
      const camF = v3().subVectors(tgt, camera.position); camF.y = 0; camF.normalize();
      const ang = Math.atan2(camF.z, camF.x) + (Math.random() - 0.5) * 1.2;
      const Ds = Math.min(half * 0.82, Math.max(game ? game.radius * 1.2 : 800, 700));
      const sx = Math.cos(ang) * Ds, sz = Math.sin(ang) * Ds;
      const silo = A.spawn(makeSilo(), 1);
      silo.position.set(sx, grid.sample(sx, sz) - 0.2, sz);
      const rocket = A.spawn(makeICBM(), 1.2);
      const ru = rocket.userData;
      rocket.position.copy(silo.position).add(v3(0, -ru.height * 1.2, 0));
      const toT = v3(tgt.x - sx, 0, tgt.z - sz).normalize();
      const R = 380 * S.r;
      const mirv = A.opts.mirv;
      const nW = mirv ? Math.min(10, 3 + Math.round(S.n)) : 1;
      // 탄두 목표
      const targets = [tgt.clone()];
      for (let i = 1; i < nW; i++) {
        const a = (i / (nW - 1)) * Math.PI * 2 + Math.random() * 0.4, d = R * (0.45 + Math.random() * 0.35);
        const x = tgt.x + Math.cos(a) * d, z = tgt.z + Math.sin(a) * d;
        targets.push(v3(x, grid.sample(x, z), z));
      }
      const st = { t: 0, pos: rocket.position.clone(), vel: v3(), launched: false, stage: 0, spent: [], warheads: [], phase: 'pad', done: false, reentry: 16 };
      audio.rumble && audio.rumble(3);
      const W0 = v3(tgt.x, tgt.y + 3600, tgt.z).addScaledVector(toT, -900); // 재진입 시작점
      const loop = A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          // 사일로 문
          const open = Math.min(1, t / 2);
          for (const d of silo.userData.doors) d.hinge.rotation.z = d.s * open * 1.9;
          if (t < 2.4 && Math.random() < dt * 20) fx.dust({ x: sx + (Math.random() - 0.5) * 6, y: silo.position.y + 1, z: sz + (Math.random() - 0.5) * 6 }, 3);
          // 발사
          if (t >= 2.4 && st.phase === 'pad') {
            st.phase = 'boost';
            st.pos.copy(silo.position).add(v3(0, -ru.height * 0.6, 0)); st.vel.set(0, 28, 0);
            audio.rocket && audio.rocket(11);
            for (let i = 0; i < 40; i++) fx.dust({ x: sx + (Math.random() - 0.5) * 30, y: silo.position.y + 2, z: sz + (Math.random() - 0.5) * 30 }, 6);
          }
          if (st.phase === 'boost') {
            const tb = t - 2.4;
            const ignite = tb > 0.6;
            if (ignite) {
              // 가속 + 6초 이후 목표 방향으로 기울이기
              const pitch = Math.min(0.75, Math.max(0, (tb - 4.5) / 6) * 0.75);
              const dirv = v3(0, 1, 0).applyAxisAngle(v3(-toT.z, 0, toT.x), -pitch).normalize();
              const sp = st.vel.length() + (22 + tb * 3) * dt;
              st.vel.copy(dirv).multiplyScalar(sp);
            } else st.vel.y -= 9.8 * dt * 0.3;
            st.pos.addScaledVector(st.vel, dt);
            rocket.position.copy(st.pos);
            rocket.quaternion.setFromUnitVectors(v3(0, 1, 0), st.vel.clone().normalize());
            // 단 분리
            const sepT = [6.2, 10.5];
            if (st.stage < 2 && tb > sepT[st.stage]) {
              const sg = ru.stages[st.stage];
              scene.attach(sg);
              st.spent.push({ obj: sg, vel: st.vel.clone().multiplyScalar(0.8), spin: v3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5), t: 0 });
              st.stage++;
              fx.explosion({ x: sg.position.x, y: sg.position.y, z: sg.position.z }, 4, { smokeColumn: false });
            }
            // 화염 + 연기 기둥
            if (ignite) {
              const back = st.vel.clone().normalize().multiplyScalar(-1);
              const nz = st.pos.clone();
              const cur = ru.stages[st.stage];
              if (cur) nz.add(v3(0, cur.userData.y0 * 1.2, 0).applyQuaternion(rocket.quaternion));
              for (let k = 0; k < 3; k++) {
                fx.fire.emit(nz.x, nz.y, nz.z, back.x * 60 + (Math.random() - 0.5) * 8, back.y * 60 + (Math.random() - 0.5) * 8, back.z * 60 + (Math.random() - 0.5) * 8, 0.35, 3.5, 7, [1, 0.85, 0.55, 1], [1, 0.3, 0.05, 0], 2, 0);
              }
              st.sAcc = (st.sAcc || 0) + dt;
              while (st.sAcc > 0.03) { st.sAcc -= 0.03; fx.smoke.emit(nz.x, nz.y, nz.z, back.x * 10, back.y * 10, back.z * 10, 14 + Math.random() * 6, 5, 22, [0.88, 0.88, 0.88, 0.75], [0.8, 0.8, 0.82, 0], 0.4, 0.2, 0.05); }
            }
            if (tb > 13.5) { st.phase = 'space'; rocket.visible = false; }
          }
          // 버려진 단: 회전하며 추락
          for (let i = st.spent.length - 1; i >= 0; i--) {
            const s = st.spent[i]; s.t += dt;
            s.vel.y -= 9.8 * dt; s.obj.position.addScaledVector(s.vel, dt);
            s.obj.rotation.x += s.spin.x * dt; s.obj.rotation.z += s.spin.z * dt;
            if (s.t > 12) { A.remove(s.obj); st.spent.splice(i, 1); }
          }
          // 재진입
          if (st.phase === 'space' && t >= st.reentry) {
            st.phase = 'reentry';
            for (let i = 0; i < nW; i++) {
              const m = A.spawn(makeWarhead(), 4);
              const from = W0.clone().add(v3((Math.random() - 0.5) * 30, i * 8, (Math.random() - 0.5) * 30));
              st.warheads.push({ m, from, to: targets[i], t0: t + (mirv ? 0.6 + i * 0.35 : 0), dur: 5.2, hit: false });
            }
          }
          if (st.phase === 'reentry') {
            let alive = 0;
            for (const w of st.warheads) {
              if (w.hit) continue;
              alive++;
              const u = Math.max(0, (t - w.t0) / w.dur);
              const split = Math.min(1, u * 1.6);
              const pos = w.from.clone().lerp(w.to, u * u * 0.4 + u * 0.6);
              // MIRV 는 처음엔 뭉쳐 있다가 갈라짐
              if (mirv) pos.lerp(W0.clone().lerp(targets[0], u * u * 0.4 + u * 0.6), 1 - split);
              w.m.position.copy(pos);
              const dir = w.to.clone().sub(w.from).normalize();
              w.m.quaternion.setFromUnitVectors(v3(0, -1, 0), dir);
              // 플라즈마 꼬리
              if (u > 0) for (let k = 0; k < 2; k++) {
                fx.fire.emit(pos.x, pos.y, pos.z, -dir.x * 40 + (Math.random() - 0.5) * 6, -dir.y * 40, -dir.z * 40 + (Math.random() - 0.5) * 6, 0.55, 9, 3, [1, 0.7, 0.45, 1], [1, 0.25, 0.1, 0], 1, 0);
                fx.smoke.emit(pos.x, pos.y, pos.z, 0, 0, 0, 7, 4, 14, [0.9, 0.86, 0.82, 0.6], [0.8, 0.8, 0.8, 0], 0.3, 0, 0.05);
              }
              if (u >= 1) { w.hit = true; A.remove(w.m); detonate(A, w.to, { scale: mirv ? 0.55 : 1, light: mirv }); }
            }
            if (!alive) { st.done = true; }
          }
          return !(st.done && st.spent.length === 0) && t < 60;
        },
        dispose() { A.remove(rocket); A.remove(silo); for (const s of st.spent) A.remove(s.obj); for (const w of st.warheads) if (!w.hit) A.remove(w.m); },
      });
      if (!A.opts.cinematic || !game) return;
      // ---- 카메라 연출 ----
      const sp = silo.position.clone();
      const side = v3(-toT.z, 0, toT.x);
      const shots = [
        { dur: 2.4, caption: '발사 준비', update: (t, u, out) => {
          out.pos.copy(sp).addScaledVector(side, 46).addScaledVector(toT, -30).add(v3(0, 14 + u * 6, 0));
          out.look.copy(sp).add(v3(0, 4, 0)); out.fov = 45; out.smooth = 0.2;
        } },
        { dur: 4.6, caption: '발사!', update: (t, u, out) => {
          out.pos.copy(sp).addScaledVector(side, 80).addScaledVector(toT, -50).add(v3(0, 6, 0));
          out.look.copy(st.pos).add(v3(0, 10, 0)); out.fov = 50 - u * 22; out.smooth = 0.1;
        } },
        { dur: 5.5, caption: '', update: (t, u, out) => {
          // 로켓 옆에서 나란히 날며 올려다봄 (배기 화염 밖)
          const fwd = st.vel.clone().normalize();
          out.pos.copy(st.pos).addScaledVector(side, 70).addScaledVector(fwd, -10).addScaledVector(toT, -20);
          out.look.copy(st.pos).addScaledVector(fwd, 25); out.fov = 52; out.smooth = 0.08;
        } },
        { dur: 3.0, caption: '탄도 비행', update: (t, u, out) => {
          out.pos.copy(tgt).addScaledVector(toT, 260).add(v3(0, 25, 0));
          out.look.copy(st.phase === 'boost' ? st.pos : sp.clone().add(v3(0, 3000, 0))); out.fov = 24; out.smooth = 0.3;
        } },
        { dur: 1.0, update: (t, u, out) => {
          out.pos.copy(tgt).addScaledVector(toT, 260).add(v3(0, 25, 0)); out.look.copy(sp).add(v3(0, 3500, 0)); out.fade = u;
        } },
        { dur: 4.8, caption: mirv ? `재진입 · 탄두 ${nW}개` : '재진입', update: (t, u, out) => {
          const w = st.warheads[0];
          const wp = w && !w.hit ? w.m.position : tgt;
          // 표적 너머에서 날아드는 탄두를 마주봄 (발사 연기 기둥을 피함)
          out.pos.copy(tgt).addScaledVector(toT, 420).addScaledVector(side, 160).add(v3(0, 160, 0));
          out.look.copy(wp).lerp(tgt, 0.35); out.fov = mirv ? 58 : 44; out.smooth = 0.15; out.fade = Math.max(0, 1 - t * 1.5);
        } },
        ...aftermathShots(A, tgt, R * (mirv ? 1.9 : 1), side),
      ];
      // 재진입 시점을 시네마틱과 맞춤
      st.reentry = 2.4 + 4.6 + 5.5 + 3.0 + 1.0 - 0.6;
      game.cine.play(shots, {
        onSkip: () => {
          // 바로 탄두 착탄
          st.phase = st.phase === 'reentry' ? st.phase : 'reentry';
          rocket.visible = false;
          if (!st.warheads.length) { for (let i = 0; i < nW; i++) st.warheads.push({ m: A.spawn(makeWarhead(), 2.2), from: W0.clone(), to: targets[i], t0: st.t - 5.2 + i * 0.25, dur: 5.2, hit: false }); }
          else for (const w of st.warheads) w.t0 = Math.min(w.t0, st.t - w.dur + 0.05);
        },
      });
    },
  },
};
