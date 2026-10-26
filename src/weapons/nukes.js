// 핵무기 3종 + 핵폭발 연출 (아케이드 / 실감)
import * as THREE from 'three';
import { makeNukeBomb, makeBomber, makeICBM, makeSilo, makeWarhead } from './models.js';
import { makeTsarBomb, makeParachute, makeAntimatter } from './models2.js';
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

// ---------- 핵폭발 규모 (실제 핵무기 효과 상사법칙) ----------
// 위력 ×1 ≈ 15kt(히로시마), ×10 ≈ 0.84Mt, ×100 ≈ 47Mt(차르 봄바급)
export const nukeYield = (P) => 15 * Math.max(0.5, P) ** 1.75;
export function nukeRadii(kt) {
  const s = Math.cbrt(kt / 15);
  const fire = 170 * (kt / 15) ** 0.4;          // 화구 반경
  return {
    kt, s, fire,
    vap: fire * 0.85,                            // 증발
    r20: Math.max(fire * 1.15, 560 * s),         // 20psi: 철근콘크리트까지 붕괴 → 물리 파괴
    r5: 1650 * s,                                // 5psi: 대부분 건물 붕괴
    r1: 4600 * s,                                // 1psi: 유리창·가벼운 피해
    crater: 38 * s, craterD: 11 * s,
    cloud: 520 * (kt / 15) ** 0.38,              // 버섯구름 크기 기준
  };
}
export function fmtYield(kt) {
  if (kt >= 1e6) return (kt / 1e6).toFixed(kt >= 1e7 ? 0 : 1) + 'Gt';
  if (kt >= 1000) return (kt / 1000).toFixed(kt >= 1e4 ? 0 : 1) + 'Mt';
  return Math.round(kt) + 'kt';
}

// ---------- 핵폭발 (물리 + 연출) ----------
// opts: scale(위력 배수), kt(직접 지정), light(가벼운 연출), kind: 'nuke'|'anti'
export function detonate(A, q, { scale = 1, light = false, kt = null, kind = 'nuke', pullback = true } = {}) {
  const { D, fx, audio, world, camera, grid, game } = A.ctx;
  const S = A.S;
  const Y = kt || nukeYield(S.P) * scale ** 3;
  const N = nukeRadii(Y);
  const real = A.opts.realNuke;
  q = { x: q.x, y: grid.sample(q.x, q.z), z: q.z };
  const half = grid.span / 2, mapR = half * 1.42;
  const clampR = (r) => Math.min(r, mapR);
  // 지형·나무·그을음
  world.paintScorch(q.x, q.z, clampR(N.r20), 0.95);
  world.paintScorch(q.x, q.z, clampR(N.r5), 0.55);
  world.blastTrees(q.x, q.z, clampR(N.r5), clampR(N.r20));
  A.crater(q.x, q.z, Math.min(N.crater, half * 0.9), Math.min(N.craterD, 260));
  // 화구 안 파편 즉시 증발
  for (const c of [...D.loose]) if ((c.x - q.x) ** 2 + (c.z - q.z) ** 2 < N.vap * N.vap) D.removeChunk(c);
  // 건물마다 거리순 처리 (충격파가 지나갈 때)
  const list = [];
  for (const b of D.buildings) {
    if (b.state === 'gone') continue;
    const d = Math.hypot(b.cx - q.x, b.cz - q.z);
    if (d < N.r1) list.push([d, b]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const Q = A.ctx.quality;
  let fracLeft = Math.round((Q.shockFracture || 18) * 4 * (light ? 0.5 : 1));
  let dustLeft = Math.round(40 * Q.fxScale);
  const camDist = camera.position.distanceTo(v3(q.x, q.y, q.z));
  const Rmax = Math.min(N.r1, mapR);
  const dur = Math.max(2.5, Math.min(9, 1.6 + Rmax / 520)) * (light ? 0.8 : 1);
  let k = 0, shook = false;
  A.addActive({
    t: 0, prev: 0,
    update(dt) {
      this.t += dt;
      const u = Math.min(1, this.t / dur);
      const cur = Math.max(N.fire * Math.min(1, this.t / 0.25), Rmax * (1 - (1 - u) ** 2));
      while (k < list.length && list[k][0] <= cur) {
        const [d, b] = list[k++];
        if (d < N.vap) { D.vaporizeBuilding(b); continue; }
        const dirx = (b.cx - q.x) / (d || 1), dirz = (b.cz - q.z) / (d || 1);
        if (d < N.r20 && fracLeft > 0 && b.state === 'intact' || b.state === 'fractured' && d < N.r5) {
          if (b.state === 'intact') fracLeft--;
          const f = 1 - d / N.r5;
          D.blastFrom(b, q, (25 + 60 * f) * S.v, { lift: 0.2, scorch: 0.3 + 0.5 * f, lod: d < N.r20 * 0.6 ? 1 : 2 });
        } else if (d < N.r20) {
          D.flatten(b, 1, dirx, dirz, 1.2);
          if (dustLeft > 0 && Math.random() < 0.3) { dustLeft--; fx.collapseDust(b); }
        } else if (d < N.r5) {
          const sev = 1 - 0.7 * (d - N.r20) / (N.r5 - N.r20);
          D.flatten(b, sev, dirx, dirz, 1.6);
          if (dustLeft > 0 && Math.random() < 0.15) { dustLeft--; fx.collapseDust(b); }
        } else D.flatten(b, 0.29 * (1 - (d - N.r5) / (N.r1 - N.r5)), dirx, dirz);
      }
      if (cur > this.prev) {
        const f = 1 - cur / Rmax;
        D.ringPush(q, this.prev, cur, (10 + 40 * f) * S.v, 0.2);
        fx.addShake(dt * 2.5 * f);
        // 지면을 따라 퍼지는 먼지벽
        const n = Math.round((real ? 8 : 12) * Q.fxScale);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28, x = q.x + Math.cos(a) * cur, z = q.z + Math.sin(a) * cur;
          if (Math.abs(x) > half * 1.3 || Math.abs(z) > half * 1.3) continue;
          const sz = Math.min(80, 6 + cur * 0.02);
          fx.smoke.emit(x, grid.sample(x, z) + 2, z, Math.cos(a) * 40 * f, 5, Math.sin(a) * 40 * f, 4 + Math.random() * 4, sz, sz * 3.5, [0.55, 0.5, 0.45, 0.6 * f + 0.15], [0.5, 0.48, 0.46, 0], 0.8, 0.5);
        }
        if (!shook && cur >= camDist) { shook = true; fx.addShake(real ? 3.4 : 2.2); }
        this.prev = cur;
      }
      return u < 1 || k < list.length;
    },
  });
  // 너무 큰 폭발: 카메라 시야 넓히기 + 멀리 물러나기
  const Rv = N.cloud * (kind === 'anti' ? 0.8 : 1);
  if (game) {
    game.ensureView(Rv * 8, Rv * 3.2);
    if (Y >= 4000) { const lv = Math.min(1, 0.35 + 0.65 * Math.log10(Y / 4000) / 1.1); A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t > 4) { game.setDoom(lv, kind); return false; } return true; } }); }
  }
  // 충격파 고리 (지도 너머 지평선까지)
  fx.ring(q, Math.min(N.r1, 90000), dur * 1.6, kind === 'anti' ? 0xd8c8ff : 0xffe2b0, 0.55);
  if (N.r5 > half) fx.ring(q, Math.min(N.r5, 60000), dur * 1.1, 0xfff0d8, 0.35);
  if (!real) {
    fx.nuke(q, Math.min(Rv, 4000));
    audio.nuke();
  } else {
    A.addActive(new RealNukeFX(A, q, Rv, light, { kind, skirt: Math.min(N.r5, Math.max(mapR * 1.2, Rv * 1.6)), fireR: N.fire }));
    const delay = A.opts.soundDelay === false ? 0 : Math.min(6, camDist / 343);
    A.addActive({ t: 0, update(dt) { this.t += dt; if (this.t >= delay) { audio.nuke(); if (Y > 3000) audio.nuke(); return false; } return true; } });
  }
  // 카메라가 버섯구름에 묻히면 자동으로 물러나서 지켜봄
  if (pullback && game && A.opts.cinematic && A.opts.autoPull !== false && !game.cine.active && camDist < Rv * 2.2 && Y > 400) {
    const off = v3().subVectors(camera.position, v3(q.x, q.y, q.z)); off.y = 0;
    if (off.lengthSq() < 1) off.set(1, 0, 0);
    game.cine.play(aftermathShots(A, q, Rv, off, true), {});
  }
  if (A.ctx.hud && A.ctx.hud.toast) A.ctx.hud.toast(`${kind === 'anti' ? '반물질 소멸' : kind === 'impact' ? '충돌' : '핵폭발'} · TNT ${fmtYield(Y)}`);
  return N;
}

export class RealNukeFX {
  constructor(A, q, R, light, o = {}) {
    this.A = A; this.q = q; this.R = R; this.t = 0; this.light = light; this.o = o;
    this.anti = o.kind === 'anti';
    this.k = Math.max(1, Math.min(1.6, (R / 600) ** 0.25)); // 큰 구름일수록 느리게
    this.skirtR = o.skirt || R * 1.05;
    this.rf0 = Math.max(R * 0.16, Math.min((o.fireR || 0) * 0.7, R * (this.anti ? 0.36 : 0.26)));
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
    if (o.kind === 'impact') {
      for (const m of [this.fire, this.cap, this.capTop, this.stem, this.skirt, this.wilson]) m.material.uniforms.uSmoke.value.lerp(new THREE.Color(0.36, 0.28, 0.2), 0.7);
    }
    if (this.anti) {
      for (const m of [this.cap, this.capTop, this.stem, this.skirt]) m.material.uniforms.uSmoke.value.lerp(new THREE.Color(0.55, 0.5, 0.75), 0.6);
      this.wilson.material.uniforms.uSmoke.value.setRGB(0.85, 0.82, 1);
    }
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
    const R = this.R, t = this.t / this.k;
    const life = 46, fadeOut = Math.min(1, Math.max(0, (life - t) / 10));
    for (const m of [this.fire, this.cap, this.capTop, this.stem, this.wilson, this.skirt]) m.material.uniforms.uTime.value = t;
    // 화구: 급팽창 → 상승하며 식음
    const rf = this.rf0 * (1 - Math.exp(-t / 0.35));
    const rise = R * (this.anti ? 0.35 : 0.82) * (1 - Math.exp(-t / 7.5));
    const fy = rf * 0.85 + rise;
    const T = Math.exp(-t / 3.2);
    const fu = this.fire.material.uniforms;
    heatColor(T, fu.uHot.value); if (this.anti) fu.uHot.value.lerp(this._anti || (this._anti = new THREE.Color(0.7, 0.6, 1.0)), 0.75);
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
      if (this.anti) { cu.uHot.value.lerp(this._anti, 0.75); tu.uHot.value.lerp(this._anti, 0.75); }
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
      const sr = this.skirtR * (1 - Math.exp(-t / 1.4));
      const f = Math.max(0, 1 - t / 9);
      const sh = (18 + 30 * f) * Math.max(1, Math.sqrt(this.skirtR / 400));
      this.skirt.scale.set(sr, sh, sr);
      this.skirt.position.y = sh / 2 - 2;
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
export function aftermathShots(A, q, R, dirWide, auto = false) {
  const wd = auto ? Math.max(700, R * 2.3) : Math.max(500, R < 1500 ? Math.min(2200, R * 1.45) : R * 1.6);
  const base = v3(q.x, q.y, q.z);
  const side = dirWide.clone().normalize();
  return [
    { dur: 0.7, caption: '', update: (t, u, out) => {
      out.pos.copy(base).addScaledVector(side, wd).add(v3(0, 45 + wd * 0.03, 0));
      out.look.copy(base).add(v3(0, R * 0.18, 0));
      out.fov = 42; out.timeScale = auto ? 0.6 : 0.35; if (auto) out.fade = Math.max(0, 1 - t * 2.5);
    } },
    { dur: 9, cut: false, update: (t, u, out) => {
      out.pos.copy(base).addScaledVector(side, wd * (1 + 0.25 * ease.inOut(u))).add(v3(0, 45 + wd * 0.03 + (90 + wd * 0.08) * ease.inOut(u), 0));
      out.look.copy(base).add(v3(0, R * (0.2 + (auto ? 0.3 : 0.5) * ease.inOut(u)), 0));
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
      const R = nukeRadii(nukeYield(S.P)).cloud;
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

  // 대륙간 탄도미사일: 지도 밖 수 km 떨어진 사일로에서 발사 → 하나로 이어진 탄도 궤적 → 재진입 → 착탄
  icbm: {
    fire(A, hit) {
      const { fx, audio, grid, game, camera, world } = A.ctx;
      const S = A.S, p = hit.point;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const half = grid.span / 2;
      // 사일로: 카메라 시선과 비스듬한 방향, 지도 밖 10km 안팎
      const camF = v3().subVectors(tgt, camera.position); camF.y = 0; camF.normalize();
      const ang = Math.atan2(camF.z, camF.x) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.5);
      const Dist = Math.max(half * 2.2, 9000 + Math.random() * 3000);
      const outerY = world && world.outer ? world.outer.position.y + 1.5 : grid.sample(half, half);
      const siloPos = v3(tgt.x + Math.cos(ang) * Dist, outerY, tgt.z + Math.sin(ang) * Dist);
      const toT = v3(tgt.x - siloPos.x, 0, tgt.z - siloPos.z).normalize();
      const side = v3(-toT.z, 0, toT.x);
      const silo = A.spawn(makeSilo(), 1.6); silo.position.copy(siloPos);
      const rocket = A.spawn(makeICBM(), 1.6);
      const ru = rocket.userData;
      rocket.position.copy(siloPos).add(v3(0, -ru.height * 1.6, 0));
      const R = nukeRadii(nukeYield(S.P)).cloud;
      const mirv = A.opts.mirv;
      const nW = mirv ? Math.min(10, 3 + Math.round(S.n)) : 1;
      const targets = [tgt.clone()];
      for (let i = 1; i < nW; i++) {
        const a = (i / (nW - 1)) * Math.PI * 2 + Math.random() * 0.4, d = Math.min(half * 0.7, R * (0.45 + Math.random() * 0.35));
        const x = tgt.x + Math.cos(a) * d, z = tgt.z + Math.sin(a) * d;
        targets.push(v3(x, grid.sample(x, z), z));
      }
      if (game) game.ensureView(Dist * 3, Dist * 1.2);
      // 궤적: 수직 발사 → 완만한 탄도 → 가파른 재진입 (3차 베지어, 길이 기준 진행)
      const H = Dist * 0.42;
      const P0 = siloPos.clone(), P1 = siloPos.clone().add(v3(0, H * 1.15, 0));
      const P2 = tgt.clone().addScaledVector(toT, -Dist * 0.18).add(v3(0, H * 1.05, 0)), P3 = tgt.clone();
      const bez = (a, b, c, d, s, out) => { const u = 1 - s; return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * s).addScaledVector(c, 3 * u * s * s).addScaledVector(d, s * s * s); };
      const mkCurve = (a, b, c, d) => {
        const N = 240, tab = [0]; const q = v3(), prev = a.clone(); let L = 0;
        for (let i = 1; i <= N; i++) { bez(a, b, c, d, i / N, q); L += q.distanceTo(prev); tab.push(L); prev.copy(q); }
        return { a, b, c, d, L, tab, at(dist, out) { dist = Math.max(0, Math.min(L, dist)); let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] < dist) lo = m; else hi = m; } const s = (lo + (dist - tab[lo]) / Math.max(1e-6, tab[hi] - tab[lo])) / N; return bez(a, b, c, d, s, out); } };
      };
      const main = mkCurve(P0, P1, P2, P3);
      const T_PAD = 2.4, T = 22;                // 게임 시간 (연출과 같은 시계)
      const prog = (u) => u ** 1.9;              // 천천히 가속해 재진입 때 가장 빠름
      const U_SEP = [0.07, 0.16], U_REL = 0.56;  // 단 분리, 탄두 분리
      const st = { t: 0, phase: 'pad', pos: rocket.position.clone(), vel: v3(), prev: siloPos.clone(), stage: 0, spent: [], warheads: [], done: false, rel: null };
      audio.rumble(3);
      const trail = (from, to, size, col, life, fire) => {
        const n = Math.min(14, Math.ceil(from.distanceTo(to) / Math.max(4, size * 0.6)));
        for (let k = 0; k < n; k++) {
          const q = from.clone().lerp(to, (k + Math.random()) / n);
          fx.smoke.emit(q.x, q.y, q.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, life * (0.8 + Math.random() * 0.4), size, size * 5, [col, col, col * 1.02, 0.75], [col * 0.95, col * 0.95, col, 0], 0.05, 0.3, 0.05);
          if (fire) fx.fire.emit(q.x, q.y, q.z, 0, 0, 0, 0.4, size * 0.9, size * 0.3, [1, 0.85, 0.55, 1], [1, 0.3, 0.05, 0], 1, 0);
        }
      };
      const tmp = v3(), tmp2 = v3();
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          const open = Math.min(1, t / 2);
          for (const d of silo.userData.doors) d.hinge.rotation.z = d.s * open * 1.9;
          if (t < T_PAD) { if (Math.random() < dt * 25) fx.dust({ x: siloPos.x + (Math.random() - 0.5) * 10, y: siloPos.y + 1, z: siloPos.z + (Math.random() - 0.5) * 10 }, 4); return true; }
          if (st.phase === 'pad') { st.phase = 'flight'; audio.rocket(9); for (let i = 0; i < 50; i++) fx.dust({ x: siloPos.x + (Math.random() - 0.5) * 40, y: siloPos.y + 2, z: siloPos.z + (Math.random() - 0.5) * 40 }, 8); }
          const u = Math.min(1, (t - T_PAD) / T);
          // 본체(분리 전)
          if (!st.rel) {
            main.at(main.L * prog(u), st.pos);
            st.vel.subVectors(st.pos, st.prev).divideScalar(Math.max(dt, 1e-4));
            rocket.position.copy(st.pos);
            if (st.vel.lengthSq() > 1) rocket.quaternion.setFromUnitVectors(v3(0, 1, 0), tmp.copy(st.vel).normalize());
            const burning = u < 0.3;
            const back = tmp2.copy(st.vel).normalize().multiplyScalar(-1);
            const nz = st.pos.clone().addScaledVector(back, 4);
            trail(st.prev.clone().addScaledVector(back, 4), nz, burning ? 9 : 4, burning ? 0.88 : 0.95, burning ? 45 : 30, burning);
            // 단 분리
            while (st.stage < 2 && u > U_SEP[st.stage]) {
              const sg = ru.stages[st.stage];
              A.ctx.scene.attach(sg);
              st.spent.push({ obj: sg, vel: st.vel.clone().multiplyScalar(0.6), spin: v3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5), t: 0 });
              st.stage++;
              fx.explosion({ x: sg.position.x, y: sg.position.y, z: sg.position.z }, 6, { smokeColumn: false });
            }
            // 탄두 분리 (다탄두면 여러 개가 갈라져 각자 표적으로)
            if (u >= U_REL) {
              st.rel = { u0: u, t0: t };
              rocket.visible = false;
              const tan = st.vel.clone().normalize();
              for (let i = 0; i < nW; i++) {
                const to = targets[i];
                const spread = mirv ? v3((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 120) : v3();
                const a = st.pos.clone(), b = a.clone().addScaledVector(tan, Dist * 0.12).add(spread);
                const c = to.clone().addScaledVector(toT, -Dist * 0.05).add(v3(0, H * 0.35, 0)).add(spread.clone().multiplyScalar(0.5));
                const cv = mkCurve(a, b, c, to.clone());
                st.warheads.push({ m: A.spawn(makeWarhead(), 3.5), cv, to, delay: mirv ? i * 0.25 : 0, pos: a.clone(), prev: a.clone(), hit: false });
              }
            }
            st.prev.copy(st.pos);
          } else {
            // 탄두: 남은 시간 동안 각자의 궤적으로 내려감 (점점 빨라짐)
            let alive = 0;
            for (const w of st.warheads) {
              if (w.hit) continue;
              alive++;
              const uu = Math.max(0, Math.min(1, (u - st.rel.u0) / (1 - st.rel.u0) - w.delay / T));
              w.cv.at(w.cv.L * uu ** 1.5, w.pos);
              const dir = tmp.subVectors(w.pos, w.prev);
              w.m.position.copy(w.pos);
              if (dir.lengthSq() > 1e-6) w.m.quaternion.setFromUnitVectors(v3(0, -1, 0), dir.clone().normalize());
              const alt = w.pos.y - w.to.y;
              trail(w.prev, w.pos, alt < 3500 ? 5 : 2.5, 0.92, 25, alt < 3500);
              if (alt < 3500) fx.light(w.pos.x, w.pos.y, w.pos.z, 2e4, 900, 0.05, 0xffa060);
              w.prev.copy(w.pos);
              if (uu >= 1) { w.hit = true; A.remove(w.m); detonate(A, w.to, { scale: mirv ? 0.55 : 1, light: mirv, pullback: false }); }
            }
            if (!alive) st.done = true;
          }
          for (let i = st.spent.length - 1; i >= 0; i--) {
            const s = st.spent[i]; s.t += dt;
            s.vel.y -= 9.8 * dt; s.obj.position.addScaledVector(s.vel, dt);
            s.obj.rotation.x += s.spin.x * dt; s.obj.rotation.z += s.spin.z * dt;
            if (s.t > 25) { A.remove(s.obj); st.spent.splice(i, 1); }
          }
          return !(st.done && st.spent.length === 0) && t < T_PAD + T + 40;
        },
        dispose() { A.remove(rocket); A.remove(silo); for (const s of st.spent) A.remove(s.obj); for (const w of st.warheads) if (!w.hit) A.remove(w.m); },
      });
      if (!A.opts.cinematic || !game) return;
      const lead = () => (st.rel ? (st.warheads.find(w => !w.hit) || st.warheads[0]).pos : st.pos);
      const leadDir = () => { const w = st.rel ? (st.warheads.find(x => !x.hit) || st.warheads[0]) : null; return w ? v3().subVectors(w.pos, w.prev) : st.vel.clone(); };
      const tRel = T_PAD + T * U_REL;
      const sp = siloPos.clone();
      const shots = [
        { dur: T_PAD, caption: `ICBM 발사 준비 · 표적까지 ${(Dist / 1000).toFixed(0)}km`, update: (t, u, out) => {
          out.pos.copy(sp).addScaledVector(side, 70).addScaledVector(toT, -40).add(v3(0, 18 + u * 8, 0));
          out.look.copy(sp).add(v3(0, 6, 0)); out.fov = 45; out.smooth = 0.2;
        } },
        { dur: 3.6, caption: '발사!', update: (t, u, out) => {
          out.pos.copy(sp).addScaledVector(side, 160).addScaledVector(toT, -90).add(v3(0, 8, 0));
          out.look.copy(st.pos).add(v3(0, 15, 0)); out.fov = 55 - u * 25; out.smooth = 0.08;
        } },
        { dur: 4.5, update: (t, u, out) => {
          const f = st.vel.lengthSq() > 1 ? st.vel.clone().normalize() : v3(0, 1, 0);
          out.pos.copy(st.pos).addScaledVector(side, 70).addScaledVector(f, -25).add(v3(0, -6, 0));
          out.look.copy(st.pos).addScaledVector(f, 40); out.fov = 55; out.smooth = 0.06;
        } },
        { dur: Math.max(2, tRel - T_PAD - 3.6 - 4.5), caption: '탄도 비행', update: (t, u, out) => {
          const f = st.vel.lengthSq() > 1 ? st.vel.clone().normalize() : toT;
          // 로켓 바로 뒤 위에서: 로켓이 화면 아래쪽, 멀리 표적 도시가 보이게
          out.pos.copy(st.pos).addScaledVector(f, -42).add(v3(0, 14, 0)).addScaledVector(side, 10);
          out.look.copy(st.pos).addScaledVector(f, 60).lerp(tgt, 0.05 + 0.25 * u); out.fov = 55; out.smooth = 0.08;
        } },
        { dur: Math.max(2, T_PAD + T - tRel - 1.8), caption: mirv ? `재진입 · 탄두 ${nW}개` : '재진입', update: (t, u, out) => {
          const p0 = lead(), d = leadDir(); if (d.lengthSq() < 1e-6) d.copy(toT); d.normalize();
          out.pos.copy(p0).addScaledVector(d, -(mirv ? 260 : 130)).add(v3(0, mirv ? 90 : 35, 0));
          out.look.copy(tgt); out.fov = mirv ? 60 : 50; out.smooth = 0.08;
        } },
        { dur: 1.9, update: (t, u, out) => {
          out.pos.copy(tgt).addScaledVector(toT, 520).addScaledVector(side, 160); out.pos.y = tgt.y + 40;
          out.look.copy(lead()).lerp(tgt, 0.4); out.fov = 46; out.smooth = 0.1;
        } },
        ...aftermathShots(A, tgt, R * (mirv ? 1.9 : 1), side),
      ];
      game.cine.play(shots, {
        onSkip: () => {
          // 바로 탄두 착탄 직전으로
          st.t = Math.max(st.t, T_PAD + T - 0.05);
          if (!st.rel) { st.prev.copy(st.pos); }
        },
      });
    },
  },

  // 차르 봄바급: 대형 폭격기 + 낙하산 투하, 수십 Mt
  tsar: {
    fire(A, hit) {
      const { fx, audio, grid, game, camera } = A.ctx;
      const S = A.S, p = hit.point;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const kt = 50000 * Math.max(0.1, S.P / 10);
      const N = nukeRadii(kt);
      const camF = v3().subVectors(tgt, camera.position); camF.y = 0; camF.normalize();
      const dir = v3(-camF.z, 0, camF.x); if (Math.random() < 0.5) dir.negate();
      const perp = v3(-dir.z, 0, dir.x);
      const V = 160, alt = tgt.y + 650, tr = 7;
      const start = tgt.clone().addScaledVector(dir, -V * tr); start.y = alt;
      const plane = A.spawn(makeBomber(), 2.2);
      const pu = plane.userData;
      const st = { t: 0, released: false, exploded: false, bomb: null, chute: null, bombPos: v3(), vel: v3(), planePos: start.clone() };
      audio.drone(18);
      if (game) game.ensureView(N.cloud * 8, N.cloud * 3);
      const boom = () => {
        if (st.exploded) return;
        st.exploded = true;
        if (st.bomb) { A.remove(st.bomb); st.bomb = null; }
        if (st.chute) { A.remove(st.chute); st.chute = null; }
        detonate(A, tgt, { kt, pullback: false });
      };
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t, pp = st.planePos;
          // 투하 후엔 최대 출력으로 상승 이탈
          if (t < tr + 0.5) pp.copy(start).addScaledVector(dir, V * t);
          else { pp.addScaledVector(dir, V * 1.3 * dt); pp.y += 25 * dt; }
          plane.position.copy(pp);
          plane.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
          if (t > tr + 0.5) plane.rotateX(-Math.min(0.25, (t - tr - 0.5) * 0.08));
          const open = Math.min(1, Math.max(0, (t - (tr - 1.5)) / 0.6));
          for (const d of pu.doors) d.hinge.rotation.z = d.s * open * 1.4;
          if (!st.released && t >= tr) {
            st.released = true;
            st.bombPos.copy(pp).add(v3(0, -6, 0)); st.vel.copy(dir).multiplyScalar(V * 0.9);
            st.bomb = A.spawn(makeTsarBomb(), 2.2);
            audio.whoosh(2);
          }
          if (st.bomb && !st.exploded) {
            const tb = t - tr;
            // 1초 자유낙하 뒤 낙하산 전개 → 천천히 내려옴
            if (tb > 1 && !st.chute) { st.chute = A.spawn(makeParachute(), 2.6); audio.whoosh(0.6); }
            const term = st.chute ? 55 : 200;
            st.vel.y -= 9.8 * dt;
            if (st.chute) { st.vel.x *= Math.exp(-dt * 1.2); st.vel.z *= Math.exp(-dt * 1.2); st.vel.y = Math.max(st.vel.y, -term) + (-term - st.vel.y) * Math.min(1, dt * 2); }
            st.bombPos.addScaledVector(st.vel, dt);
            st.bomb.position.copy(st.bombPos);
            st.bomb.quaternion.setFromUnitVectors(v3(0, -1, 0), st.chute ? v3(0, -1, 0) : st.vel.clone().normalize());
            if (st.chute) { st.chute.position.copy(st.bombPos).add(v3(0, 8, 0)); st.chute.rotation.y += dt * 0.3; }
            if (st.bombPos.y - grid.sample(st.bombPos.x, st.bombPos.z) < 160) { tgt.set(st.bombPos.x, grid.sample(st.bombPos.x, st.bombPos.z), st.bombPos.z); boom(); }
          }
          return t < 60 && !(st.exploded && t > tr + 30);
        },
        dispose() { A.remove(plane); if (st.bomb) A.remove(st.bomb); if (st.chute) A.remove(st.chute); },
      });
      if (!A.opts.cinematic || !game) return;
      const fallT = 1 + (alt - tgt.y - 160 - 60) / 55;
      game.cine.play([
        { dur: 3.4, caption: '차르 봄바 · TNT ' + fmtYield(kt), update: (t, u, out) => {
          out.pos.copy(tgt).addScaledVector(perp, 220).addScaledVector(dir, -380); out.pos.y = tgt.y + 8;
          out.look.copy(st.planePos); out.fov = 30; out.smooth = 0.15;
        } },
        { dur: 4.2, update: (t, u, out) => {
          const pp = st.planePos;
          out.pos.copy(pp).addScaledVector(perp, 90).addScaledVector(dir, -40).add(v3(0, -30, 0));
          out.look.copy(st.bomb ? st.bombPos : pp).add(v3(0, 4, 0)); out.fov = 50; out.smooth = 0.12;
        } },
        { dur: Math.max(3, fallT - 2.6), caption: '낙하산 전개', update: (t, u, out) => {
          const bp = st.bomb ? st.bombPos : tgt;
          out.pos.copy(bp).addScaledVector(perp, 150).addScaledVector(dir, 40).add(v3(0, -25, 0));
          out.look.copy(bp).add(v3(0, 28, 0)); out.fov = 50; out.smooth = 0.1;
        } },
        ...aftermathShots(A, tgt, N.cloud, perp.clone().negate()),
      ], { onSkip: () => { if (!st.exploded) { st.released = true; boom(); } } });
    },
  },

  // 반물질 폭탄: 격납 용기 카운트다운 → 소멸 섬광
  antimatter: {
    fire(A, hit) {
      const { fx, audio, grid, game, camera } = A.ctx;
      const S = A.S, p = hit.point;
      const tgt = v3(p.x, grid.sample(p.x, p.z), p.z);
      const kt = nukeYield(S.P) * 25;
      const N = nukeRadii(kt);
      const dev = A.spawn(makeAntimatter(), 2.2);
      dev.position.copy(tgt);
      const U = dev.userData;
      const T = 3.6;
      audio.charge(T);
      const st = { t: 0, done: false };
      A.addActive({
        update(dt) {
          st.t += dt;
          const t = st.t;
          const f = 3 + t * t * 3;
          U.rings.forEach((r, i) => { r.rotation.x += dt * f * (0.6 + i * 0.3); r.rotation.y += dt * f * 0.4; });
          const pulse = 1 + 0.25 * Math.sin(t * f * 2);
          U.orb.scale.setScalar(pulse * (1 + t * 0.3)); U.halo.scale.setScalar(pulse * (1 + t * 0.6));
          U.halo.material.opacity = 0.25 + 0.4 * (t / T);
          fx.light(tgt.x, tgt.y + 15, tgt.z, 4000 + 3e4 * (t / T) ** 2, 300, 0.05, 0xb090ff);
          if (Math.random() < dt * 30) fx.sparks(v3(tgt.x, tgt.y + 15, tgt.z), { x: 0, y: 1, z: 0 }, 3);
          if (t >= T && !st.done) {
            st.done = true; A.remove(dev);
            detonate(A, tgt, { kt, kind: 'anti', pullback: false });
            return false;
          }
          return true;
        },
        dispose() { if (!st.done) A.remove(dev); },
      });
      if (!A.opts.cinematic || !game) return;
      const camF = v3().subVectors(tgt, camera.position); camF.y = 0; camF.normalize();
      const a0 = Math.atan2(-camF.z, -camF.x);
      game.cine.play([
        { dur: T, caption: '반물질 격납 해제 · TNT ' + fmtYield(kt), update: (t, u, out) => {
          const a = a0 + u * 1.2, d = 45 - u * 15;
          out.pos.set(tgt.x + Math.cos(a) * d, tgt.y + 12 + u * 4, tgt.z + Math.sin(a) * d);
          out.look.copy(tgt).add(v3(0, 14, 0)); out.fov = 45 - u * 10; out.timeScale = 1;
        } },
        ...aftermathShots(A, tgt, N.cloud, camF.clone().negate()),
      ], { onSkip: () => { st.t = T; } });
    },
  },
};
