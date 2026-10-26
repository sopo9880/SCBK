// 무기 정의와 투사체
import * as THREE from 'three';

const ICONS = {
  bomb: '<path d="M10 7.5a6.5 6.5 0 1 0 0.01 0z" fill="currentColor"/><path d="M14.5 6.5l2.5-2.5M17 4l1.5-.5M17 4l.5-1.5M17 4l1.2 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  missile: '<path d="M4 20l3-1 9.5-9.5a4 4 0 0 0 1.2-3.9L17 4l-1.6-.7a4 4 0 0 0-3.9 1.2L2 14l3 1 1 3z" fill="currentColor"/><path d="M4 20l-1.5 1.5" stroke="currentColor" stroke-width="1.8"/>',
  laser: '<path d="M12 2v20" stroke="currentColor" stroke-width="3"/><path d="M5 22h14M8 5l-3-2M16 5l3-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  meteor: '<circle cx="15" cy="15" r="5" fill="currentColor"/><path d="M3 3l8 8M7 2l6 6M2 7l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  quake: '<path d="M2 13h4l2-6 3 12 3-15 3 11 2-2h3" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  tornado: '<path d="M3 4h18M5 8h14M7 12h10M9 16h7M11 20h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  blackhole: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="3.5" stroke="currentColor" stroke-width="1.8" fill="none" transform="rotate(-20 12 12)"/>',
  ball: '<circle cx="12" cy="14" r="7" fill="currentColor"/><path d="M12 7V2" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="12" r="1.6" fill="#0003"/>',
  nuke: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 9.8L8.6 3.9a7 7 0 0 1 6.8 0zM14 13.1l6.8 0a7 7 0 0 1-3.4 5.9zM10 13.1l-3.4 5.9a7 7 0 0 1-3.4-5.9z" fill="currentColor"/>',
};

export const WEAPONS = [
  { id: 'bomb', name: '폭탄', key: '1', desc: '하늘에서 떨어지는 고폭탄' },
  { id: 'missile', name: '미사일', key: '2', desc: '카메라에서 발사, 빠르고 정확' },
  { id: 'laser', name: '궤도 레이저', key: '3', desc: '누르고 끌어서 건물을 잘라내기', hold: true },
  { id: 'meteor', name: '운석우', key: '4', desc: '거대 운석과 파편이 쏟아짐' },
  { id: 'quake', name: '지진', key: '5', desc: '저층부부터 무너지는 연쇄 붕괴' },
  { id: 'tornado', name: '토네이도', key: '6', desc: '마우스를 따라 움직이며 빨아올림' },
  { id: 'blackhole', name: '블랙홀', key: '7', desc: '모든 파편을 끌어당겨 삼킴' },
  { id: 'ball', name: '철거 철구', key: '8', desc: '물리로 굴러가며 들이받음' },
  { id: 'nuke', name: '핵폭탄', key: '9', desc: '충격파가 도시 전체로 퍼짐' },
];
export function weaponIcon(id) { return `<svg viewBox="0 0 24 24" width="26" height="26">${ICONS[id]}</svg>`; }

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Arsenal {
  constructor(ctx) {
    this.ctx = ctx; // {scene, D, fx, audio, world, grid, camera, onCrater, getAim}
    this.projectiles = [];
    this.active = [];
    this.power = 1;
    this.current = 'bomb';
    this._laser = null;
    this._crater = [];
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
    this.protos = {
      bomb: (() => {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x3b4a32, roughness: 0.5, metalness: 0.4 });
        const body = mk(new THREE.CapsuleGeometry(0.9, 2.6, 6, 12), mat); g.add(body);
        const fin = new THREE.BoxGeometry(2.4, 1.0, 0.12); fin.translate(0, 1.9, 0);
        g.add(mk(fin, mat)); const f2 = mk(fin, mat); f2.rotation.y = Math.PI / 2; g.add(f2);
        return g;
      })(),
      missile: (() => {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.3 });
        const b = mk(new THREE.CylinderGeometry(0.35, 0.35, 4, 10), mat); b.rotation.x = Math.PI / 2; g.add(b);
        const nose = mk(new THREE.ConeGeometry(0.35, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0xc0392b })); nose.rotation.x = Math.PI / 2; nose.position.z = 2.6; g.add(nose);
        return g;
      })(),
      meteor: (() => {
        const geo = new THREE.IcosahedronGeometry(1, 2);
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i++) { const s = 0.8 + Math.random() * 0.35; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s); }
        geo.computeVertexNormals();
        return mk(geo, new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1, emissive: 0xff5a10, emissiveIntensity: 1.6, flatShading: true }));
      })(),
      nuke: (() => {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x4d5338, roughness: 0.5, metalness: 0.5 });
        g.add(mk(new THREE.CapsuleGeometry(1.8, 5.5, 6, 16), mat));
        const band = mk(new THREE.CylinderGeometry(1.85, 1.85, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xf2c230 })); band.position.y = 1.2; g.add(band);
        const band2 = band.clone(); band2.position.y = -0.6; g.add(band2);
        const fin = new THREE.BoxGeometry(4.6, 1.8, 0.2); fin.translate(0, 3.6, 0);
        g.add(mk(fin, mat)); const f2 = mk(fin, mat); f2.rotation.y = Math.PI / 2; g.add(f2);
        return g;
      })(),
      ball: mk(new THREE.SphereGeometry(1, 28, 20), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.25, metalness: 0.9 })),
    };
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.funnelMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpeed: { value: 2.4 }, uAlpha: { value: 0.75 }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime, uSpeed, uAlpha, uFade; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 q = vec2(vUv.x * 6.0 + uTime * uSpeed + vUv.y * 3.0, vUv.y * 5.0 - uTime * 0.8);
          float s = n(q * vec2(2.0, 1.0)) * 0.6 + n(q * vec2(5.0, 3.0)) * 0.4;
          float rim = 1.0 - abs(dot(vN, vV));
          float a = smoothstep(0.35, 0.8, s) * (0.35 + rim * 0.9) * uAlpha * uFade;
          a *= smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y) * 0.7);
          vec3 c = mix(vec3(0.32, 0.29, 0.26), vec3(0.62, 0.58, 0.53), s);
          gl_FragColor = vec4(c * a, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
  }

  _spawn(proto, scale) { const m = this.protos[proto].clone(); m.scale.setScalar(scale); this.ctx.scene.add(m); return m; }

  fire(hit, cameraPos) {
    const P = this.power, ctx = this.ctx;
    const p = hit.point;
    ctx.audio.resume();
    switch (this.current) {
      case 'bomb': {
        const m = this._spawn('bomb', 1.3 * Math.sqrt(P));
        const start = v3(p.x + 8, p.y + 160, p.z + 4);
        this.projectiles.push({ mesh: m, pos: start, vel: v3(-4, -45, -2), g: 30, kind: 'bomb', trail: 0.6, align: true,
          onHit: (q) => this.blast(q, 23 * P, 32, { vap: 3 * P, crater: [7 * P, 2.6 * P] }) });
        ctx.audio.whoosh(2.2);
        break;
      }
      case 'missile': {
        const m = this._spawn('missile', 1.2);
        const from = cameraPos.clone().add(v3(0, -6, 0));
        const dir = v3(p.x, p.y, p.z).sub(from).normalize();
        this.projectiles.push({ mesh: m, pos: from, vel: dir.multiplyScalar(170), g: 0, kind: 'missile', trail: 1.1, align: true, fire: true,
          onHit: (q) => this.blast(q, 16 * P, 40, { vap: 2 * P, crater: [4.5 * P, 1.6 * P] }) });
        ctx.audio.whoosh(0.8);
        break;
      }
      case 'meteor': {
        const az = Math.random() * Math.PI * 2;
        const dirIn = v3(Math.cos(az) * 0.6, -1, Math.sin(az) * 0.6).normalize();
        const add = (target, size, delay, r, power) => {
          const start = v3(target.x, target.y, target.z).addScaledVector(dirIn, -520);
          setTimeout(() => {
            const m = this._spawn('meteor', size);
            this.projectiles.push({ mesh: m, pos: start, vel: dirIn.clone().multiplyScalar(160 + Math.random() * 40), g: 0, kind: 'meteor', trail: size * 0.9, fire: true, spin: true,
              onHit: (q) => this.blast(q, r, power, { vap: r * 0.25, crater: [r * 0.5, r * 0.22], meteor: true }) });
          }, delay);
        };
        add(p, 7 * Math.sqrt(P), 0, 34 * P, 38);
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 110 * Math.sqrt(P);
          add({ x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d }, 2 + Math.random() * 2.5, 300 + Math.random() * 2600, 12 * P + Math.random() * 6, 30);
        }
        ctx.audio.whoosh(3);
        break;
      }
      case 'quake': {
        this.active.push({ kind: 'quake', x: p.x, z: p.z, t: 0, dur: 8, r: 240 * P, i: 1.0 + 0.3 * P, acc: 0 });
        ctx.fx.ring(p, 240 * P, 1.6, 0xc9a27a, 0.35);
        ctx.audio.rumble(8);
        break;
      }
      case 'tornado': {
        const h = 110 * Math.sqrt(P), r = 46 * P;
        const g = new THREE.Group();
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, 2.5, h, 48, 24, true), this.funnelMat.clone());
        funnel.position.y = h / 2;
        const funnel2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, 1.5, h * 0.95, 40, 20, true), this.funnelMat.clone());
        funnel2.position.y = h * 0.47; funnel2.material.uniforms.uSpeed.value = -1.6; funnel2.material.uniforms.uAlpha.value = 0.55;
        g.add(funnel, funnel2); g.position.set(p.x, p.y, p.z); g.scale.set(0.01, 0.01, 0.01);
        ctx.scene.add(g);
        this.active.push({ kind: 'tornado', x: p.x, z: p.z, y: p.y, t: 0, dur: 18, r, h, vx: 0, vz: 0, acc: 0, group: g, ang: 0, mats: [funnel.material, funnel2.material] });
        ctx.audio.wind(18);
        break;
      }
      case 'blackhole': {
        const y = p.y + 38 + 10 * P;
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        const disk = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.35, 12, 64), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        disk.rotation.x = Math.PI / 2 - 0.35;
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.35, 32, 20), new THREE.MeshBasicMaterial({ color: 0x6a3cff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
        g.add(core, disk, halo); g.position.set(p.x, y, p.z); g.scale.setScalar(0.01);
        ctx.scene.add(g);
        this.active.push({ kind: 'blackhole', x: p.x, y, z: p.z, t: 0, dur: 11, R: 190 * P, core: 7 * Math.sqrt(P), grab: 70 * P, group: g, disk, eaten: 0, acc: 0 });
        ctx.audio.hum(11);
        break;
      }
      case 'ball': {
        const r = 5 * Math.sqrt(P);
        const m = this._spawn('ball', r);
        const from = cameraPos.clone().add(v3(0, -4, 0));
        const dir = v3(p.x, p.y + r, p.z).sub(from);
        const dist = dir.length(); dir.normalize();
        const sp = Math.min(140, 60 + dist * 0.12);
        // 중력 보정 (조준점에 맞도록 위로)
        const tFlight = dist / sp;
        const vel = dir.multiplyScalar(sp); vel.y += 0.5 * 9.81 * tFlight;
        ctx.D.addBall(from, vel, r, m);
        ctx.audio.whoosh(0.6);
        break;
      }
      case 'nuke': {
        const m = this._spawn('nuke', 1.6);
        const start = v3(p.x, p.y + 340, p.z);
        this.projectiles.push({ mesh: m, pos: start, vel: v3(0, -70, 0), g: 18, kind: 'nuke', trail: 0, align: true,
          onHit: (q) => this.nukeHit(q) });
        ctx.audio.whoosh(4);
        break;
      }
    }
  }

  holdStart() { if (this.current === 'laser') { this._laser = { t: 0, acc: 0, mesh: null }; this.ctx.audio.resume(); this.ctx.audio.laserStart(); } }
  holdEnd() {
    if (this._laser) {
      if (this._laser.mesh) { this.ctx.scene.remove(this._laser.mesh); }
      this._laser = null; this.ctx.audio.laserStop();
    }
  }

  blast(q, r, power, o = {}) {
    const { D, fx, audio, world } = this.ctx;
    D.explode({ x: q.x, y: q.y + r * 0.15, z: q.z, r, power, vaporize: o.vap || 0, lift: 0.4, scorch: 0.5 });
    fx.explosion(q, r * 0.75, { ring: q.y - this.ctx.grid.sample(q.x, q.z) < 6 });
    world.paintScorch(q.x, q.z, r * 0.9, 0.85);
    world.blastTrees(q.x, q.z, r * 1.1, r * 0.4);
    if (o.crater) this._crater.push([q.x, q.z, o.crater[0], o.crater[1]]);
    audio.boom(r / 15, this.ctx.camera.position.distanceTo(v3(q.x, q.y, q.z)));
  }

  nukeHit(q) {
    const P = this.power, { D, fx, audio, world } = this.ctx;
    const R = 380 * P;
    fx.nuke(q, R);
    audio.nuke();
    D.explode({ x: q.x, y: q.y + 20, z: q.z, r: 70 * P, power: 70, vaporize: 55 * P, lift: 0.5, lod: 1, scorch: 0.8 });
    world.paintScorch(q.x, q.z, R * 0.55, 0.95);
    world.paintScorch(q.x, q.z, R * 0.95, 0.45);
    world.blastTrees(q.x, q.z, R, R * 0.45);
    this._crater.push([q.x, q.z, 34 * P, 10 * P]);
    fx.ring(q, R * 1.15, 3.2, 0xffe2b0, 0.7);
    this.active.push({ kind: 'shock', x: q.x, y: q.y, z: q.z, t: 0, dur: 3.4, R, prev: 60 * P });
  }

  update(dt, aim) {
    const { D, fx, world, grid } = this.ctx;
    // 투사체
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.vel.y -= pr.g * dt;
      const step = pr.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len || 1);
      const hit = D.raycast(pr.pos, dir, len + 0.5);
      const ground = grid.sample(pr.pos.x, pr.pos.z);
      if (hit || pr.pos.y + step.y < ground) {
        const q = hit ? hit.point : { x: pr.pos.x, y: ground, z: pr.pos.z };
        this.ctx.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
        pr.onHit(q);
        continue;
      }
      pr.pos.add(step);
      pr.mesh.position.copy(pr.pos);
      if (pr.align) pr.mesh.quaternion.setFromUnitVectors(pr.kind === 'missile' ? v3(0, 0, 1) : v3(0, -1, 0), dir);
      if (pr.spin) { pr.mesh.rotation.x += dt * 3; pr.mesh.rotation.z += dt * 2; }
      if (pr.trail) {
        pr.tAcc = (pr.tAcc || 0) + dt;
        while (pr.tAcc > 0.012) { pr.tAcc -= 0.012; fx.trail(pr.pos.clone().addScaledVector(dir, -pr.trail * 1.5 * Math.random()), pr.trail, pr.fire); }
      }
    }
    // 레이저
    if (this._laser && aim) {
      const L = this._laser;
      L.t += dt; L.acc += dt;
      const P = this.power, r = 4.5 * Math.sqrt(P);
      const n = D.laser(aim.x, aim.z, r, dt);
      if (!L.mesh) {
        const g = new THREE.Group();
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), this.beamMat);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 12, 1, true), this.beamCoreMat);
        g.add(outer, inner); L.mesh = g; this.ctx.scene.add(g);
      }
      const top = aim.y + 1500;
      L.mesh.position.set(aim.x, (aim.y + top) / 2, aim.z);
      const w = r * (0.75 + 0.15 * Math.sin(L.t * 40));
      L.mesh.scale.set(w, top - aim.y, w);
      if (L.acc > 0.03) {
        L.acc = 0;
        fx.sparks({ x: aim.x, y: aim.y + 0.5, z: aim.z }, { x: 0, y: 1, z: 0 }, 5);
        fx.smoke.emit(aim.x, aim.y + 1, aim.z, (Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4, 3, r, r * 4, [0.1, 0.1, 0.1, 0.6], [0.3, 0.3, 0.3, 0], 0.5, 1);
        world.paintScorch(aim.x, aim.z, r * 1.2, 0.5);
        if (Math.random() < 0.3) world.blastTrees(aim.x, aim.z, r * 2, r);
        fx.light(aim.x, aim.y + 4, aim.z, 3000, 80, 0.1, 0xff4020);
      }
      fx.addShake(dt * 0.6);
      if (n > 2) this.ctx.audio.crumble(n);
    }
    // 지속형
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      if (a.kind === 'quake') {
        const k = Math.sin(Math.min(1, a.t / a.dur) * Math.PI);
        D.quake(a.x, a.z, a.r, a.i * (0.4 + k), dt);
        fx.addShake(dt * 3 * k);
        a.acc += dt;
        if (a.acc > 0.25) {
          a.acc = 0;
          const ang = Math.random() * 6.28, d = Math.random() * a.r * 0.8;
          const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
          fx.dust({ x, y: grid.sample(x, z), z }, 4);
          if (Math.random() < 0.3) fx.ring({ x: a.x, y: grid.sample(a.x, a.z), z: a.z }, a.r, 1.2, 0xb08a64, 0.2);
        }
      } else if (a.kind === 'tornado') {
        // 커서를 향해 이동
        if (aim) {
          const dx = aim.x - a.x, dz = aim.z - a.z, d = Math.hypot(dx, dz);
          const sp = 16;
          a.vx += ((d > 2 ? dx / d * sp : 0) - a.vx) * dt * 0.8;
          a.vz += ((d > 2 ? dz / d * sp : 0) - a.vz) * dt * 0.8;
        }
        a.x += (a.vx + Math.sin(a.t * 0.7) * 4) * dt; a.z += (a.vz + Math.cos(a.t * 0.9) * 4) * dt;
        a.y = grid.sample(a.x, a.z);
        const k = Math.min(1, a.t / 2) * Math.min(1, (a.dur - a.t) / 2);
        a.group.position.set(a.x, a.y, a.z);
        a.group.scale.set(Math.max(0.01, k), Math.max(0.01, Math.min(1, a.t / 1.2)), Math.max(0.01, k));
        a.group.rotation.z = Math.sin(a.t * 0.6) * 0.08; a.group.rotation.x = Math.cos(a.t * 0.5) * 0.08;
        for (const m of a.mats) { m.uniforms.uTime.value = a.t; m.uniforms.uFade.value = k; }
        D.field({ x: a.x, y: a.y, z: a.z, r: a.r * (0.4 + 0.6 * k), mode: 'vortex', grab: a.r * 0.32 * k, strength: 48 * k, height: a.h }, dt);
        world.blastTrees(a.x, a.z, a.r * 0.3 * k, a.r * 0.2 * k);
        // 깔때기 파티클
        a.acc += dt;
        const rate = 140 * this.ctx.quality.fxScale * k;
        while (a.acc > 1 / Math.max(1, rate)) {
          a.acc -= 1 / Math.max(1, rate);
          const h = Math.random() ** 0.8 * a.h * 1.3;
          const rad = (3 + h * 0.28) * (0.8 + Math.random() * 0.4);
          const ang = Math.random() * 6.28;
          const tx = -Math.sin(ang), tz = Math.cos(ang);
          const g = 0.42 + Math.random() * 0.15;
          fx.smoke.emit(a.x + Math.cos(ang) * rad, a.y + h, a.z + Math.sin(ang) * rad, tx * 30 + a.vx, 6 + Math.random() * 6, tz * 30 + a.vz,
            1.2 + Math.random() * 1.2, 4 + h * 0.08, 10 + h * 0.2, [g, g * 0.97, g * 0.92, 0.55], [0.5, 0.48, 0.46, 0], 0.6, 2, 0.1);
        }
        if (Math.random() < dt * 8) fx.dust({ x: a.x + (Math.random() - 0.5) * 20, y: a.y, z: a.z + (Math.random() - 0.5) * 20 }, 5);
        fx.addShake(dt * 0.25 * k);
      } else if (a.kind === 'blackhole') {
        const grow = Math.min(1, a.t / 1.5), shrink = a.t > a.dur - 0.6 ? Math.max(0, (a.dur - a.t) / 0.6) : 1;
        const s = a.core * grow * shrink;
        a.group.scale.setScalar(Math.max(0.01, s));
        a.disk.rotation.z += dt * 3;
        a.eaten += D.field({ x: a.x, y: a.y, z: a.z, r: a.R * grow, mode: 'gravity', core: a.core * 1.3, grab: a.grab * grow, strength: 55 }, dt);
        world.blastTrees(a.x, a.z, a.grab * 0.5 * grow, a.grab * 0.4 * grow);
        a.acc += dt;
        const rate = 90 * this.ctx.quality.fxScale;
        while (a.acc > 1 / rate) {
          a.acc -= 1 / rate;
          const u = Math.random() * 6.28, rr = a.core * (3 + Math.random() * 4);
          const px = a.x + Math.cos(u) * rr, pz = a.z + Math.sin(u) * rr, py = a.y + (Math.random() - 0.5) * a.core;
          const tx = -Math.sin(u), tz = Math.cos(u);
          fx.fire.emit(px, py, pz, (tx * 1.2 - Math.cos(u) * 0.8) * rr * 1.4, -(py - a.y) * 1.5, (tz * 1.2 - Math.sin(u) * 0.8) * rr * 1.4, 0.6, a.core * 0.5, 0.1,
            [0.6, 0.35, 1, 0.9], [1, 0.5, 0.15, 0], 0, 0);
        }
        fx.addShake(dt * 0.4);
        if (a.t >= a.dur) {
          this.ctx.scene.remove(a.group);
          fx.explosion({ x: a.x, y: a.y, z: a.z }, 30, { smokeColumn: false });
          fx.ring({ x: a.x, y: a.y, z: a.z }, a.R * 0.8, 1.2, 0xb08cff, 0.7, true);
          D.explode({ x: a.x, y: a.y, z: a.z, r: a.R * 0.7, power: 26, lift: 0.1 });
          this.ctx.audio.boom(2, 200);
          this.active.splice(i, 1);
          continue;
        }
      } else if (a.kind === 'shock') {
        const t = Math.min(1, a.t / a.dur);
        const cur = a.R * (1 - (1 - t) ** 2.2);
        if (cur > a.prev) {
          const f = 1 - cur / a.R;
          D.explode({ x: a.x, y: a.y + 10, z: a.z, r: cur, inner: a.prev, power: 18 + 55 * f, lift: 0.18, lod: cur < 160 ? 1 : 2, scorch: 0.5 * f + 0.1, lodBudget: 0, maxFracture: this.ctx.quality.shockFracture });
          fx.addShake(dt * 2 * f);
          // 지면 먼지 띠
          const n = Math.round(10 * this.ctx.quality.fxScale);
          for (let k = 0; k < n; k++) {
            const u = Math.random() * 6.28;
            const x = a.x + Math.cos(u) * cur, z = a.z + Math.sin(u) * cur;
            fx.smoke.emit(x, grid.sample(x, z) + 2, z, Math.cos(u) * 30 * f, 4, Math.sin(u) * 30 * f, 4 + Math.random() * 4, 12, 40, [0.55, 0.5, 0.45, 0.6 * f + 0.1], [0.5, 0.48, 0.46, 0], 0.8, 0.5);
          }
          a.prev = cur;
        }
        if (t >= 1) { this.active.splice(i, 1); continue; }
      }
      if (a.kind !== 'shock' && a.kind !== 'blackhole' && a.t >= a.dur) {
        if (a.group) { this.ctx.scene.remove(a.group); a.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
        this.active.splice(i, 1);
      }
    }
    // 크레이터 반영 (프레임당 한 번)
    if (this._crater.length) {
      for (const [x, z, r, d] of this._crater) grid.crater(x, z, r, d);
      this._crater = [];
      this.ctx.onCrater();
    }
  }

  clear() {
    for (const p of this.projectiles) this.ctx.scene.remove(p.mesh);
    for (const a of this.active) if (a.group) this.ctx.scene.remove(a.group);
    this.projectiles = []; this.active = []; this.holdEnd();
  }
}
