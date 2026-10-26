// 시각 효과: 인스턴스 빌보드 파티클 + 충격파 + 섬광 + 카메라 흔들림
import * as THREE from 'three';
import { makePuffTexture } from './materials.js';

const VS = /* glsl */`
attribute vec4 aPos;   // xyz, size
attribute vec4 aCol;   // rgb, alpha
attribute float aRot;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vUv = uv; vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  mv.xy += p * aPos.w;
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform sampler2D uTex; uniform float uAdd; uniform float uBoost;
varying vec2 vUv; varying vec4 vCol;
void main(){
  float a = texture2D(uTex, vUv).a * vCol.a;
  if (a < 0.003) discard;
  if (uAdd > 0.5) gl_FragColor = vec4(vCol.rgb * uBoost, a);
  else gl_FragColor = vec4(vCol.rgb * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, max, additive, tex) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aRot', this.aRot);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { uTex: { value: tex }, uAdd: { value: additive ? 1 : 0 }, uBoost: { value: 3.2 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (!additive) { this.mat.blending = THREE.CustomBlending; this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 11 : 10;
    scene.add(this.mesh);
    this.geo = g;
    // SoA
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.drag = new Float32Array(max); this.buoy = new Float32Array(max);
    this.rot = new Float32Array(max); this.rotV = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, drag = 0.5, buoy = 0, fadeIn = 0.08) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = Math.floor(Math.random() * this.max);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0.set(c0, i * 4); this.c1.set(c1, i * 4);
    this.drag[i] = drag; this.buoy[i] = buoy; this.rot[i] = Math.random() * 6.28; this.rotV[i] = (Math.random() - 0.5) * 0.8;
    this.fadeIn[i] = fadeIn;
  }
  update(dt) {
    const P = this.aPos.array, C = this.aCol.array, Rr = this.aRot.array;
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this._swap(i, --this.n); continue; }
      const t = this.life[i] / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3;
      this.v[i3] *= d; this.v[i3 + 2] *= d;
      this.v[i3 + 1] = this.v[i3 + 1] * d + this.buoy[i] * dt;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      const ease = 1 - (1 - t) * (1 - t);
      P[i * 4] = this.p[i3]; P[i * 4 + 1] = this.p[i3 + 1]; P[i * 4 + 2] = this.p[i3 + 2];
      P[i * 4 + 3] = this.s0[i] + (this.s1[i] - this.s0[i]) * ease;
      const fin = Math.min(1, this.life[i] / Math.max(0.001, this.fadeIn[i] * this.maxLife[i]));
      for (let k = 0; k < 3; k++) C[i * 4 + k] = this.c0[i * 4 + k] + (this.c1[i * 4 + k] - this.c0[i * 4 + k]) * t;
      C[i * 4 + 3] = (this.c0[i * 4 + 3] + (this.c1[i * 4 + 3] - this.c0[i * 4 + 3]) * t) * fin;
      Rr[i] = this.rot[i];
      i++;
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aRot.needsUpdate = true;
  }
  _swap(a, b) {
    if (a === b) return;
    const sw3 = (arr) => { for (let k = 0; k < 3; k++) arr[a * 3 + k] = arr[b * 3 + k]; };
    const sw4 = (arr) => { for (let k = 0; k < 4; k++) arr[a * 4 + k] = arr[b * 4 + k]; };
    sw3(this.p); sw3(this.v); sw4(this.c0); sw4(this.c1);
    for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.drag, this.buoy, this.rot, this.rotV, this.fadeIn]) arr[a] = arr[b];
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

const R = Math.random;
const rs = (a) => (R() - 0.5) * 2 * a;

export class FX {
  constructor(scene, camera, quality) {
    this.scene = scene; this.camera = camera; this.quality = quality;
    this.tex = makePuffTexture();
    this.smoke = new Particles(scene, quality.particles, false, this.tex);
    this.fire = new Particles(scene, Math.round(quality.particles * 0.7), true, this.tex);
    this.rings = [];
    this.lights = [];
    this.emitters = [];
    this.clouds = [];
    this.shake = 0;
    this.flashEl = document.getElementById('flash');
    this.flash = 0;
    this._lightPool = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 300, 1.6);
      l.castShadow = false; scene.add(l); this._lightPool.push(l);
    }
  }

  addShake(a) { this.shake = Math.min(3.5, this.shake + a); }

  light(x, y, z, intensity, dist, dur, color = 0xffa040) {
    const l = this._lightPool.find(l => !l.userData.busy) || this._lightPool[0];
    l.position.set(x, y, z); l.color.set(color); l.distance = dist;
    l.userData = { busy: true, t: 0, dur, peak: intensity };
    l.intensity = intensity;
  }

  // 일반 폭발
  explosion(p, r, opts = {}) {
    const q = this.quality.fxScale;
    const nFire = Math.round((20 + r * 3) * q), nSmoke = Math.round((16 + r * 2.2) * q);
    for (let i = 0; i < nFire; i++) {
      const u = R() * Math.PI * 2, w = R() * Math.PI * 0.5;
      const sp = r * (0.6 + R() * 1.4);
      this.fire.emit(p.x + rs(r * 0.2), p.y + R() * r * 0.2, p.z + rs(r * 0.2),
        Math.cos(u) * Math.cos(w) * sp, Math.sin(w) * sp * 0.9 + r * 0.3, Math.sin(u) * Math.cos(w) * sp,
        0.5 + R() * 0.7, r * 0.35, r * (0.9 + R() * 0.6),
        [1.0, 0.62, 0.25, 1.0], [0.8, 0.18, 0.03, 0.0], 3.2, 2, 0.05);
    }
    for (let i = 0; i < nSmoke; i++) {
      const u = R() * Math.PI * 2;
      const sp = r * (0.3 + R() * 0.9);
      const g = 0.12 + R() * 0.12;
      this.smoke.emit(p.x + rs(r * 0.3), p.y + R() * r * 0.4, p.z + rs(r * 0.3),
        Math.cos(u) * sp, r * (0.2 + R() * 0.6), Math.sin(u) * sp,
        3 + R() * 5, r * 0.5, r * (1.6 + R() * 1.6),
        [0.55 + g, 0.28 + g * 0.5, 0.1, 0.9], [0.3, 0.29, 0.28, 0.0], 1.3, 1.5, 0.06);
    }
    // 불꽃 파편
    for (let i = 0; i < Math.round(30 * q); i++) {
      const u = R() * Math.PI * 2, sp = r * (1.5 + R() * 2.5);
      this.fire.emit(p.x, p.y + 1, p.z, Math.cos(u) * sp, r * (0.8 + R() * 2), Math.sin(u) * sp, 0.6 + R() * 0.9, 0.6, 0.2,
        [1, 0.8, 0.4, 1], [1, 0.3, 0.05, 0], 0.4, -25, 0.0);
    }
    this.light(p.x, p.y + r * 0.5, p.z, 40 * r, r * 12, 0.6);
    if (opts.ring) this.ring(p, r * 2.2, 0.55, 0xffd9a0, 0.5);
    this.addShake(Math.min(2.2, r / 18));
    if (opts.smokeColumn !== false) this.column(p, r * 0.6, 6 + r * 0.25);
  }

  // 지속 연기 기둥
  column(p, r, dur) { this.emitters.push({ x: p.x, y: p.y, z: p.z, r, t: 0, dur, acc: 0, fire: true }); }

  dust(p, size) {
    const q = this.quality.fxScale;
    for (let i = 0; i < Math.round(5 * q); i++) {
      const g = 0.55 + R() * 0.1;
      this.smoke.emit(p.x + rs(size), p.y + R(), p.z + rs(size), rs(3), 1 + R() * 2, rs(3), 2.5 + R() * 3, size * 1.2, size * 4,
        [g, g * 0.95, g * 0.88, 0.55], [0.6, 0.58, 0.55, 0], 1.6, 0.6, 0.15);
    }
  }

  collapseDust(b) {
    const q = this.quality.fxScale;
    const n = Math.round(Math.min(60, 10 + Math.sqrt(b.area) * 1.5) * q);
    for (let i = 0; i < n; i++) {
      const x = b.minx + R() * (b.maxx - b.minx), z = b.minz + R() * (b.maxz - b.minz);
      const g = 0.6 + R() * 0.08;
      this.smoke.emit(x, b.baseY + R() * 4, z, rs(6), 2 + R() * 4, rs(6), 5 + R() * 6, 6, 22 + R() * 10,
        [g, g * 0.96, g * 0.9, 0.5], [0.62, 0.6, 0.57, 0], 0.8, 0.6, 0.2);
    }
  }

  vaporize(c) {
    if (R() > 0.35 * this.quality.fxScale) return;
    this.fire.emit(c.x, c.y, c.z, rs(4), 4 + R() * 6, rs(4), 0.5 + R() * 0.5, c.size * 1.2, c.size * 3,
      [1, 0.75, 0.4, 0.9], [0.9, 0.2, 0.02, 0], 1.5, 3);
  }

  sparks(p, dir, n = 6) {
    for (let i = 0; i < n; i++) this.fire.emit(p.x, p.y, p.z, dir.x * 10 + rs(14), dir.y * 10 + R() * 14, dir.z * 10 + rs(14), 0.3 + R() * 0.5, 0.5, 0.15,
      [1, 0.9, 0.6, 1], [1, 0.35, 0.05, 0], 0.3, -20, 0);
  }

  trail(p, size = 1.5, fire = true) {
    const g = 0.5 + R() * 0.2;
    this.smoke.emit(p.x + rs(0.3), p.y + rs(0.3), p.z + rs(0.3), rs(0.8), rs(0.8) + 0.5, rs(0.8), 2.5 + R() * 2, size, size * 4,
      [g, g, g, 0.6], [0.7, 0.7, 0.7, 0], 0.8, 0.5, 0.05);
    if (fire) this.fire.emit(p.x, p.y, p.z, rs(1), rs(1), rs(1), 0.25, size * 1.3, size * 0.4, [1, 0.8, 0.45, 1], [1, 0.3, 0.05, 0], 1, 0);
  }

  ring(p, r, dur, color = 0xffffff, alpha = 0.6, vertical = false) {
    const geo = new THREE.RingGeometry(0.85, 1, 64, 1);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, p.y + 1, p.z);
    if (!vertical) m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.rings.push({ m, r, dur, t: 0, alpha });
  }

  // 핵폭발: 화구 + 버섯구름
  nuke(p, R0) {
    this.flash = 1;
    this.light(p.x, p.y + 80, p.z, 4e5, R0 * 8, 3, 0xfff0d0);
    this.addShake(3.5);
    this.clouds.push({ x: p.x, y: p.y, z: p.z, R: R0, t: 0, acc: 0 });
    // 지면 먼지 링
    const q = this.quality.fxScale;
    for (let i = 0; i < Math.round(160 * q); i++) {
      const u = R() * Math.PI * 2, sp = R0 * (0.6 + R() * 0.8);
      const g = 0.5 + R() * 0.15;
      this.smoke.emit(p.x + Math.cos(u) * 20, p.y + 3, p.z + Math.sin(u) * 20, Math.cos(u) * sp, 2 + R() * 6, Math.sin(u) * sp,
        8 + R() * 8, 25, 70 + R() * 50, [g, g * 0.9, g * 0.8, 0.7], [0.55, 0.5, 0.47, 0], 0.55, 0.3, 0.05);
    }
  }

  _updateClouds(dt) {
    const q = this.quality.fxScale;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt; c.acc += dt;
      const R0 = c.R;
      const rise = Math.min(1, c.t / 9);
      const topY = c.y + 30 + rise * R0 * 1.1;
      const rate = c.t < 10 ? 70 * q : c.t < 20 ? 20 * q : 0;
      while (c.acc > 1 / Math.max(1, rate) && rate > 0) {
        c.acc -= 1 / rate;
        // 기둥
        const sh = R() * (topY - c.y);
        const sr = R0 * 0.08 + sh * 0.04;
        const hot = Math.max(0, 1 - c.t / 6);
        this.smoke.emit(c.x + rs(sr), c.y + sh, c.z + rs(sr), rs(3), 8 + R() * 6, rs(3), 6 + R() * 6, R0 * 0.12, R0 * 0.3,
          [0.45 + hot * 0.4, 0.3 + hot * 0.15, 0.22, 0.8], [0.42, 0.38, 0.36, 0], 0.4, 0, 0.1);
        // 갓
        const u = R() * Math.PI * 2, rr = R() ** 0.6 * R0 * (0.25 + rise * 0.45);
        this.smoke.emit(c.x + Math.cos(u) * rr, topY + rs(R0 * 0.08), c.z + Math.sin(u) * rr,
          Math.cos(u) * 5, 3 + R() * 3, Math.sin(u) * 5, 10 + R() * 10, R0 * 0.18, R0 * 0.42,
          [0.7 + hot * 0.3, 0.45 + hot * 0.2, 0.3, 0.85], [0.5, 0.46, 0.44, 0], 0.25, 0.2, 0.08);
        if (c.t < 5) this.fire.emit(c.x + rs(R0 * 0.1), c.y + sh * 0.6, c.z + rs(R0 * 0.1), rs(4), 15 + R() * 10, rs(4), 1.2, R0 * 0.15, R0 * 0.25,
          [1, 0.7, 0.35, 0.9], [0.8, 0.2, 0.02, 0], 0.4, 0);
      }
      if (c.t > 40) this.clouds.splice(i, 1);
    }
  }

  update(dt, camera) {
    this.smoke.update(dt); this.fire.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const t = r.t / r.dur;
      const s = r.r * (1 - (1 - t) ** 3);
      r.m.scale.set(s, s, s);
      r.m.material.opacity = r.alpha * (1 - t);
      if (t >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (const l of this._lightPool) {
      if (!l.userData.busy) continue;
      l.userData.t += dt;
      const t = l.userData.t / l.userData.dur;
      l.intensity = l.userData.peak * Math.max(0, 1 - t) ** 2;
      if (t >= 1) { l.userData.busy = false; l.intensity = 0; }
    }
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]; e.t += dt; e.acc += dt;
      const rate = 6 * this.quality.fxScale * (1 - e.t / e.dur);
      while (rate > 0 && e.acc > 1 / rate) {
        e.acc -= 1 / rate;
        const g = 0.08 + R() * 0.1;
        this.smoke.emit(e.x + rs(e.r), e.y + R() * 2, e.z + rs(e.r), rs(1.5) + 1.5, 4 + R() * 4, rs(1.5), 6 + R() * 6, e.r * 1.5, e.r * 6,
          [g, g, g, 0.7], [0.3, 0.3, 0.3, 0], 0.3, 1.2, 0.1);
        if (e.fire && e.t < e.dur * 0.5 && R() < 0.6) this.fire.emit(e.x + rs(e.r), e.y + R(), e.z + rs(e.r), rs(1), 3 + R() * 3, rs(1), 0.8 + R() * 0.6, e.r * 0.8, e.r * 1.6,
          [1, 0.6, 0.25, 0.8], [0.7, 0.15, 0.02, 0], 0.5, 2);
      }
      if (e.t > e.dur) this.emitters.splice(i, 1);
    }
    this._updateClouds(dt);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 0.7);
      if (this.flashEl) this.flashEl.style.opacity = String(Math.min(1, this.flash * 1.4) * (this.flashMul ?? 1));
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  clear() {
    this.smoke.clear(); this.fire.clear();
    for (const r of this.rings) this.scene.remove(r.m);
    this.rings = []; this.emitters = []; this.clouds = [];
  }

  dispose() {
    this.smoke.dispose(this.scene); this.fire.dispose(this.scene);
    for (const l of this._lightPool) this.scene.remove(l);
    for (const r of this.rings) this.scene.remove(r.m);
    this.tex.dispose();
  }
}
